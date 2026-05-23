import type { ActionKind, GameEvent } from "@shared/index.js";
import { ApiError } from "../../api/errors.js";
import type { Action, ActionContext } from "./Action.js";

export class SingleHit implements Action {
  readonly kind: ActionKind = "SINGLE_HIT";

  validate(ctx: ActionContext): void {
    const { request, enemyBoard } = ctx;
    if (request.targets.length !== 1) {
      throw new ApiError("INVALID_TARGET", "SINGLE_HIT expects exactly one target cell.");
    }
    const cell = request.targets[0]!;
    if (cell < 0 || cell >= enemyBoard.size * enemyBoard.size) {
      throw new ApiError("INVALID_TARGET", "Target cell out of bounds.");
    }
    // Reject obviously wasted shots so the UI can't accidentally burn a quota.
    const knowledge = enemyBoard.toEnemyView().cells[cell];
    if (knowledge === "MISS" || knowledge === "HIT" || knowledge === "SUNK") {
      throw new ApiError("INVALID_TARGET", "That cell has already been attacked.");
    }
  }

  execute(ctx: ActionContext): GameEvent[] {
    const cell = ctx.request.targets[0]!;
    const events = ctx.enemyBoard.applyHits([cell], ctx.ship.side);
    ctx.ship.consumeQuota(this.kind);
    return events;
  }
}
