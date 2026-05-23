import type { BoardViewDTO, ShipKind } from "@shared/index.js";
import { FLEET_ORDER } from "../config.js";
import { idx, rowCol, expand2x2 } from "../core/coords.js";

/**
 * Targeter: derives shot priorities from an enemy BoardViewDTO. The AI calls
 * `update(view)` before each shot so density reflects the latest knowledge.
 */
export class Targeter {
  /** Last known enemy view. */
  view!: BoardViewDTO;
  /** Cells with HIT status that haven't yet been part of a SUNK ship. */
  activeHits: number[] = [];

  /** Length of every remaining (unsunk) enemy ship. */
  remainingSizes: number[] = [];

  /** Probability density per cell, recomputed in `update`. */
  density: number[] = [];

  constructor(view: BoardViewDTO) {
    this.update(view);
  }

  update(view: BoardViewDTO): void {
    this.view = view;
    this.activeHits = [];
    for (let i = 0; i < view.cells.length; i++) {
      if (view.cells[i] === "HIT") this.activeHits.push(i);
    }
    // Remaining ship sizes = full roster minus those whose kind has been sunk.
    const sunkKinds = new Set<ShipKind>(
      view.ships.filter((s) => s.sunk).map((s) => s.kind),
    );
    const all = lengthForEach();
    const remaining: number[] = [];
    for (const k of FLEET_ORDER) {
      if (!sunkKinds.has(k)) remaining.push(all[k]);
    }
    this.remainingSizes = remaining;
    this.density = this.computeDensity();
  }

  /** Single-cell densest unattacked cell. */
  bestSingleTarget(): number {
    const view = this.view;
    let best = -1;
    let bestScore = -1;
    for (let i = 0; i < view.cells.length; i++) {
      if (view.cells[i] !== "UNKNOWN") continue;
      const s = this.density[i] ?? 0;
      if (s > bestScore) {
        bestScore = s;
        best = i;
      }
    }
    // Fallback: any unattacked cell.
    if (best < 0) {
      for (let i = 0; i < view.cells.length; i++) {
        if (view.cells[i] === "UNKNOWN") return i;
      }
    }
    return best;
  }

  /**
   * Best 2x2 anchor by sum-of-density over its 4 cells. Cells outside the
   * board are penalized; cells that are already attacked contribute 0.
   */
  bestAreaTarget(): { anchor: number; score: number } {
    const size = this.view.size;
    let bestAnchor = -1;
    let bestScore = -Infinity;
    for (let r = 0; r < size - 1; r++) {
      for (let c = 0; c < size - 1; c++) {
        const anchor = idx(r, c, size);
        const cells = expand2x2(anchor, size);
        let score = 0;
        let unattacked = 0;
        for (const cell of cells) {
          if (this.view.cells[cell] === "UNKNOWN") {
            score += this.density[cell] ?? 0;
            unattacked += 1;
          }
        }
        // Require at least 2 unattacked cells to make the 2x2 worth firing.
        if (unattacked < 2) continue;
        if (score > bestScore) {
          bestScore = score;
          bestAnchor = anchor;
        }
      }
    }
    if (bestAnchor < 0) {
      // Fallback: lowest legal anchor with at least 1 unattacked cell.
      for (let r = 0; r < size - 1; r++) {
        for (let c = 0; c < size - 1; c++) {
          const anchor = idx(r, c, size);
          const cells = expand2x2(anchor, size);
          if (cells.some((cc) => this.view.cells[cc] === "UNKNOWN")) {
            return { anchor, score: 0 };
          }
        }
      }
      // Truly nothing left. Default to (0,0).
      return { anchor: 0, score: 0 };
    }
    return { anchor: bestAnchor, score: bestScore };
  }

  private computeDensity(): number[] {
    const size = this.view.size;
    const density = new Array<number>(size * size).fill(0);
    const targetMode = this.activeHits.length > 0;
    const hitSet = new Set(this.activeHits);

    const blocked = (cell: number) =>
      this.view.cells[cell] === "MISS" || this.view.cells[cell] === "SUNK";

    for (const shipSize of this.remainingSizes) {
      // Horizontal placements.
      for (let r = 0; r < size; r++) {
        for (let c = 0; c <= size - shipSize; c++) {
          let ok = true;
          let overlapsHit = false;
          for (let k = 0; k < shipSize; k++) {
            const cell = idx(r, c + k, size);
            if (blocked(cell)) {
              ok = false;
              break;
            }
            if (hitSet.has(cell)) overlapsHit = true;
          }
          if (!ok) continue;
          if (targetMode && !overlapsHit) continue;
          for (let k = 0; k < shipSize; k++) {
            const cell = idx(r, c + k, size);
            if (this.view.cells[cell] !== "UNKNOWN") continue;
            density[cell] = (density[cell] ?? 0) + 1;
          }
        }
      }
      // Vertical placements.
      for (let c = 0; c < size; c++) {
        for (let r = 0; r <= size - shipSize; r++) {
          let ok = true;
          let overlapsHit = false;
          for (let k = 0; k < shipSize; k++) {
            const cell = idx(r + k, c, size);
            if (blocked(cell)) {
              ok = false;
              break;
            }
            if (hitSet.has(cell)) overlapsHit = true;
          }
          if (!ok) continue;
          if (targetMode && !overlapsHit) continue;
          for (let k = 0; k < shipSize; k++) {
            const cell = idx(r + k, c, size);
            if (this.view.cells[cell] !== "UNKNOWN") continue;
            density[cell] = (density[cell] ?? 0) + 1;
          }
        }
      }
    }
    return density;
  }
}

// Static lookup: ShipKind -> default length. We avoid importing the Ship
// classes here to keep this module dependency-light.
function lengthForEach(): Record<ShipKind, number> {
  return {
    AIRCRAFT_CARRIER: 8,
    BATTLESHIP: 6,
    CRUISER: 4,
    FRIGATE: 3,
    SUBMARINE: 2,
  };
}

/** Get the row-col of the center of mass of MISS cells (for sub evasion). */
export function missCenter(view: BoardViewDTO): { row: number; col: number } | null {
  let sumR = 0;
  let sumC = 0;
  let n = 0;
  for (let i = 0; i < view.cells.length; i++) {
    if (view.cells[i] === "MISS" || view.cells[i] === "HIT") {
      const { row, col } = rowCol(i, view.size);
      sumR += row;
      sumC += col;
      n += 1;
    }
  }
  if (n === 0) return null;
  return { row: sumR / n, col: sumC / n };
}
