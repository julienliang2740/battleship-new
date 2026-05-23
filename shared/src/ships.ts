import type { Orientation } from "./coords.js";

/**
 * The five ship classes that exist in this game. The string values are stable
 * identifiers shared between the frontend and backend.
 */
export type ShipKind =
  | "AIRCRAFT_CARRIER"
  | "BATTLESHIP"
  | "CRUISER"
  | "FRIGATE"
  | "SUBMARINE";

/** Every action a ship may take during a turn. */
export type ActionKind =
  | "SINGLE_HIT"
  | "AREA_HIT_2X2"
  | "MOVE_1"
  | "ROTATE_90";

/**
 * Server-rendered view of a single ship.
 *
 * Visibility rules:
 *
 * - For YOUR own ships: every field is fully populated.
 * - For ENEMY ships:
 *   - `positions` and `hits` are empty arrays until the ship is sunk.
 *   - Once sunk, `positions` and `hits` are populated (hits == positions).
 *   - `actionsRemaining` is omitted entirely.
 */
export interface ShipDTO {
  /** Stable per-game identifier, e.g. "human-AIRCRAFT_CARRIER". */
  id: string;
  kind: ShipKind;
  /** Human-readable name. */
  name: string;
  length: number;
  orientation: Orientation;
  positions: number[];
  hits: number[];
  sunk: boolean;
  actionsRemaining?: Partial<Record<ActionKind, number>>;
}

/** Static description of a ship class, returned by `GET /api/meta/fleet`. */
export interface ShipMetaDTO {
  kind: ShipKind;
  name: string;
  length: number;
  /** Default per-turn quotas. */
  actions: Partial<Record<ActionKind, number>>;
  /**
   * If set, the ship has a single shared budget across the listed actions
   * (e.g. the Submarine: 1 total action across SINGLE_HIT / MOVE_1 / ROTATE_90).
   * The number is the shared budget size.
   */
  sharedBudget?: number;
}

export interface FleetMetaDTO {
  boardSize: number;
  ships: ShipMetaDTO[];
}
