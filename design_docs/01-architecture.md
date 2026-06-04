# 01 - Architecture

## Layered architecture

Both backend implementations and the frontend follow a strict layered model.
Code in a higher layer may call into the layer immediately below; a lower layer
must never import from a higher one.

### Backend layers

```
+----------------------------------------------------------+
| api/        HTTP layer: Express or Axum routes,          |
|             controllers, request validation, errors.     |
+----------------------------------------------------------+
| services/   Application use-cases: GameService owns      |
|             game lifecycle and orchestrates core+ai.     |
|             GameStore is the persistence boundary.       |
+----------------------------------------------------------+
| core/       Pure domain: Game, Board, Action handlers.   |
|             No IO, no web framework, no randomness       |
|             except through the injected RNG.             |
+----------------------------------------------------------+
| models/     OOP ship hierarchy: Ship + 5 subclasses.     |
|             Pure data + small methods, no IO.            |
+----------------------------------------------------------+
| ai/         AIOpponent: deterministic given an RNG seed. |
|             Uses core/ and models/ types only.           |
+----------------------------------------------------------+
```

This layer diagram applies to both `backend/` (TypeScript/Express) and
`backend-rs/` (Rust/Axum). Module names and language idioms differ, but requests
cross the same route -> controller -> service -> core/models/ai boundaries.

`ai/` and `core/` sit at the same depth - neither imports the other except that
`ai/` reads board *views* (the same DTOs the frontend gets) so that the AI is
held to the same information constraints as a human player.

### Frontend layers

```
+----------------------------------------------------------+
| components/ Presentational React components. Receive     |
|             props, emit events. Never call fetch.        |
+----------------------------------------------------------+
| hooks/      Glue: bind state context to API client,      |
|             expose ergonomic operations to components.   |
+----------------------------------------------------------+
| state/      React Context + useReducer. UI state machine |
|             for the "select ship -> action -> target"    |
|             flow. Never owns server state directly;      |
|             holds a snapshot of the last GameStateDTO.   |
+----------------------------------------------------------+
| api/        Typed fetch client. The only place that      |
|             knows about HTTP, URLs, and JSON.            |
+----------------------------------------------------------+
```

## Request lifecycle: a single attack

```
User clicks an enemy cell
        |
        v
components/BoardView -> onCellClick(cell)
        |
        v
hooks/useGame.submitAction({ shipId, kind, targets })
        |
        v
api/client.postAction(gameId, request)
        |   HTTP POST /api/games/:id/actions
        v
+---------------- selected backend -----------------+
api route -> controller postAction/post_action
        |
        v
services/GameService.applyAction/apply_action(gameId, req)
        |
        |- load Game from GameStore
        |- validate it is the human's turn
        |- look up the Action handler in core/actions/registry
        |- delegate to action.execute(game, ship, targets)
        |     |- mutates Board (records hits, computes sunk ships)
        |     |- decrements per-turn quota on Ship
        |- if turn ends, transition to AI; client then polls ai-step,
        |    each call invoking AIOpponent.stepOnce(game)
        |- persist Game back to GameStore
        |- map Game -> GameStateDTO (for human perspective)
        v
HTTP 200 with { state, lastEvents }
+---------------------------------------------------+
        |
        v
hooks/useGame stores the new snapshot and toasts events.
components re-render from the snapshot.
```

This means the **frontend's reducer never mutates the board** - it only stores
the latest `GameStateDTO` plus its own UI-only state (`selectedShipId`,
`armedActionKind`, `hoveredTargets`). The request and response are identical
whether the selected server is `backend/` or `backend-rs/`.

## Two views, one game

A `Game` instance on the server holds two `Board`s. Whenever it is serialized
for a client, it is filtered through the DTO projection in
`backend/src/core/dto.ts` or `backend-rs/src/core/dto.rs`, which:

- For `viewer === "human"`:
  - Returns the human's own ships with full `positions[]`.
  - Returns the AI's ships **without** `positions[]`. Each cell on the enemy
    board is downgraded to one of: `unknown`, `miss`, `hit`, `sunk`. Sunk ships
    do reveal their full footprint (as in classic Battleship).
- For `viewer === "ai"` (used internally only): the symmetric view.

The frontend therefore cannot cheat even if it tries to inspect the JSON.

## Determinism and testing

- All randomness goes through `backend/src/core/rng.ts:Rng` or its
  bit-compatible Rust peer in `backend-rs/src/core/rng.rs`. `GameService`
  accepts an optional seed when creating a game.
- All `core/` and `models/` code is pure: same input -> same output. This makes
  unit testing trivial.
- The AI takes an `Rng` and a read-only `BoardViewDTO`. It cannot peek at the
  player's actual ships.
- Given the same seed and request sequence, both backends must produce the same
  observable JSON, events, status codes, and error messages.
