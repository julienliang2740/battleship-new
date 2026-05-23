import type { ActionKind, PlayerSide, ShipKind } from "@shared/index.js";
import { Ship } from "./Ship.js";

export class Frigate extends Ship {
  readonly kind: ShipKind = "FRIGATE";
  readonly length = 3;
  readonly name = "Frigate";

  constructor(side: PlayerSide) {
    super(side);
    this.init();
  }

  defaultQuotas(): Partial<Record<ActionKind, number>> {
    return { SINGLE_HIT: 1 };
  }

  supportedActions(): readonly ActionKind[] {
    return ["SINGLE_HIT"];
  }
}
