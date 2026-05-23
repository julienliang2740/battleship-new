import type {
  BoardViewDTO,
  CellKnowledge,
  Direction,
  GameEvent,
  Orientation,
  PlayerSide,
} from "@shared/index.js";
import type { Ship } from "../models/Ship.js";
import { delta, idx, inBounds, rowCol, shipCells } from "./coords.js";

/**
 * A player's board. Owns:
 *   - The grid of cell knowledge from THIS player's (the owner's) perspective.
 *   - The ordered list of this player's ships.
 *
 * `applyHits` is the sole entry point for damage resolution.
 */
export class Board {
  readonly size: number;
  readonly side: PlayerSide;
  readonly ships: Ship[];
  /** Owner's view: SHIP cells are visible; MISS/HIT/SUNK are the public truth. */
  cells: CellKnowledge[];

  constructor(size: number, side: PlayerSide, ships: Ship[]) {
    this.size = size;
    this.side = side;
    this.ships = ships;
    this.cells = Array<CellKnowledge>(size * size).fill("UNKNOWN");
  }

  // ----- Placement -------------------------------------------------------

  /** Reset the board to the empty state and clear every ship's positions. */
  clearAllShips(): void {
    this.cells = Array<CellKnowledge>(this.size * this.size).fill("UNKNOWN");
    for (const s of this.ships) {
      s.positions = [];
      s.hits = new Set();
      s.orientation = "horizontal";
      s.resetQuotas();
    }
  }

  /**
   * Whether `ship` could be placed at the given anchor and orientation.
   * Optionally ignores a single ship (used by move/rotate which want to ignore
   * the moving ship's current cells).
   */
  canPlace(
    ship: Ship,
    anchor: number,
    orientation: Orientation,
    ignoreShip?: Ship,
  ): boolean {
    const { row, col } = rowCol(anchor, this.size);
    const cells = shipCells(row, col, ship.length, orientation, this.size);
    if (!cells) return false;
    return this.canPlaceCells(cells, ignoreShip);
  }

  canPlaceCells(cells: number[], ignoreShip?: Ship): boolean {
    const occupied = new Set<number>();
    for (const other of this.ships) {
      if (other === ignoreShip) continue;
      for (const c of other.positions) occupied.add(c);
    }
    for (const c of cells) {
      if (occupied.has(c)) return false;
    }
    return true;
  }

  /** Place `ship` at the given anchor. Throws if illegal. */
  placeShip(ship: Ship, anchor: number, orientation: Orientation): void {
    const { row, col } = rowCol(anchor, this.size);
    const cells = shipCells(row, col, ship.length, orientation, this.size);
    if (!cells) throw new Error("Ship would go off the board");
    if (!this.canPlaceCells(cells, ship)) throw new Error("Ship overlaps another");
    ship.positions = cells;
    ship.orientation = orientation;
    ship.hits = new Set();
    for (const c of cells) this.cells[c] = "SHIP";
  }

  // ----- Submarine moves -------------------------------------------------

  /**
   * Try to translate `ship` by 1 cell in `direction`. Throws if the resulting
   * placement is illegal.
   *
   * Cell knowledge handling:
   * - The vacated cells: their owner-view state is rewritten based on whether
   *   they were previously attacked. We track this via `this.cells` which is
   *   the owner's view: a SHIP cell that the enemy never attacked becomes
   *   UNKNOWN; a HIT cell becomes MISS (the enemy "remembers" the attack
   *   landed on water once the ship moved away).
   * - The new cells: an UNKNOWN cell becomes SHIP. If the enemy had previously
   *   attacked a cell in the destination (impossible because canPlaceCells
   *   doesn't exclude MISS/HIT cells deliberately -- they remain on the board
   *   and *can* legally house a sub now), we treat it as: MISS stays MISS but
   *   we record an immediate HIT on the submarine for that cell.
   *
   * For simplicity and to satisfy the spec, this implementation:
   *   - Vacated SHIP cells -> UNKNOWN.
   *   - Vacated HIT cells -> MISS (the historical hit was on water that is
   *     now empty; the enemy view (which is what they observe) shows MISS,
   *     which is consistent with truth).
   *   - Destination must be UNKNOWN cells only; we disallow moving INTO a
   *     previously-attacked cell to keep semantics clean. This is the
   *     least-surprising behavior and matches the spec's "must remain in
   *     bounds and not overlap another ship" + the implicit assumption that
   *     the sub can't teleport hits.
   *
   * Hits the submarine already took stay attached to specific positions
   * (translated by the same delta).
   */
  moveShip(ship: Ship, direction: Direction): void {
    if (ship.positions.length === 0) throw new Error("Ship not placed");
    const { dr, dc } = delta(direction);
    const newPositions: number[] = [];
    for (const cell of ship.positions) {
      const { row, col } = rowCol(cell, this.size);
      const nr = row + dr;
      const nc = col + dc;
      if (!inBounds(nr, nc, this.size)) throw new Error("Move out of bounds");
      newPositions.push(idx(nr, nc, this.size));
    }
    if (!this.canPlaceCells(newPositions, ship)) {
      throw new Error("Move blocked by another ship");
    }
    // Destination cells must currently be UNKNOWN on the owner view.
    for (const c of newPositions) {
      if (this.cells[c] !== "UNKNOWN") {
        throw new Error("Cannot move into previously attacked cell");
      }
    }

    // Translate hits: hit on positions[i] -> hit on newPositions[i].
    const newHits = new Set<number>();
    for (let i = 0; i < ship.positions.length; i++) {
      if (ship.hits.has(ship.positions[i]!)) newHits.add(newPositions[i]!);
    }

    // Update owner-view cell knowledge.
    for (const c of ship.positions) {
      // If the enemy had hit this cell, the historical knowledge is MISS now.
      if (ship.hits.has(c)) this.cells[c] = "MISS";
      else this.cells[c] = "UNKNOWN";
    }
    for (const c of newPositions) this.cells[c] = "SHIP";

    ship.positions = newPositions;
    ship.hits = newHits;
  }

