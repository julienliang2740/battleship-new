# 03 - Data Models

This doc defines every entity the system uses, in three layers:

1. **Domain types** - implemented independently in each backend, can be mutable,
   and hold private state.
2. **DTOs** - serializable views of domain entities; canonically defined in
   `shared/` and mirrored with Serde types in `backend-rs/src/shared/mod.rs`.
3. **UI state** - browser-only, owned by the frontend reducer.

DTOs are the *only* shapes that cross the wire. Domain types and UI state never do.
The TypeScript interfaces below define the wire contract; the Rust mirror must
serialize to and deserialize from exactly the same JSON shapes.

## Coordinate primitives (`shared/coords.ts`)

```ts
export type Orientation = "horizontal" | "vertical";

/** Cardinal direction, used for Submarine MOVE. */
export type Direction = "N" | "E" | "S" | "W";

/** Either form of a board location; APIs accept the flat `index`. */
export interface Coord {
  row: number;
  col: number;
}
```

The flat cell index is `row * size + col`. Helpers `idx` / `rowCol` exist in
`backend/src/core/coords.ts` and `backend-rs/src/core/coords.rs`; the frontend
has equivalent helpers in `frontend/src/state/types.ts` where convenient.

## Ship (`shared/ships.ts`)

### Enum

```ts
export type ShipKind =
  | "AIRCRAFT_CARRIER"
  | "BATTLESHIP"
  | "CRUISER"
  | "FRIGATE"
  | "SUBMARINE";

export type ActionKind =
  | "SINGLE_HIT"
  | "AREA_HIT_2X2"
  | "MOVE_1"
  | "ROTATE_90";
```

### ShipDTO (sent to the client)

```ts
export interface ShipDTO {
  id: string;             // stable per-game, e.g. "human-CARRIER"
  kind: ShipKind;
  name: string;           // display name
  length: number;
  orientation: Orientation;
  /**
   * Cell indices in board-flat coords.
   *
   * - For your own ships: always populated (you can see them).
   * - For enemy ships: ONLY populated once the ship is sunk.
   *   Otherwise this is an empty array.
   */
  positions: number[];
  /**
   * Cell indices among `positions` that have been hit.
   *
   * - Own ships: full picture.
   * - Enemy ships, not sunk: empty (the cells appear as HIT on the board view).
   * - Enemy ships, sunk: equals `positions`.
   */
  hits: number[];
  sunk: boolean;

  /**
   * Per-turn quotas remaining for this ship, keyed by ActionKind.
   * Only meaningful on your own turn; for enemy ships this is omitted.
   */
  actionsRemaining?: Partial<Record<ActionKind, number>>;
}
```

### Per-turn quotas (both backends)

| ShipKind            | SINGLE_HIT | AREA_HIT_2X2 | MOVE_1 | ROTATE_90 |
| ------------------- | ---------- | ------------ | ------ | --------- |
| `AIRCRAFT_CARRIER`  | 4          | -            | -      | -         |
| `BATTLESHIP`        | -          | 1            | -      | -         |
| `CRUISER`           | 2          | -            | -      | -         |
| `FRIGATE`           | 1          | -            | -      | -         |
| `SUBMARINE`         | 1*         | -            | 1*     | 1*        |

`*` Submarine has a *shared* budget of 1 action per turn across `SINGLE_HIT`,
`MOVE_1`, and `ROTATE_90` - choosing one consumes the slot for the others. This
is enforced by `Submarine.actionsRemaining()`: it returns `{ SINGLE_HIT: 1,
MOVE_1: 1, ROTATE_90: 1 }` at start of turn, but after the first use it returns
`{}`. See `backend/src/models/Submarine.ts` and
`backend-rs/src/models/ship.rs`.

## Board (`shared/board.ts`)

```ts
/** What a viewer knows about a single cell on a board. */
export type CellKnowledge =
  | "UNKNOWN"     // unattacked, no known ship (enemy board default)
  | "SHIP"        // own board: a friendly ship occupies this cell
  | "MISS"        // attacked, no ship
  | "HIT"         // attacked, ship segment damaged but not sunk
  | "SUNK";       // attacked, ship segment of a sunk ship

export interface BoardViewDTO {
  size: number;            // grid edge length (square)
  cells: CellKnowledge[];  // length = size*size
  ships: ShipDTO[];        // see ShipDTO above for visibility rules
}
```

## Actions (`shared/actions.ts`)

### Request

```ts
export interface ActionRequest {
  /** Which of YOUR ships is taking the action. */
  shipId: string;
  kind: ActionKind;
  /**
   * Flat board indices interpreted by the action handler:
   *
   * - SINGLE_HIT:    [enemyCell]
   * - AREA_HIT_2X2:  [enemyTopLeftCell]   (the 2x2 anchor)
   * - MOVE_1:        []                   (use `direction`)
   * - ROTATE_90:     []
   */
  targets: number[];
  /** Required only for MOVE_1. */
  direction?: Direction;
}

export interface EndTurnRequest {
  endTurn: true;
}
```

### Response

```ts
export type GameEvent =
  | { type: "shot"; by: PlayerSide; cell: number; result: "miss" | "hit" }
  | { type: "ship_sunk"; by: PlayerSide; shipKind: ShipKind; cells: number[] }
  | { type: "ship_moved"; side: PlayerSide; shipId: string }
  | { type: "ship_rotated"; side: PlayerSide; shipId: string }
  | { type: "turn_started"; player: PlayerSide }
  | { type: "game_over"; winner: PlayerSide };

export interface ActionResultDTO {
  /** The full post-action game state from the requester's perspective. */
  state: GameStateDTO;
  /** Events that happened as a result of this request, in order.
   *  When the AI takes a follow-up turn, its events are included here too. */
  events: GameEvent[];
}
```

## Game state (`shared/game.ts`)

```ts
export type PlayerSide = "human" | "ai";
export type GamePhase = "placement" | "playing" | "gameover";

export interface PlacementProgress {
  /** ShipKind ordering, e.g. ["AIRCRAFT_CARRIER", ...]. */
  order: ShipKind[];
  /** Index into `order` of the next ship to place; equals order.length when done. */
  nextIndex: number;
}

export interface GameStateDTO {
  gameId: string;
  phase: GamePhase;
  /** Whose turn it is. Only meaningful in "playing". */
  activePlayer: PlayerSide;
  /** Server view of yourself. */
  you: BoardViewDTO;
  /** Filtered view of the enemy. */
  enemy: BoardViewDTO;
  /** Only present in "placement" phase. */
  placement?: PlacementProgress;
  /** Set in "gameover" phase. */
  winner?: PlayerSide;
}
```

## UI state (frontend only)

```ts
export type ActionFlowStep =
  | { step: "idle" }
  | { step: "shipSelected"; shipId: string }
  | { step: "actionArmed"; shipId: string; kind: ActionKind }
  | { step: "targeting"; shipId: string; kind: ActionKind; hovered?: number };

export interface UIState {
  flow: ActionFlowStep;
  toasts: Toast[];
  log: LogEntry[];
}
```

The `GameStateDTO` snapshot is stored alongside `UIState` in the context but is
treated as read-only; only the reducer creates new snapshots when API responses
arrive.
