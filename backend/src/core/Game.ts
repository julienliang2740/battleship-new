import type {
  GameEvent,
  GamePhase,
  Orientation,
  PlacementProgress,
  PlayerSide,
  ShipKind,
  ShipActionRequest,
} from "@shared/index.js";
import { BOARD_SIZE, FLEET_ORDER } from "../config.js";
import { buildFleet } from "../models/ShipFactory.js";
import type { Ship } from "../models/Ship.js";
import { ApiError } from "../api/errors.js";
import { Board } from "./Board.js";
import { Rng } from "./rng.js";
import { getAction } from "./actions/registry.js";

/**
 * Aggregate root: owns the two boards, the rng, the phase, and the
 * placement progress. Mutates itself in response to action requests.
 */
export class Game {
  readonly id: string;
  readonly rng: Rng;
  readonly humanBoard: Board;
  readonly aiBoard: Board;
  readonly placement: PlacementProgress;

  phase: GamePhase = "placement";
  activePlayer: PlayerSide = "human";
  winner?: PlayerSide;

  constructor(id: string, rng: Rng) {
    this.id = id;
    this.rng = rng;
    this.humanBoard = new Board(BOARD_SIZE, "human", buildFleet("human"));
    this.aiBoard = new Board(BOARD_SIZE, "ai", buildFleet("ai"));
    this.placement = { order: [...FLEET_ORDER], nextIndex: 0 };
  }

  // ----- Lookup helpers -------------------------------------------------

  boardFor(side: PlayerSide): Board {
    return side === "human" ? this.humanBoard : this.aiBoard;
  }

  enemyBoardFor(side: PlayerSide): Board {
    return side === "human" ? this.aiBoard : this.humanBoard;
  }

  shipFor(side: PlayerSide, shipId: string): Ship | undefined {
    return this.boardFor(side).ships.find((s) => s.id === shipId);
  }

  // ----- Placement ------------------------------------------------------

  placeHumanShip(kind: ShipKind, anchor: number, orientation: Orientation): void {
    if (this.phase !== "placement") {
      throw new ApiError("WRONG_PHASE", "Ships can only be placed in the placement phase.");
    }
    const expected = this.placement.order[this.placement.nextIndex];
    if (kind !== expected) {
      throw new ApiError(
        "INVALID_PLACE",
        `Expected to place ${expected} next, got ${kind}.`,
      );
    }
    const ship = this.humanBoard.ships.find((s) => s.kind === kind);
    if (!ship) throw new ApiError("INTERNAL", `No ship of kind ${kind} on human board.`);
    try {
      this.humanBoard.placeShip(ship, anchor, orientation);
    } catch (e) {
      throw new ApiError("INVALID_PLACE", (e as Error).message);
    }
    this.placement.nextIndex += 1;
    if (this.placement.nextIndex >= this.placement.order.length) {
      this.phase = "playing";
      this.activePlayer = "human";
      this.resetQuotasFor("human");
    }
  }

  placeHumanRandom(): void {
    if (this.phase !== "placement") {
      throw new ApiError("WRONG_PHASE", "Random placement only allowed in placement phase.");
    }
    // Clear what's there and re-place everything.
    this.humanBoard.clearAllShips();
    this.placement.nextIndex = 0;
    autoPlaceFleet(this.humanBoard, this.rng);
    this.placement.nextIndex = this.placement.order.length;
    this.phase = "playing";
    this.activePlayer = "human";
    this.resetQuotasFor("human");
  }

  resetHumanPlacement(): void {
    if (this.phase !== "placement") {
      throw new ApiError("WRONG_PHASE", "Cannot reset placement once playing.");
    }
    this.humanBoard.clearAllShips();
    this.placement.nextIndex = 0;
  }

  // ----- Action application -------------------------------------------

  applyHumanAction(req: ShipActionRequest): GameEvent[] {
    if (this.phase === "gameover") {
      throw new ApiError("GAME_OVER", "Game has ended.");
    }
    if (this.phase !== "playing") {
      throw new ApiError("WRONG_PHASE", "Actions are only allowed during play.");
    }
    if (this.activePlayer !== "human") {
      throw new ApiError("NOT_YOUR_TURN", "It is not your turn.");
    }
    return this.applyAction("human", req);
  }