  /**
   * Rotate `ship` 90 degrees around its first cell. Toggles
   * horizontal<->vertical. Throws if the new placement is illegal or would
   * land on a previously-attacked cell.
   */
  rotateShip(ship: Ship): void {
    if (ship.positions.length === 0) throw new Error("Ship not placed");
    const anchor = ship.positions[0]!;
    const newOrientation: Orientation =
      ship.orientation === "horizontal" ? "vertical" : "horizontal";
    const { row, col } = rowCol(anchor, this.size);
    const cells = shipCells(row, col, ship.length, newOrientation, this.size);
    if (!cells) throw new Error("Rotation out of bounds");
    if (!this.canPlaceCells(cells, ship)) {
      throw new Error("Rotation blocked by another ship");
    }
    for (const c of cells) {
      // Anchor cell is reused; allow it to keep its current state.
      if (c === anchor) continue;
      if (this.cells[c] !== "UNKNOWN") {
        throw new Error("Cannot rotate into previously attacked cell");
      }
    }

    // Translate hits by index in positions[]. anchor is index 0; we keep its
    // hit status. Other indices map 1:1 because length and indexing are
    // preserved.
    const newHits = new Set<number>();
    for (let i = 0; i < ship.positions.length; i++) {
      if (ship.hits.has(ship.positions[i]!)) newHits.add(cells[i]!);
    }

    // Vacate old cells (other than anchor) according to their hit state.
    for (let i = 1; i < ship.positions.length; i++) {
      const c = ship.positions[i]!;
      if (ship.hits.has(c)) this.cells[c] = "MISS";
      else this.cells[c] = "UNKNOWN";
    }
    // Occupy new cells.
    for (const c of cells) this.cells[c] = "SHIP";

    ship.positions = cells;
    ship.hits = newHits;
    ship.orientation = newOrientation;
  }

  // ----- Damage resolution ----------------------------------------------

  /**
   * Apply an attack on this board (this is the DEFENDER's board). Returns
   * an ordered list of events for each effect: `shot`, then any `ship_sunk`.
   *
   * Repeated hits on the same cell are silently no-op'd (no event emitted).
   */
  applyHits(cells: number[], by: PlayerSide): GameEvent[] {
    const events: GameEvent[] = [];
    const dedup = new Set<number>();
    for (const cell of cells) {
      if (cell < 0 || cell >= this.size * this.size) continue;
      if (dedup.has(cell)) continue;
      dedup.add(cell);

      const before = this.cells[cell];
      if (before === "MISS" || before === "HIT" || before === "SUNK") {
        // No-op: never wastes a re-shot cell on the player.
        continue;
      }

      if (before === "SHIP") {
        const ship = this.shipAt(cell);
        if (!ship) {
          // Should not happen, but defensive: treat as miss.
          this.cells[cell] = "MISS";
          events.push({ type: "shot", by, cell, result: "miss" });
          continue;
        }
        ship.hits.add(cell);
        if (ship.sunk) {
          for (const c of ship.positions) this.cells[c] = "SUNK";
          events.push({ type: "shot", by, cell, result: "hit" });
          events.push({
            type: "ship_sunk",
            by,
            shipKind: ship.kind,
            cells: [...ship.positions],
          });
        } else {
          this.cells[cell] = "HIT";
          events.push({ type: "shot", by, cell, result: "hit" });
        }
      } else {
        // UNKNOWN
        this.cells[cell] = "MISS";
        events.push({ type: "shot", by, cell, result: "miss" });
      }
    }
    return events;
  }

  shipAt(cell: number): Ship | undefined {
    return this.ships.find((s) => s.positions.includes(cell));
  }

  allShipsSunk(): boolean {
    return this.ships.length > 0 && this.ships.every((s) => s.sunk);
  }

  /** All ships placed? */
  allShipsPlaced(): boolean {
    return this.ships.length > 0 && this.ships.every((s) => s.positions.length === s.length);
  }

  // ----- DTOs -----------------------------------------------------------

  /** Full view, intended for the owner of this board. */
  toOwnerView(): BoardViewDTO {
    return {
      size: this.size,
      cells: this.cells.slice(),
      ships: this.ships.map((s) => s.toDTO(true)),
    };
  }

  /**
   * Filtered view for the OPPONENT of this board. SHIP cells are collapsed
   * back to UNKNOWN (unless they appear via MISS/HIT/SUNK from prior attacks).
   * Enemy ships are listed but unhit ones expose no positions.
   */
  toEnemyView(): BoardViewDTO {
    const cells = this.cells.map<CellKnowledge>((c) => (c === "SHIP" ? "UNKNOWN" : c));
    return {
      size: this.size,
      cells,
      ships: this.ships.map((s) => s.toDTO(false)),
    };
  }
}
