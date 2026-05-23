import type { ActionKind, GameEvent, ShipActionRequest } from "@shared/index.js";
import type { Board } from "../Board.js";
import type { Game } from "../Game.js";
import type { Ship } from "../../models/Ship.js";

export interface ActionContext {
  game: Game;
  /** The ship taking the action. Always belongs to the active player. */
  ship: Ship;
  /** The active player's own board (where the ship lives). */
  ownBoard: Board;
  /** The opponent's board (target of attacks). */
  enemyBoard: Board;
  request: ShipActionRequest;
}

export interface Action {
  readonly kind: ActionKind;
  /** Validate the request shape and legality. Throws ApiError on failure. */
  validate(ctx: ActionContext): void;
  /**
   * Execute the action. Must call `ctx.ship.consumeQuota(this.kind)` and emit
   * the relevant events. Assumes `validate` was just called.
   */
  execute(ctx: ActionContext): GameEvent[];
}