  /**
   * Internal action application. Used by both `applyHumanAction` and by the
   * `AIOpponent` which calls this directly under `activePlayer === "ai"`.
   */
  applyAction(side: PlayerSide, req: ShipActionRequest): GameEvent[] {
    const ship = this.shipFor(side, req.shipId);
    if (!ship) throw new ApiError("INVALID_ACTION", `Unknown ship ${req.shipId}.`);
    if (ship.side !== side) {
      throw new ApiError("INVALID_ACTION", "That ship is not yours.");
    }
    if (ship.sunk) {
      throw new ApiError("INVALID_ACTION", `${ship.name} is sunk and cannot act.`);
    }
    if (!ship.supportedActions().includes(req.kind)) {
      throw new ApiError(
        "INVALID_ACTION",
        `${ship.name} does not support action ${req.kind}.`,
      );
    }
    if (!ship.hasQuota(req.kind)) {
      throw new ApiError("NO_QUOTA", `${ship.name} cannot perform ${req.kind} this turn.`);
    }

    const action = getAction(req.kind);
    const ctx = {
      game: this,
      ship,
      ownBoard: this.boardFor(side),
      enemyBoard: this.enemyBoardFor(side),
      request: req,
    };
    action.validate(ctx);
    const events = action.execute(ctx);

    // Check for game-over after every action.
    if (this.enemyBoardFor(side).allShipsSunk()) {
      this.phase = "gameover";
      this.winner = side;
      events.push({ type: "game_over", winner: side });
    }
    return events;
  }

  /**
   * End the human's turn and transition to the AI. Does NOT execute any AI
   * actions; the caller must invoke `ai-step` (one action per call) until the
   * AI has no more quotas, at which point control transitions back to the
   * human automatically via `finishAiTurnIfDone`.
   */
  endHumanTurnTransition(): GameEvent[] {
    if (this.phase !== "playing") {
      throw new ApiError("WRONG_PHASE", "Cannot end turn outside of play.");
    }
    if (this.activePlayer !== "human") {
      throw new ApiError("NOT_YOUR_TURN", "Only the active human turn may be ended this way.");
    }
    // Reset quotas for next time the human plays.
    this.resetQuotasFor("human");
    this.activePlayer = "ai";
    this.resetQuotasFor("ai");
    return [{ type: "turn_started", player: "ai" }];
  }

  /**
   * Transition control back to the human when the AI has nothing left to do.
   * Idempotent; returns the `turn_started: human` event when it actually
   * makes the transition, otherwise returns [].
   */
  finishAiTurnIfDone(): GameEvent[] {
    if (this.phase !== "playing") return [];
    if (this.activePlayer !== "ai") return [];
    if (this.aiHasActionsLeft()) return [];
    this.activePlayer = "human";
    this.resetQuotasFor("human");
    return [{ type: "turn_started", player: "human" }];
  }

  resetQuotasFor(side: PlayerSide): void {
    for (const s of this.boardFor(side).ships) {
      s.resetQuotas();
    }
  }

  // ----- Status helpers -----------------------------------------------

  isOver(): boolean {
    return this.phase === "gameover";
  }

  /** True when the human has at least one usable action across all ships. */
  humanHasActionsLeft(): boolean {
    return this.humanBoard.ships.some(
      (s) => !s.sunk && s.totalActionsLeft() > 0,
    );
  }

  /** True when the AI has at least one usable action across all ships. */
  aiHasActionsLeft(): boolean {
    return this.aiBoard.ships.some(
      (s) => !s.sunk && s.totalActionsLeft() > 0,
    );
  }
}

// ----- Random placement (used by Game and AI) ----------------------------

import { rowCol, shipCells } from "./coords.js";

/**
 * Random rejection-sampling placement. Lives in this file (rather than ai/)
 * because Game uses it for the human "place random" affordance too.
 */
export function autoPlaceFleet(board: Board, rng: Rng): void {
  board.clearAllShips();
  for (const ship of board.ships) {
    let placed = false;
    for (let attempt = 0; attempt < 500 && !placed; attempt++) {
      const orientation: Orientation = rng.nextFloat() < 0.5 ? "horizontal" : "vertical";
      const r = rng.nextInt(board.size);
      const c = rng.nextInt(board.size);
      const cells = shipCells(r, c, ship.length, orientation, board.size);
      if (!cells) continue;
      if (!board.canPlaceCells(cells, ship)) continue;
      // Place via the board to keep cell knowledge in sync.
      const { row, col } = rowCol(cells[0]!, board.size);
      try {
        board.placeShip(ship, cells[0]!, orientation);
        // Anchor in shipCells uses (r,c) directly, which equals positions[0]
        // by construction; we placed via the same coords. Use _row/_col to
        // silence lint about unused.
        void row;
        void col;
        placed = true;
      } catch {
        /* retry */
      }
    }
    if (!placed) {
      // Pathological: start over. Recurse on a clean board.
      board.clearAllShips();
      autoPlaceFleet(board, rng);
      return;
    }
  }
}
