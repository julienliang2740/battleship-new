# 05 - Backend Modules

## File map

```
backend/src/
├── server.ts              entrypoint - parses PORT, calls app.listen
├── app.ts                 createApp(): Express, JSON parser, routes, errors
├── config.ts              BOARD_SIZE, FLEET roster, default AI seed
│
├── api/
│   ├── index.ts           buildRouter(deps): combines sub-routers
│   ├── gameRoutes.ts      maps URL -> controller methods
│   ├── gameController.ts  thin: parse req, call service, serialize res
│   ├── errors.ts          ApiError class, errorHandler middleware
│   └── validators.ts      requireField, asInt, asEnum etc.
│
├── services/
│   ├── GameStore.ts       Map<gameId, Game> with get/save/delete
│   └── GameService.ts     application use-cases (createGame, placeShip,
│                          placeRandom, applyAction, endTurn, getView)
│
├── core/
│   ├── coords.ts          idx, rowCol, neighbors, inBounds, expand2x2
│   ├── rng.ts             Rng class (mulberry32) + factory
│   ├── Board.ts           Board: cells, ship list, placement, attack
│   ├── Game.ts            Game aggregate root
│   ├── dto.ts             toGameStateDTO(game, viewer): GameStateDTO
│   └── actions/
│       ├── Action.ts        interface Action + ActionContext + ActionResult
│       ├── SingleHit.ts
│       ├── AreaHit2x2.ts
│       ├── Move1.ts
│       ├── Rotate90.ts
│       └── registry.ts      ActionKind -> Action instance
│
├── models/
│   ├── Ship.ts            abstract base
│   ├── AircraftCarrier.ts
│   ├── Battleship.ts
│   ├── Cruiser.ts
│   ├── Frigate.ts
│   ├── Submarine.ts
│   └── ShipFactory.ts     buildFleet(side): Ship[]
│
└── ai/
    ├── AIOpponent.ts      stepOnce(game): GameEvent[]  // one action/call
    ├── placement.ts       autoPlaceFleet(board, rng)
    ├── targeting.ts       probability-density grid over an enemy view
    └── policy.ts          pickAction(aliveShips, enemyView, rng)
```

## Core classes

### `Ship` (abstract, `models/Ship.ts`)

```ts
abstract class Ship {
  readonly id: string;                // e.g. "human-CARRIER"
  readonly kind: ShipKind;
  readonly side: PlayerSide;
  abstract readonly length: number;
  abstract readonly name: string;

  orientation: Orientation = "horizontal";
  positions: number[] = [];          // flat indices, ordered along the ship
  hits: Set<number> = new Set();     // values are from positions[]

  // Per-turn quotas - subclasses override.
  abstract defaultQuotas(): Partial<Record<ActionKind, number>>;

  // Mutable quotas this turn. Reset at start of owner's turn.
  quotas: Partial<Record<ActionKind, number>> = {};

  // Whether the ship can perform this action right now (quota > 0).
  hasQuota(kind: ActionKind): boolean;
  consumeQuota(kind: ActionKind): void;
  resetQuotas(): void;               // copies defaultQuotas() into quotas

  // Status.
  get sunk(): boolean { return this.hits.size === this.length; }

  // Returns the action kinds this ship can perform AT ALL (catalogue).
  abstract supportedActions(): ActionKind[];

  // DTO projection. `ownerView=true` includes positions/hits/quotas.
  toDTO(ownerView: boolean): ShipDTO;
}
```

Subclasses set `length`, `name`, override `defaultQuotas()` and
`supportedActions()`. The `Submarine` additionally overrides `consumeQuota` to
implement the shared-1-action budget: any single use zeroes all three quotas.

### `Board` (`core/Board.ts`)

```ts
class Board {
  readonly size: number;
  readonly side: PlayerSide;
  readonly ships: Ship[];                  // ordered: carrier, battleship, ...
  // Cell knowledge from the OWNER's perspective.
  cells: CellKnowledge[];

  constructor(size: number, side: PlayerSide, ships: Ship[]);

  // Placement
  placeShip(ship: Ship, anchor: number, orientation: Orientation): void;
  canPlace(ship: Ship, anchor: number, orientation: Orientation): boolean;

  // Resolution. Returns events for cells affected.
  applyHits(cells: number[], by: PlayerSide): GameEvent[];

  // Submarine helpers.
  moveShip(ship: Ship, direction: Direction): void;     // throws on illegal
  rotateShip(ship: Ship): void;

  allShipsSunk(): boolean;

  // Owner's full board view (with ship positions).
  toOwnerView(): BoardViewDTO;
  // Enemy's filtered view (only revealed knowledge).
  toEnemyView(): BoardViewDTO;
}
```

`applyHits` is the only place where `CellKnowledge` transitions are written.
It computes for each cell whether it's a miss / hit / re-hit, then for any
newly-fully-damaged ship promotes the ship's cells to `SUNK` and emits a
`ship_sunk` event.

> The Board keeps two parallel "views" of itself:
> - `cells: CellKnowledge[]` is the **owner's** view (always knows where their
>   own ships are; combines that with what the enemy has attacked).
> - The **enemy's** view is derived on demand by `toEnemyView()`, which collapses
>   any unattacked `SHIP` cells back into `UNKNOWN`.

### `Game` (`core/Game.ts`)

