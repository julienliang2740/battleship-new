import type { ActionKind, PlayerSide, ShipKind } from "@shared/index.js";
import { Ship } from "./Ship.js";

export class Battleship extends Ship {
  readonly kind: ShipKind = "BATTLESHIP";
  readonly length = 6;
  readonly name = "Battleship";

  constructor(side: PlayerSide) {
    super(side);
    this.init();
  }

  defaultQuotas(): Partial<Record<ActionKind, number>> {
    return { AREA_HIT_2X2: 1 };
  }

  supportedActions(): readonly ActionKind[] {
    return ["AREA_HIT_2X2"];
  }
}
