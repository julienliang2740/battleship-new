import type { ActionKind } from "@shared/index.js";
import type { Action } from "./Action.js";
import { AreaHit2x2 } from "./AreaHit2x2.js";
import { Move1 } from "./Move1.js";
import { Rotate90 } from "./Rotate90.js";
import { SingleHit } from "./SingleHit.js";

const _registry: Record<ActionKind, Action> = {
  SINGLE_HIT: new SingleHit(),
  AREA_HIT_2X2: new AreaHit2x2(),
  MOVE_1: new Move1(),
  ROTATE_90: new Rotate90(),
};

export function getAction(kind: ActionKind): Action {
  return _registry[kind];
}