```ts
class Game {
  readonly id: string;
  phase: GamePhase = "placement";
  activePlayer: PlayerSide = "human";
  winner?: PlayerSide;

  readonly humanBoard: Board;
  readonly aiBoard: Board;
  readonly placement: PlacementProgress;   // tracks human placement only
  readonly rng: Rng;

  constructor(id: string, rng: Rng);

  // Placement
  placeHumanShip(kind: ShipKind, anchor: number, orient: Orientation): GameEvent[];
  placeHumanRandom(): GameEvent[];
  resetHumanPlacement(): void;

  // Play
  applyHumanAction(req: ActionRequest): GameEvent[];   // throws ApiError

  // Turn transitions
  endHumanTurnTransition(): GameEvent[];     // human -> ai (no AI play yet)
  finishAiTurnIfDone(): GameEvent[];         // ai -> human when AI is out

  // Quota status
  humanHasActionsLeft(): boolean;
  aiHasActionsLeft(): boolean;

  // Helpers
  isOver(): boolean;
  boardFor(side: PlayerSide): Board;
  shipFor(side: PlayerSide, shipId: string): Ship | undefined;
}
```

`applyHumanAction` looks up the `Action` strategy in `core/actions/registry.ts`
and calls `action.execute(ctx)`. The strategy is responsible for validating its
own targets, mutating the board, and consuming the ship's quota.

Turn flow:

1. `endHumanTurnTransition()` flips `activePlayer` from `"human"` to `"ai"`,
   resets human quotas (for next time) and AI quotas (for this turn). It
   emits a single `turn_started: ai` event. It does NOT execute any AI
   actions - the client drives those via `POST /api/games/:id/ai-step`.
2. Each `ai-step` call invokes `AIOpponent.stepOnce(game)`, which executes
   exactly one AI ship-action. Afterwards, `finishAiTurnIfDone()` is called
   which transitions back to the human (emitting `turn_started: human`)
   iff the AI has no actions left.

This split is what gives the frontend its per-action animation cadence.

### Action handlers (`core/actions/`)

```ts
export interface ActionContext {
  game: Game;
  ship: Ship;            // attacker / actor
  ownBoard: Board;
  enemyBoard: Board;
  request: ActionRequest;
}

export interface Action {
  readonly kind: ActionKind;
  validate(ctx: ActionContext): void;   // throws ApiError on invalid
  execute(ctx: ActionContext): GameEvent[];
}
```

This is a textbook Strategy pattern. To add a new ability (e.g. torpedo line):
1. Create `core/actions/Torpedo.ts` implementing `Action`.
2. Register it in `core/actions/registry.ts`.
3. Add the `ActionKind` to `shared/ships.ts`.
4. Give the relevant Ship subclass a quota in `defaultQuotas()` and add the
   kind to `supportedActions()`.

No other module changes.

### `Rng` (`core/rng.ts`)

`mulberry32`-based PRNG with `nextFloat()`, `nextInt(maxExcl)`,
`pick<T>(arr: T[])`, `shuffle<T>(arr: T[]): T[]`. Constructor takes a 32-bit
seed; `Rng.random()` factory uses `Math.random` based entropy.

## Services

### `GameStore`

```ts
class GameStore {
  private games = new Map<string, Game>();
  get(id: string): Game | undefined;
  create(game: Game): void;
  delete(id: string): void;
}
```

### `GameService`

Application orchestrator. The controller layer only ever calls `GameService`.

```ts
class GameService {
  constructor(private store: GameStore);

  createGame(seed?: number): Game;
  getView(id: string): GameStateDTO;       // throws NOT_FOUND
  placeHumanShip(id: string, kind: ShipKind, anchor: number,
                 orientation: Orientation): GameStateDTO;
  placeHumanRandom(id: string): GameStateDTO;
  resetHumanPlacement(id: string): GameStateDTO;
  applyAction(id: string, req: ActionRequest | EndTurnRequest):
    { state: GameStateDTO; events: GameEvent[] };
  deleteGame(id: string): void;
}
```

`applyAction` is the **only** mutator that may produce a long event stream
(when the AI gets its turn).

## API layer

`gameRoutes.ts` mounts:

```
POST   /api/games
GET    /api/games/:id
DELETE /api/games/:id
POST   /api/games/:id/place
POST   /api/games/:id/place-random
POST   /api/games/:id/reset-placement
POST   /api/games/:id/actions
GET    /api/meta/fleet
```

`gameController.ts` performs request validation via `validators.ts`, calls the
service, and returns `{ state }` or `{ state, events }`. All thrown
`ApiError`s are mapped to JSON via `errors.ts:errorHandler`.

## Class diagram (textual)

```
                     +-----------+
                     |   Game    |
                     +-----------+
                     | rng       |
                     | humanBoard|--+        +-----------+
                     | aiBoard   |--+------> |   Board   |
                     | phase     |          +-----------+
                     | active    |          | cells     |
                     +-----------+          | ships  ---+--+
                          ^                 +-----------+  |
                          | uses                           v
              +-----------+-------------+           +-----------+
              |                         |           |   Ship    | (abstract)
       +------+------+         +--------+-----+     +-----------+
       | GameService |         | AIOpponent   |          ^
       +-------------+         +--------------+          |
              ^                       ^                  |
              | calls                 | uses             |
       +------+------+                |     +------------+------------+
       |   API/HTTP  |                |     |   Carrier / Battleship  |
       +-------------+                |     |   Cruiser / Frigate /   |
                                      |     |   Submarine             |
                                      |     +-------------------------+
                                      |
                            +---------+----------+
                            | Action (Strategy)   |
                            +---------------------+
                            | SingleHit / AreaHit |
                            | Move1 / Rotate90    |
                            +---------------------+
```
