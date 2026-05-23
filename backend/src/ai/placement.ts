import { autoPlaceFleet } from "../core/Game.js";
import type { Board } from "../core/Board.js";
import type { Rng } from "../core/rng.js";

/** Place the entire AI fleet randomly on `board`. */
export function placeAiFleet(board: Board, rng: Rng): void {
  autoPlaceFleet(board, rng);
}
