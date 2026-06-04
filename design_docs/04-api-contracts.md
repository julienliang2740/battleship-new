# 04 - API Contracts

All game endpoints live under the `/api` prefix and exchange JSON. Both
`backend/` (TypeScript/Express) and `backend-rs/` (Rust/Axum) implement this
contract and listen on port `4000` by default (overridable via `PORT`). Run one
backend at a time; the frontend dev server proxies `/api/*` to whichever one is
listening on that port.

The contract includes JSON field names and omission rules, event order, HTTP
status codes, and error messages. A contract change is complete only when both
backend implementations exhibit the same behavior. Both also expose
`GET /health` outside the `/api` prefix, returning
`{ "ok": true, "games": <in-memory game count> }`.

A game is uniquely identified by its `gameId` (UUID v4). All endpoints operate
from the **human player's perspective**: `you` is always the human, `enemy` is
always the AI.

## Error envelope

Every 4xx/5xx response uses:

```json
{ "error": { "code": "INVALID_ACTION", "message": "Human-readable details." } }
```

Codes:

| Code              | When                                                       |
| ----------------- | ---------------------------------------------------------- |
| `BAD_REQUEST`     | Malformed JSON, missing fields.                            |
| `NOT_FOUND`       | `gameId` doesn't exist.                                    |
| `WRONG_PHASE`     | Endpoint called in an incompatible phase.                  |
| `NOT_YOUR_TURN`   | Action while it is the AI's turn.                          |
| `INVALID_PLACE`   | Ship placement out of bounds or overlapping.               |
| `INVALID_ACTION`  | Action kind not allowed for the chosen ship.               |
| `NO_QUOTA`        | The ship has 0 of that action remaining this turn.         |
| `INVALID_TARGET`  | Target cell/direction is illegal for the action.           |
| `GAME_OVER`       | Game already ended.                                        |

## Endpoints

### `POST /api/games`

Create a new game. The selected backend auto-places the AI's fleet and waits
for the human to place theirs.

Request body:

```json
{ "seed": 12345 }
```

`seed` is optional; when provided it makes the AI placement deterministic.

Response 201:

```json
{ "state": GameStateDTO }
```

`state.phase === "placement"`, `state.you.ships` is empty, `state.you.cells`
is all `UNKNOWN`, `state.enemy.ships` is empty (AI ships are hidden until
sunk), `state.placement.nextIndex === 0`.

---

### `GET /api/games/:id`

Fetch current state.

Response 200: `{ "state": GameStateDTO }`

---

### `POST /api/games/:id/place`

Place a single ship for the human during placement phase. Must be called in
the order given by `state.placement.order`.

Request body:

```json
{
  "kind": "AIRCRAFT_CARRIER",
  "anchor": 23,
  "orientation": "horizontal"
}
```

- `kind` must equal `state.placement.order[state.placement.nextIndex]`.
- `anchor` is the top-left (horizontal) or top (vertical) cell of the ship.
- The ship occupies cells `anchor, anchor+1, ...` (horizontal) or
  `anchor, anchor+size, ...` (vertical).

Response 200: `{ "state": GameStateDTO }` with `placement.nextIndex` incremented,
or `phase === "playing"` if this was the final ship.

Errors: `WRONG_PHASE`, `INVALID_PLACE`, `BAD_REQUEST`.

---

### `POST /api/games/:id/place-random`

Auto-place all remaining human ships at once.

Response 200: `{ "state": GameStateDTO }` with `phase === "playing"`.

Errors: `WRONG_PHASE`.

---

### `POST /api/games/:id/reset-placement`

Clear the human's board and restart placement from ship 0. Only usable in
`placement` phase.

Response 200: `{ "state": GameStateDTO }`

---

### `POST /api/games/:id/actions`

Execute one action OR end the turn.

Two request shapes are accepted:

**Ship action**

```json
{
  "shipId": "human-CARRIER",
  "kind": "SINGLE_HIT",
  "targets": [42]
}
```

