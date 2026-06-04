# 09 - Extensibility

The codebase is structured so that the most likely future changes are local,
typed, and require no cross-cutting edits.

There are two supported backend implementations. Any change to game behavior,
the API, DTOs, AI decisions, errors, or metadata is complete only after the
TypeScript and Rust backends remain observably equivalent. The Rust compiler's
exhaustive enum matching is useful for locating the Rust side of a new kind.

## Add a new ship

1. **Define the wire kind.** Add the new value to `ShipKind` in
   `shared/ships.ts` and to the mirrored enum/serialization logic in
   `backend-rs/src/shared/mod.rs`.
2. **Implement it in TypeScript.** In `backend/src/models/`, add `Destroyer.ts`
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
3. **Register the TypeScript ship.** Update
   `backend/src/models/ShipFactory.ts` and `backend/src/config.ts:FLEET_ORDER`.
4. **Implement and register it in Rust.** Add the `ShipClass` definition and
   `class_for` match arm in `backend-rs/src/models/ship.rs`, then add the kind
   to `backend-rs/src/config.rs:FLEET_ORDER`.
5. **Keep metadata and AI behavior aligned.** Update any ship-specific policy
   logic in both `ai/` trees and confirm `GET /api/meta/fleet` matches.
6. **Update docs and parity checks.** `design_docs/02-game-rules.md` is the
   single source of truth for ship stats; update its table and compare both
   backends with the same seeded request sequence.

Frontend changes:
- `shared/ships.ts` is consumed by the frontend and TypeScript backend, so the
  new kind is automatically typed there. Rust uses its explicit mirror.
- `FleetPanel` and `BoardView` are data-driven; they will render the new ship
  with no code change as long as it has a CSS color token (see step below).
- Add a token in `App.css`, e.g. `--ship-destroyer: #5b6f80`, and a class
  rule `.ship.kind-destroyer`.

## Add a new ability

1. **Define the wire kind.** Add it to `ActionKind` in `shared/ships.ts` and
   the mirrored enum in `backend-rs/src/shared/mod.rs`.
2. **Write the TypeScript strategy.** In `backend/src/core/actions/`:
   ```ts
   export class Torpedo implements Action {
     readonly kind: ActionKind = "TORPEDO_LINE";
     validate(ctx) { /* check direction + length */ }
     execute(ctx)  { /* compute cells, call enemyBoard.applyHits */ }
   }
   ```
3. **Register and grant it in TypeScript.** Update
   `backend/src/core/actions/registry.ts` and the relevant ship subclasses.
4. **Implement and grant it in Rust.** Add matching validation/execution in
   `backend-rs/src/core/actions/`, update its registry, and update the relevant
   ship-class quotas/actions in `backend-rs/src/models/ship.rs`.
5. **Update AI policy in both implementations** if the AI can use the ability.
6. **Update frontend rendering.** Add a preview branch in `BoardView` for the
   new target shape and a button label in `ShipHoverMenu`.
7. **Verify parity.** Compare successful responses and every relevant invalid
   request across both backends.

The `Action` interface is small enough that adding abilities like radar
(reveal cells without damaging), bombing run (line of cells), or repair
(heal a friendly hit) stays local within each implementation.

## Change the board size

Keep `backend/src/config.ts:BOARD_SIZE` and
`backend-rs/src/config.rs:BOARD_SIZE` equal. Both boards in a `Game` use the
selected backend's value at construction time. The frontend asks the server
for the size via `GET /api/meta/fleet`, so either backend propagates its value
without redeploying the frontend.

> Caveat: do not shrink the board below `max(ship.length)`. The validator in
> `Board.canPlace` will refuse to place a ship that doesn't fit.

## Make the game multiplayer (sketch)

Both backend architectures already separate "human" vs "ai" cleanly. To
support player-vs-player:

1. Define the shared WebSocket/session contract.
2. Replace `AIOpponent` in both backends with an event loop that waits for a
   second human's action.
3. Add equivalent player/session stores to both service layers.
4. Make both `GameService` implementations accept a `side` and validate it
   against `game.activePlayer`.
5. Give the two clients their own filtered DTO projections.

The domain concepts in either `core/` or `models/` should not need to change.

## Plug a database

Replace `backend/src/services/GameStore.ts` and
`backend-rs/src/services/store.rs` with equivalent implementations backed by
Postgres/Redis. Keep persistence behavior and concurrency semantics aligned
across both backends.

Recommended approach: store the constructor inputs (`seed`, ordered list of
actions taken) and re-derive the game by replaying actions. This keeps the
schema small, gives an audit log, and provides a natural cross-backend parity
test: either implementation must rebuild the same game snapshot.
