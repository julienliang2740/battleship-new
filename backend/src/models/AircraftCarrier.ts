import type { ActionKind, PlayerSide, ShipKind } from "@shared/index.js";
import { Ship } from "./Ship.js";

export class AircraftCarrier extends Ship {
  readonly kind: ShipKind = "AIRCRAFT_CARRIER";
  readonly length = 8;
  readonly name = "Aircraft Carrier";

  constructor(side: PlayerSide) {
    super(side);
    this.init();
  }

  defaultQuotas(): Partial<Record<ActionKind, number>> {
    return { SINGLE_HIT: 4 };
  }

  supportedActions(): readonly ActionKind[] {
    return ["SINGLE_HIT"];
  }
}
