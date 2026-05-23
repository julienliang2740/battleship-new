# 09 - Extensibility

The codebase is structured so that the most likely future changes are local,
typed, and require no cross-cutting edits.

## Add a new ship

1. **Define the kind.** In `shared/ships.ts`, add the new value to
   `ShipKind`.
2. **Create the subclass.** In `backend/src/models/`, add `Destroyer.ts`
   (etc.):
   ```ts
   export class Destroyer extends Ship {
     readonly kind: ShipKind = "DESTROYER";
     readonly name = "Destroyer";
     readonly length = 5;
     defaultQuotas() { return { SINGLE_HIT: 3 }; }
     supportedActions() { return ["SINGLE_HIT"] as const; }
   }
   ```
3. **Register it in the factory.** Add an entry to `ShipFactory.buildFleet()`
   and to `config.ts:FLEET_ORDER`.
4. **Update docs.** `design_docs/02-game-rules.md` is the single source of
   truth for ship stats - update its table.

Frontend changes:
- `shared/ships.ts` is consumed by both sides; the new kind is automatically
  typed.
- `FleetPanel` and `BoardView` are data-driven; they will render the new ship
  with no code change as long as it has a CSS color token (see step below).
- Add a token in `App.css`, e.g. `--ship-destroyer: #5b6f80`, and a class
  rule `.ship.kind-destroyer`.

## Add a new ability

1. **Define the kind.** Add to `ActionKind` in `shared/ships.ts`.
2. **Write the strategy.** In `backend/src/core/actions/`:
   ```ts
   export class Torpedo implements Action {
     readonly kind: ActionKind = "TORPEDO_LINE";
     validate(ctx) { /* check direction + length */ }
     execute(ctx)  { /* compute cells, call enemyBoard.applyHits */ }
   }
   ```
3. **Register it** in `core/actions/registry.ts`.
4. **Grant it** to one or more ships via their `defaultQuotas()` and
   `supportedActions()`.
5. **Frontend rendering**: add a preview branch in `BoardView` for the new
   target shape and a button label in `ShipHoverMenu`.

The `Action` interface is small enough that adding abilities like radar
(reveal cells without damaging), bombing run (line of cells), or repair
(heal a friendly hit) are all 1-file additions.

## Change the board size

`backend/src/config.ts:BOARD_SIZE` is the single source. Both boards in a
`Game` use this value at construction time. The frontend asks the server for
the size via `GET /api/meta/fleet` so changing it on the backend propagates
without redeploying the frontend.

> Caveat: do not shrink the board below `max(ship.length)`. The validator in
> `Board.canPlace` will refuse to place a ship that doesn't fit.

## Make the game multiplayer (sketch)

The architecture already separates "human" vs "ai" cleanly. To support
player-vs-player:

1. Replace `AIOpponent` with an event-loop that waits for a second human's
   action via WebSocket.
2. Add a `players: Map<gameId, { humanA: connId; humanB: connId }>` map.
3. `GameService.applyAction(id, side, req)` takes a `side` and validates
   against `game.activePlayer`.
4. The two clients each get their own filtered DTO from `toGameStateDTO`.

Nothing in `core/` or `models/` needs to change.

## Plug a database

Replace `services/GameStore.ts` with an implementation backed by
Postgres/Redis. The `Game` aggregate already serializes deterministically
via `toGameStateDTO` (full view, both sides) for the persistence path; you
just need an inverse hydrator. Recommended approach: store the constructor
args (`seed`, ordered list of actions taken) and re-derive the game by
replaying actions. This keeps the schema tiny and gives you a free audit log.
