import type { ActionKind, GameEvent } from "@shared/index.js";
import { ApiError } from "../../api/errors.js";
import { expand2x2, rowCol } from "../coords.js";
import type { Action, ActionContext } from "./Action.js";

export class AreaHit2x2 implements Action {
  readonly kind: ActionKind = "AREA_HIT_2X2";

  validate(ctx: ActionContext): void {
    const { request, enemyBoard } = ctx;
    if (request.targets.length !== 1) {
      throw new ApiError(
        "INVALID_TARGET",
        "AREA_HIT_2X2 expects exactly one anchor cell (top-left of 2x2).",
      );
    }
    const anchor = request.targets[0]!;
    if (anchor < 0 || anchor >= enemyBoard.size * enemyBoard.size) {
      throw new ApiError("INVALID_TARGET", "Anchor cell out of bounds.");
    }
    const { row, col } = rowCol(anchor, enemyBoard.size);
    if (row >= enemyBoard.size - 1 || col >= enemyBoard.size - 1) {
      throw new ApiError(
        "INVALID_TARGET",
        "The 2x2 region would extend off the board; pick an anchor with row<size-1 and col<size-1.",
      );
    }
    const cells = expand2x2(anchor, enemyBoard.size);
    const view = enemyBoard.toEnemyView().cells;
    const unattacked = cells.filter(
      (c) => view[c] === "UNKNOWN",
    );
    if (unattacked.length === 0) {
      throw new ApiError(
        "INVALID_TARGET",
        "Every cell in that 2x2 has already been attacked.",
      );
    }
  }

  execute(ctx: ActionContext): GameEvent[] {
    const anchor = ctx.request.targets[0]!;
    const cells = expand2x2(anchor, ctx.enemyBoard.size);
    const events = ctx.enemyBoard.applyHits(cells, ctx.ship.side);
    ctx.ship.consumeQuota(this.kind);
    return events;
  }
}
