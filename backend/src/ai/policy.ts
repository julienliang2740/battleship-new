import type { Direction, ShipActionRequest } from "@shared/index.js";
import type { Game } from "../core/Game.js";
import type { Ship } from "../models/Ship.js";
import { rowCol } from "../core/coords.js";
import { Targeter, missCenter } from "./targeting.js";

/** Decide the next single action for a non-submarine ship. */
export function pickAttackAction(
  ship: Ship,
  targeter: Targeter,
): ShipActionRequest | null {
  // For aircraft carrier / cruiser / frigate (SINGLE_HIT only).
  if (ship.hasQuota("SINGLE_HIT")) {
    const target = targeter.bestSingleTarget();
    if (target < 0) return null;
    return { shipId: ship.id, kind: "SINGLE_HIT", targets: [target] };
  }
  // Battleship (AREA_HIT_2X2 only).
  if (ship.hasQuota("AREA_HIT_2X2")) {
    const { anchor } = targeter.bestAreaTarget();
    return { shipId: ship.id, kind: "AREA_HIT_2X2", targets: [anchor] };
  }
  return null;
}

/**
 * Pick a single action for the submarine: hit, move, or rotate. The submarine
 * has only one action per turn (shared budget); this function is called at
 * most once.
 */
export function pickSubmarineAction(
  game: Game,
  submarine: Ship,
  targeter: Targeter,
): ShipActionRequest | null {
  if (!submarine.hasQuota("SINGLE_HIT")) return null; // no budget

  // Decide between SINGLE_HIT vs evasive action.
  const enemyView = game.aiBoard.toEnemyView(); // what HUMAN sees of AI
  const subCells = submarine.positions;
  // Count how many cells adjacent to the submarine the HUMAN has attacked
  // (those tell us the human is "feeling around" us).
  let pressure = 0;
  for (const cell of subCells) {
    const { row, col } = rowCol(cell, enemyView.size);
    for (const [dr, dc] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as const) {
      const r = row + dr;
      const c = col + dc;
      if (r < 0 || r >= enemyView.size || c < 0 || c >= enemyView.size) continue;
      const k = enemyView.cells[r * enemyView.size + c];
      if (k === "MISS" || k === "HIT") pressure += 1;
    }
  }

  // If the submarine is itself damaged, it's already been spotted.
  const damaged = submarine.hits.size > 0;

  // Heuristic: under heavy pressure or damaged, try evasion.
  if ((pressure >= 3 || damaged) && tryEvade(game, submarine) != null) {
    const choice = tryEvade(game, submarine)!;
    return choice;
  }

  // Otherwise, attack.
  const target = targeter.bestSingleTarget();
  if (target < 0) return null;
  return { shipId: submarine.id, kind: "SINGLE_HIT", targets: [target] };
}

/**
 * Try to find a legal move/rotate for the submarine. Move is preferred over
 * rotate because moving disrupts the human's targeting more.
 */
function tryEvade(game: Game, submarine: Ship): ShipActionRequest | null {
  // Move away from the most-attacked side (use miss-center as proxy).
  const myView = game.aiBoard.toEnemyView();
  const center = missCenter(myView);
  const subAnchor = submarine.positions[0]!;
  const { row: sr, col: sc } = rowCol(subAnchor, myView.size);

  const candidates: Direction[] = [];
  if (center) {
    // Move opposite to the centroid direction.
    if (sr < center.row) candidates.push("N");
    else candidates.push("S");
    if (sc < center.col) candidates.push("W");
    else candidates.push("E");
  } else {
    // No data: try cardinal order N E S W.
    candidates.push("N", "E", "S", "W");
  }
  for (const d of candidates) {
    if (canMove(game, submarine, d)) {
      return { shipId: submarine.id, kind: "MOVE_1", targets: [], direction: d };
    }
  }
  if (canRotate(game, submarine)) {
    return { shipId: submarine.id, kind: "ROTATE_90", targets: [] };
  }
  return null;
}

function canMove(game: Game, submarine: Ship, dir: Direction): boolean {
  // Simulate by trying canPlace with translated cells.
  const size = game.aiBoard.size;
  const offset = (() => {
    switch (dir) {
      case "N":
        return -size;
      case "S":
        return size;
      case "W":
        return -1;
      case "E":
        return 1;
    }
  })();
  const newCells = submarine.positions.map((c) => c + offset);
  // Bounds: dir N/S keeps column constant; E/W keeps row constant.
  for (let i = 0; i < submarine.positions.length; i++) {
    const oldRC = rowCol(submarine.positions[i]!, size);
    const newRC = rowCol(newCells[i]!, size);
    if (dir === "E" || dir === "W") {
      if (oldRC.row !== newRC.row) return false; // wrapped
      if (newRC.col < 0 || newRC.col >= size) return false;
    }
    if (dir === "N" || dir === "S") {
      if (oldRC.col !== newRC.col) return false;
      if (newRC.row < 0 || newRC.row >= size) return false;
    }
  }
  if (!game.aiBoard.canPlaceCells(newCells, submarine)) return false;
  // Destination cells must currently be UNKNOWN/SHIP from the AI's perspective.
  for (const c of newCells) {
    const k = game.aiBoard.cells[c];
    if (k === "MISS" || k === "HIT" || k === "SUNK") return false;
  }
  return true;
}

function canRotate(game: Game, submarine: Ship): boolean {
  const anchor = submarine.positions[0]!;
  const size = game.aiBoard.size;
  const newOrient = submarine.orientation === "horizontal" ? "vertical" : "horizontal";
  const cells: number[] = [];
  for (let i = 0; i < submarine.length; i++) {
    const { row, col } = rowCol(anchor, size);
    const r = newOrient === "horizontal" ? row : row + i;
    const c = newOrient === "horizontal" ? col + i : col;
    if (r < 0 || r >= size || c < 0 || c >= size) return false;
    cells.push(r * size + c);
  }
  if (!game.aiBoard.canPlaceCells(cells, submarine)) return false;
  for (let i = 1; i < cells.length; i++) {
    const k = game.aiBoard.cells[cells[i]!];
    if (k === "MISS" || k === "HIT" || k === "SUNK") return false;
  }
  return true;
}
