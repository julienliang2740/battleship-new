import type { Direction } from "./coords.js";
import type { ActionKind, ShipKind } from "./ships.js";
import type { PlayerSide } from "./game.js";

/**
 * Body of `POST /api/games/:id/actions` when the player wants to take a ship action.
 *
 * Targets interpretation by `kind`:
 * - `SINGLE_HIT`:   `targets = [cellIndex]`   on enemy board
 * - `AREA_HIT_2X2`: `targets = [topLeftCell]` anchor of the 2x2 region (enemy board)
 * - `MOVE_1`:       `targets = []`, `direction` is required
 * - `ROTATE_90`:    `targets = []`
 */
export interface ShipActionRequest {
  shipId: string;
  kind: ActionKind;
  targets: number[];
  direction?: Direction;
}

/** Body of `POST /api/games/:id/actions` to end the current turn. */
export interface EndTurnRequest {
  endTurn: true;
}

export type ActionRequest = ShipActionRequest | EndTurnRequest;

export function isEndTurnRequest(req: ActionRequest): req is EndTurnRequest {
  return (req as EndTurnRequest).endTurn === true;
}

/**
 * Events emitted by the backend in response to a single API call. Both the
 * player's own events and the AI's follow-up turn events arrive in one stream.
 */
export type GameEvent =
  | { type: "shot"; by: PlayerSide; cell: number; result: "miss" | "hit" }
  | { type: "ship_sunk"; by: PlayerSide; shipKind: ShipKind; cells: number[] }
  | { type: "ship_moved"; side: PlayerSide; shipId: string }
  | { type: "ship_rotated"; side: PlayerSide; shipId: string }
  | { type: "turn_started"; player: PlayerSide }
  | { type: "game_over"; winner: PlayerSide };
