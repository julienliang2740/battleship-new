import type { ActionKind, PlayerSide, ShipKind } from "@shared/index.js";
import { Ship } from "./Ship.js";

/**
 * Special ship: starts each turn with a shared budget of 1 action across
 * SINGLE_HIT, MOVE_1, ROTATE_90. Using any of them ends the submarine's turn.
 */
export class Submarine extends Ship {
  readonly kind: ShipKind = "SUBMARINE";
  readonly length = 2;
  readonly name = "Submarine";

  constructor(side: PlayerSide) {
    super(side);
    this.init();
  }

  defaultQuotas(): Partial<Record<ActionKind, number>> {
    return { SINGLE_HIT: 1, MOVE_1: 1, ROTATE_90: 1 };
  }

  supportedActions(): readonly ActionKind[] {
    return ["SINGLE_HIT", "MOVE_1", "ROTATE_90"];
  }

  /** Override: spending any action zeroes ALL action quotas this turn. */
  consumeQuota(kind: ActionKind): void {
    if (!this.hasQuota(kind)) {
      throw new Error(`Submarine ${this.id} cannot ${kind}`);
    }
    this.quotas = {};
  }
}
