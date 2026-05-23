import type { GameEvent, ShipKind } from "@shared/index.js";
import type { Game } from "../core/Game.js";
import type { Rng } from "../core/rng.js";
import type { Ship } from "../models/Ship.js";
import { placeAiFleet } from "./placement.js";
import { pickAttackAction, pickSubmarineAction } from "./policy.js";
import { Targeter } from "./targeting.js";

/**
 * The AI player. Plays one action per call to `stepOnce()`, allowing the
 * frontend to animate each AI action separately. The order is deterministic
 * (see `SHIP_ORDER`) so the user can anticipate what's happening.
 */
const SHIP_ORDER: ShipKind[] = [
  "BATTLESHIP",
  "AIRCRAFT_CARRIER",
  "CRUISER",
  "FRIGATE",
  "SUBMARINE",
];

export class AIOpponent {
  constructor(private rng: Rng) {}

  placeFleet(game: Game): void {
    placeAiFleet(game.aiBoard, this.rng);
  }

  /**
   * Pick the next alive AI ship that still has actions, in canonical order.
   */
  private nextShip(game: Game): Ship | undefined {
    for (const kind of SHIP_ORDER) {
      const s = game.aiBoard.ships.find((x) => x.kind === kind);
      if (!s) continue;
      if (s.sunk) continue;
      if (s.totalActionsLeft() <= 0) continue;
      return s;
    }
    return undefined;
  }

  /**
   * Execute exactly one AI action. Returns the events for that action, or
   * an empty array when the AI has nothing left to do this turn.
   *
   * Caller is responsible for calling `Game.finishAiTurnIfDone()` afterwards
   * to transition control back to the human when appropriate.
   */
  stepOnce(game: Game): GameEvent[] {
    if (game.isOver()) return [];
    const ship = this.nextShip(game);
    if (!ship) return [];

    const targeter = new Targeter(game.humanBoard.toEnemyView());

    const req =
      ship.kind === "SUBMARINE"
        ? pickSubmarineAction(game, ship, targeter)
        : pickAttackAction(ship, targeter);
    if (!req) {
      // Shouldn't normally happen if totalActionsLeft > 0; defensively zero
      // the ship's quotas to make progress and avoid spinning forever.
      ship.quotas = {};
      return [];
    }
    try {
      return game.applyAction("ai", req);
    } catch {
      // Bad target chosen; zero the quota for that kind so we move on.
      try {
        ship.consumeQuota(req.kind);
      } catch {
        ship.quotas = {};
      }
      return [];
    }
  }
}
