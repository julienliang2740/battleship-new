import type { FleetMetaDTO, PlayerSide, ShipKind, ShipMetaDTO } from "@shared/index.js";
import { BOARD_SIZE, FLEET_ORDER } from "../config.js";
import { AircraftCarrier } from "./AircraftCarrier.js";
import { Battleship } from "./Battleship.js";
import { Cruiser } from "./Cruiser.js";
import { Frigate } from "./Frigate.js";
import type { Ship } from "./Ship.js";
import { Submarine } from "./Submarine.js";

export function createShip(kind: ShipKind, side: PlayerSide): Ship {
  switch (kind) {
    case "AIRCRAFT_CARRIER":
      return new AircraftCarrier(side);
    case "BATTLESHIP":
      return new Battleship(side);
    case "CRUISER":
      return new Cruiser(side);
    case "FRIGATE":
      return new Frigate(side);
    case "SUBMARINE":
      return new Submarine(side);
  }
}

/** Build a full fleet for the given side in canonical order. */
export function buildFleet(side: PlayerSide): Ship[] {
  return FLEET_ORDER.map((k) => createShip(k, side));
}

/** Metadata for `GET /api/meta/fleet`. */
export function fleetMeta(): FleetMetaDTO {
  const ships: ShipMetaDTO[] = FLEET_ORDER.map((kind) => {
    const tmp = createShip(kind, "human");
    const meta: ShipMetaDTO = {
      kind,
      name: tmp.name,
      length: tmp.length,
      actions: tmp.defaultQuotas(),
    };
    if (kind === "SUBMARINE") meta.sharedBudget = 1;
    return meta;
  });
  return { boardSize: BOARD_SIZE, ships };
}
