import type { ActionKind, GameEvent } from "@shared/index.js";
import { ApiError } from "../../api/errors.js";
import type { Action, ActionContext } from "./Action.js";

export class Move1 implements Action {
  readonly kind: ActionKind = "MOVE_1";

  validate(ctx: ActionContext): void {
    if (!ctx.request.direction) {
      throw new ApiError("BAD_REQUEST", "MOVE_1 requires a 'direction' field.");
    }
    const d = ctx.request.direction;
    if (d !== "N" && d !== "S" && d !== "E" && d !== "W") {
      throw new ApiError("BAD_REQUEST", `Invalid direction: ${d}`);
    }
    // Try-and-rollback would be simpler, but Board.moveShip already validates;
    // we delegate to it in execute() and catch.
  }

  execute(ctx: ActionContext): GameEvent[] {
    try {
      ctx.ownBoard.moveShip(ctx.ship, ctx.request.direction!);
    } catch (e) {
      throw new ApiError("INVALID_TARGET", (e as Error).message);
    }
    ctx.ship.consumeQuota(this.kind);
    return [{ type: "ship_moved", side: ctx.ship.side, shipId: ctx.ship.id }];
  }
}
