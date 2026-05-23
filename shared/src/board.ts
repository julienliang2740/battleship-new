import type { ShipDTO } from "./ships.js";

/**
 * What a viewer (the requesting player) knows about a single cell of a board.
 *
 * - `UNKNOWN`: unattacked and (on enemy boards) ship presence is unknown.
 * - `SHIP`:    only ever appears on the OWNER's view, marking their own ship.
 * - `MISS`:    attacked, contained no ship.
 * - `HIT`:     attacked, ship segment damaged but the ship is still afloat.
 * - `SUNK`:    attacked, ship segment of a now-sunk ship (revealed footprint).
 */
export type CellKnowledge = "UNKNOWN" | "SHIP" | "MISS" | "HIT" | "SUNK";

export interface BoardViewDTO {
  size: number;
  /** Length = size * size. Indexed by `row * size + col`. */
  cells: CellKnowledge[];
  ships: ShipDTO[];
}
