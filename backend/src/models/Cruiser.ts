import type { ActionKind, PlayerSide, ShipKind } from "@shared/index.js";
import { Ship } from "./Ship.js";

export class Cruiser extends Ship {
  readonly kind: ShipKind = "CRUISER";
  readonly length = 4;
  readonly name = "Cruiser";

  constructor(side: PlayerSide) {
    super(side);
    this.init();
  }

  defaultQuotas(): Partial<Record<ActionKind, number>> {
    return { SINGLE_HIT: 2 };
  }

  supportedActions(): readonly ActionKind[] {
    return ["SINGLE_HIT"];
  }
}
