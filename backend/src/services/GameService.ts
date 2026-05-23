import { randomUUID } from "node:crypto";
import type {
  ActionRequest,
  GameEvent,
  GameStateDTO,
  Orientation,
  ShipKind,
} from "@shared/index.js";
import { isEndTurnRequest } from "@shared/index.js";
import { AIOpponent } from "../ai/AIOpponent.js";
import { ApiError } from "../api/errors.js";
import { Game } from "../core/Game.js";
import { Rng } from "../core/rng.js";
import { toGameStateDTO } from "../core/dto.js";
import { GameStore } from "./GameStore.js";

/**
 * Use-case layer. Controllers only call methods on this class.
 *
 * Turn model:
 *   - Human acts via POST /actions (one ship action OR endTurn).
 *   - On endTurn, we transition activePlayer to "ai" but DO NOT play the AI.
 *   - The client then polls POST /ai-step, which executes one AI action per
 *     call and returns its events. When the AI is out of actions, control
 *     transitions back to "human" automatically.
 *
 * Each AI ship has a per-game `AIOpponent` instance keyed by the same RNG
 * stored on the Game. Reusing a fresh AIOpponent each step is harmless
 * because all AI state is derived from the public board view.
 */
export class GameService {
  constructor(private store: GameStore = new GameStore()) {}

  // ----- Lifecycle -----------------------------------------------------

  createGame(seed?: number): GameStateDTO {
    const rng = seed != null ? new Rng(seed) : Rng.random();
    const game = new Game(randomUUID(), rng);
    const ai = new AIOpponent(rng);
    ai.placeFleet(game);
    this.store.create(game);
    return toGameStateDTO(game, "human");
  }

  getView(id: string): GameStateDTO {
    return toGameStateDTO(this.requireGame(id), "human");
  }

  deleteGame(id: string): void {
    this.store.delete(id);
  }

  // ----- Placement ----------------------------------------------------

  placeShip(
    id: string,
    kind: ShipKind,
    anchor: number,
    orientation: Orientation,
  ): GameStateDTO {
    const game = this.requireGame(id);
    game.placeHumanShip(kind, anchor, orientation);
    return toGameStateDTO(game, "human");
  }

  placeRandom(id: string): GameStateDTO {
    const game = this.requireGame(id);
    game.placeHumanRandom();
    return toGameStateDTO(game, "human");
  }

  resetPlacement(id: string): GameStateDTO {
    const game = this.requireGame(id);
    game.resetHumanPlacement();
    return toGameStateDTO(game, "human");
  }

  // ----- Play ---------------------------------------------------------

  applyAction(
    id: string,
    req: ActionRequest,
  ): { state: GameStateDTO; events: GameEvent[] } {
    const game = this.requireGame(id);
    if (game.isOver()) {
      throw new ApiError("GAME_OVER", "Game has ended.");
    }
    if (game.phase !== "playing") {
      throw new ApiError("WRONG_PHASE", "Actions only allowed during play.");
    }

    let events: GameEvent[] = [];
    if (isEndTurnRequest(req)) {
      events = game.endHumanTurnTransition();
    } else {
      events = game.applyHumanAction(req);
      // Auto-end the turn for the human when they have no actions left.
      if (
        !game.isOver() &&
        game.activePlayer === "human" &&
        !game.humanHasActionsLeft()
      ) {
        events = events.concat(game.endHumanTurnTransition());
      }
    }
    return { state: toGameStateDTO(game, "human"), events };
  }

  /**
   * Execute a single AI action. If the AI has nothing left, transitions back
   * to the human and returns the `turn_started` event for the human.
   *
   * Idempotent-ish: if called when it's NOT the AI's turn, returns the
   * current state with empty events.
   */
  aiStep(id: string): { state: GameStateDTO; events: GameEvent[]; aiDone: boolean } {
    const game = this.requireGame(id);
    if (game.isOver()) {
      return {
        state: toGameStateDTO(game, "human"),
        events: [],
        aiDone: true,
      };
    }
    if (game.activePlayer !== "ai") {
      return {
        state: toGameStateDTO(game, "human"),
        events: [],
        aiDone: true,
      };
    }
    const ai = new AIOpponent(game.rng);
    const stepEvents = ai.stepOnce(game);
    const finishEvents = game.finishAiTurnIfDone();
    const aiDone = game.activePlayer !== "ai" || game.isOver();
    return {
      state: toGameStateDTO(game, "human"),
      events: [...stepEvents, ...finishEvents],
      aiDone,
    };
  }

  // ----- helpers ------------------------------------------------------

  private requireGame(id: string): Game {
    const game = this.store.get(id);
    if (!game) throw new ApiError("NOT_FOUND", `No game with id ${id}`);
    return game;
  }
}
