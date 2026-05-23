import type { ActionKind, GameEvent } from "@shared/index.js";
import { ApiError } from "../../api/errors.js";
import type { Action, ActionContext } from "./Action.js";

export class Rotate90 implements Action {
  readonly kind: ActionKind = "ROTATE_90";

  validate(_ctx: ActionContext): void {
    /* no extra payload to check */
  }

  execute(ctx: ActionContext): GameEvent[] {
    try {
      ctx.ownBoard.rotateShip(ctx.ship);
    } catch (e) {
      throw new ApiError("INVALID_TARGET", (e as Error).message);
    }
    ctx.ship.consumeQuota(this.kind);
    return [{ type: "ship_rotated", side: ctx.ship.side, shipId: ctx.ship.id }];
  }
}