```json
{
  "shipId": "human-BATTLESHIP",
  "kind": "AREA_HIT_2X2",
  "targets": [55]
}
```

```json
{
  "shipId": "human-SUBMARINE",
  "kind": "MOVE_1",
  "targets": [],
  "direction": "N"
}
```

```json
{
  "shipId": "human-SUBMARINE",
  "kind": "ROTATE_90",
  "targets": []
}
```

**End-turn**

```json
{ "endTurn": true }
```

Response 200:

```json
{
  "state": GameStateDTO,
  "events": [GameEvent, ...]
}
```

`events` includes the human's events (in the order they happened during this
single action). When the human ends their turn (`endTurn: true`), the response
includes only the `turn_started: ai` event - the AI does **not** immediately
play. The client must then call `POST /api/games/:id/ai-step` repeatedly to
play out the AI's turn one action at a time. This makes each enemy action
visible and animatable on the client.

---

### `POST /api/games/:id/ai-step`

Execute exactly one AI action. The response contains the events for that
single action (one `shot` event for a SINGLE_HIT, four `shot` events for an
AREA_HIT_2X2, etc.) plus any `ship_sunk` and `game_over` events triggered.

When the AI has no more actions, the response also includes a
`turn_started: human` event and sets `aiDone: true`. The client should stop
polling at that point.

Response 200:

```json
{
  "state": GameStateDTO,
  "events": [GameEvent, ...],
  "aiDone": false
}
```

If called when it isn't the AI's turn (e.g. during the human's turn or after
game over), returns `aiDone: true` with an empty `events` array. The endpoint
is therefore safe to call defensively.

The frontend's `GameContext` automatically polls `ai-step` every 700ms while
`state.activePlayer === "ai"`, which lets the user watch each AI action land
on their board.

Errors: `WRONG_PHASE`, `NOT_YOUR_TURN`, `INVALID_ACTION`, `NO_QUOTA`,
`INVALID_TARGET`, `GAME_OVER`.

### Action validation rules (both backends)

For all attack actions:
- `shipId` must belong to the human, must reference an alive ship, and the
  ship's `actionsRemaining[kind]` must be > 0.

`SINGLE_HIT`:
- `targets.length === 1`, target is in bounds, target is not previously
  `MISS`/`HIT`/`SUNK` on the enemy view. (Re-shooting a known cell is
  rejected to avoid wasting actions accidentally.)

`AREA_HIT_2X2`:
- `targets.length === 1`, the cell is at `(row, col)` with `row < size-1` and
  `col < size-1` so the 2x2 region fits. At least one of the 4 cells must be
  unattacked; otherwise `INVALID_TARGET`.

`MOVE_1`:
- `direction` is provided and in `{N,E,S,W}`. The submarine's new cells must
  all be in bounds and unoccupied by another *own* ship. Cells previously
  attacked by the enemy keep their visible state on the enemy view.

`ROTATE_90`:
- New orientation must fit and not overlap other own ships.

### `DELETE /api/games/:id`

Discard a game (frees memory). Idempotent; returns 204 on success.

---

## Static metadata

### `GET /api/meta/fleet`

Returns the canonical fleet definition so the frontend never has to hard-code it.

Response 200:

```json
{
  "boardSize": 12,
  "ships": [
    { "kind": "AIRCRAFT_CARRIER", "name": "Aircraft Carrier", "length": 8,
      "actions": { "SINGLE_HIT": 4 } },
    { "kind": "BATTLESHIP", "name": "Battleship", "length": 6,
      "actions": { "AREA_HIT_2X2": 1 } },
    { "kind": "CRUISER", "name": "Cruiser", "length": 4,
      "actions": { "SINGLE_HIT": 2 } },
    { "kind": "FRIGATE", "name": "Frigate", "length": 3,
      "actions": { "SINGLE_HIT": 1 } },
    { "kind": "SUBMARINE", "name": "Submarine", "length": 2,
      "actions": { "SINGLE_HIT": 1, "MOVE_1": 1, "ROTATE_90": 1 },
      "sharedBudget": 1 }
  ]
}
```
