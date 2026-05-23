import type { ShipKind } from "@shared/index.js";

/** Default grid size; 12x12 comfortably fits a length-8 carrier. */
export const BOARD_SIZE = 12;

/** Order of ships in a fleet (used for placement order + fleet listings). */
export const FLEET_ORDER: ShipKind[] = [
  "AIRCRAFT_CARRIER",
  "BATTLESHIP",
  "CRUISER",
  "FRIGATE",
  "SUBMARINE",
];

/** HTTP port. */
export const PORT = Number(process.env.PORT ?? 4000);
