import type {
  ActionKind,
  Orientation,
  PlayerSide,
  ShipDTO,
  ShipKind,
} from "@shared/index.js";

/**
 * Abstract base class for all ship types. Holds shared state (positions, hits,
 * per-turn action quotas) and delegates per-class details (length, name,
 * default quotas, supported actions) to subclasses.
 */
export abstract class Ship {
  abstract readonly kind: ShipKind;
  abstract readonly length: number;
  abstract readonly name: string;

  readonly side: PlayerSide;
  /** Stable per-game identifier, e.g. "human-AIRCRAFT_CARRIER". */
  readonly id: string;

  orientation: Orientation = "horizontal";
  /** Flat cell indices ordered along the ship's body. */
  positions: number[] = [];
  /** Subset of `positions` that have been hit. */
  hits: Set<number> = new Set();
  /** Per-turn action quotas; mutated as actions are spent. */
  quotas: Partial<Record<ActionKind, number>> = {};

  constructor(side: PlayerSide) {
    this.side = side;
    // Concrete subclasses haven't initialized `kind` yet at super() time.
    // We can't reference `this.kind` here, so subclasses must call `init()`.
    this.id = ""; // filled by init()
  }

  /** Called by subclasses at the end of their constructor. */
  protected init(): void {
    // Mutate id post-hoc since `kind` is not available in the base ctor.
    (this as { id: string }).id = `${this.side}-${this.kind}`;
    this.resetQuotas();
  }

  abstract defaultQuotas(): Partial<Record<ActionKind, number>>;
  abstract supportedActions(): readonly ActionKind[];

  /** Copy defaultQuotas() into the live `quotas` object. Called per turn. */
  resetQuotas(): void {
    this.quotas = { ...this.defaultQuotas() };
  }

  /**
   * Whether the ship has at least one use of `kind` left this turn AND `kind`
   * is a supported action for this ship.
   */
  hasQuota(kind: ActionKind): boolean {
    if (!this.supportedActions().includes(kind)) return false;
    return (this.quotas[kind] ?? 0) > 0;
  }

  /** Subtract one from the quota for `kind`. Subclasses may override. */
  consumeQuota(kind: ActionKind): void {
    const left = this.quotas[kind] ?? 0;
    if (left <= 0) throw new Error(`Ship ${this.id} has no quota for ${kind}`);
    this.quotas[kind] = left - 1;
  }

  /** Total number of actions left this turn (sum of all kinds). */
  totalActionsLeft(): number {
    let n = 0;
    for (const k of this.supportedActions()) n += this.quotas[k] ?? 0;
    return n;
  }

  get sunk(): boolean {
    return this.length > 0 && this.hits.size === this.length;
  }

  /**
   * Returns a fresh DTO. `ownerView` controls whether private fields
   * (positions, hits, quotas) are exposed.
   */
  toDTO(ownerView: boolean): ShipDTO {
    const dto: ShipDTO = {
      id: this.id,
      kind: this.kind,
      name: this.name,
      length: this.length,
      orientation: this.orientation,
      positions: [],
      hits: [],
      sunk: this.sunk,
    };
    if (ownerView) {
      dto.positions = [...this.positions];
      dto.hits = [...this.hits];
      dto.actionsRemaining = { ...this.quotas };
    } else if (this.sunk) {
      // Enemy view: only reveal sunk ships' footprints.
      dto.positions = [...this.positions];
      dto.hits = [...this.positions];
    }
    return dto;
  }
}
