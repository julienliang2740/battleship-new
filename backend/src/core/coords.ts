import type { Direction, Orientation } from "@shared/index.js";

export function idx(row: number, col: number, size: number): number {
  return row * size + col;
}

export function rowCol(index: number, size: number): { row: number; col: number } {
  return { row: Math.floor(index / size), col: index % size };
}

export function inBounds(row: number, col: number, size: number): boolean {
  return row >= 0 && row < size && col >= 0 && col < size;
}

/**
 * Compute the cells occupied by a ship anchored at (startRow, startCol).
 * Returns null if the ship would exit the board.
 */
export function shipCells(
  startRow: number,
  startCol: number,
  length: number,
  orientation: Orientation,
  size: number,
): number[] | null {
  const cells: number[] = [];
  for (let i = 0; i < length; i++) {
    const r = orientation === "horizontal" ? startRow : startRow + i;
    const c = orientation === "horizontal" ? startCol + i : startCol;
    if (!inBounds(r, c, size)) return null;
    cells.push(idx(r, c, size));
  }
  return cells;
}

/** 4-neighborhood for a flat cell index. */
export function neighbors(cell: number, size: number): number[] {
  const { row, col } = rowCol(cell, size);
  const out: number[] = [];
  if (row > 0) out.push(idx(row - 1, col, size));
  if (row < size - 1) out.push(idx(row + 1, col, size));
  if (col > 0) out.push(idx(row, col - 1, size));
  if (col < size - 1) out.push(idx(row, col + 1, size));
  return out;
}

/**
 * Expand a 2x2 anchored at the top-left `anchor`. Returns all 4 cell indices
 * that are in bounds (skipping any that fall off). Returns the full 4 cells
 * when the anchor is at `(row<size-1, col<size-1)`.
 */
export function expand2x2(anchor: number, size: number): number[] {
  const { row, col } = rowCol(anchor, size);
  const out: number[] = [];
  for (let dr = 0; dr < 2; dr++) {
    for (let dc = 0; dc < 2; dc++) {
      const r = row + dr;
      const c = col + dc;
      if (inBounds(r, c, size)) out.push(idx(r, c, size));
    }
  }
  return out;
}

/** Unit vector for a cardinal direction. */
export function delta(dir: Direction): { dr: number; dc: number } {
  switch (dir) {
    case "N":
      return { dr: -1, dc: 0 };
    case "S":
      return { dr: 1, dc: 0 };
    case "W":
      return { dr: 0, dc: -1 };
    case "E":
      return { dr: 0, dc: 1 };
  }
}
