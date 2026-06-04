# 08 - State Management

The frontend uses React Context plus `useReducer`. There is exactly **one**
reducer and one context; nothing else owns mutable game-related state.
This state layer treats both backend implementations identically because they
share the same DTOs, events, and error contract.

## Store shape

```ts
interface Store {
  // Snapshot from the selected backend - read-only on the client.
  state: GameStateDTO | null;
  // Local UI state.
  ui: UIState;
  // I/O status.
  loading: boolean;
  error: string | null;
}

interface UIState {
  flow: ActionFlowStep;        // see 03-data-models.md
  log: LogEntry[];
  toasts: Toast[];
  // Placement-only.
  orientation: Orientation;
  hoverCell?: number;
}
```

`ActionFlowStep` (recap):

```ts
type ActionFlowStep =
  | { step: "idle" }
  | { step: "shipSelected"; shipId: string }
  | { step: "actionArmed"; shipId: string; kind: ActionKind }
  | { step: "targeting"; shipId: string; kind: ActionKind; hovered?: number };
```

`actionArmed` vs `targeting` distinction:
- `actionArmed` is the brief state after clicking an action button but before
  the user hovers a cell. We immediately enter `targeting` on first hover.
- For `MOVE_1` and `ROTATE_90`, the `ShipHoverMenu` submits the request
  directly without going through `targeting` (MOVE_1 expands a compass
  first; ROTATE_90 is one click).

## State machine

```
                       newGame()
                          |
                          v
                  +----------------+
                  | phase=placement |  <----+
                  +-----------------+        |
                          |                   |
                  place all ships             |
                          |                   |
                          v                   |
                  +----------------+          |
                  |  phase=playing |          |
                  +----------------+          |
                          |                   |
                          v                   |
                +--------------------+        |
                |   flow = idle       |       |
                +--------------------+        |
                          |                   |
              click own ship in fleet         |
                          |                   |
                          v                   |
                +--------------------+        |
                | flow = shipSelected |       |
                +--------------------+        |
                  |                  ^         |
   click action   |                  | cancel  |
                  v                  |         |
                +--------------------+         |
                | flow = actionArmed  |        |
                +--------------------+         |
                          |                    |
                first hover (attack)           |
                  / direct-submit (move/rotate)
                  v                    \
        +--------------------+          \
        | flow = targeting    |          \-> request submitted -> events
        +--------------------+              applied -> flow = idle
                  |                            (if more actions remain)
            click cell                       or -> turn ends
                  v
            submit request
                  |
                  v
        loading -> response -> updates state, flow back to idle
                                                |
                                                v
                                        if all ships have used all
                                        actions or user clicks
                                        "End Turn" -> POST /actions
                                        with endTurn:true; AI plays;
                                        events streamed back.
                                                |
                                                v
                                        phase becomes "gameover" if
                                        a board is fully sunk.
```

## Reducer actions

```ts
type Action =
  | { type: "START_LOADING" }
  | { type: "STOP_LOADING" }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "SNAPSHOT"; state: GameStateDTO }
  | { type: "EVENTS"; events: GameEvent[] }      // appends log + toasts
  | { type: "SET_ORIENTATION"; orientation: Orientation }
  | { type: "TOGGLE_ORIENTATION" }
  | { type: "HOVER_CELL"; cell: number | undefined }
  | { type: "SELECT_SHIP"; shipId: string }
  | { type: "SELECT_AND_ARM"; shipId: string; kind: ActionKind }
  | { type: "ARM_ACTION"; kind: ActionKind }
  | { type: "ENTER_TARGETING"; hovered: number }
  | { type: "CANCEL_FLOW" }
  | { type: "PUSH_TOAST"; toast: Toast }
  | { type: "DISMISS_TOAST"; id: number };
```

### Important invariants enforced by the reducer

- `SNAPSHOT` **preserves** the action flow when possible. It resets the flow
  to `idle` only when:
  - it is no longer the human's turn, OR
  - the selected ship has been sunk or no longer exists.
  When the selected ship is alive but the armed action no longer has quota,
  the flow falls back to `shipSelected` so the menu remains on the same ship.
  This is what lets the player fire the Carrier's 4 shots in rapid succession
  without re-hovering between each.
- `ARM_ACTION` requires the current step to involve a selected ship; the
  reducer silently ignores stale dispatches.
- `SELECT_AND_ARM` is the atomic version called from `ShipHoverMenu` when a
  user clicks an action button on a not-yet-selected ship.
- `HOVER_CELL` with `flow.step === "actionArmed"` transitions to `targeting`.

## AI driver effect

A dedicated `useEffect` in `GameContext` automatically calls `aiStep()` on a
700ms cadence whenever `state.activePlayer === "ai"`. The effect re-arms after
every snapshot (the log length is a tripwire). When the selected backend reports
`activePlayer === "human"` (or the game is over), the effect short-circuits
and no further polling happens.

This is the client side of the stepwise AI design described in
`06-ai-design.md` and `04-api-contracts.md`.

## Persistence

`gameId` is mirrored in `localStorage["battleship.gameId"]` after each
successful `POST /api/games`. On mount, the App reads it and:

1. If absent: creates a fresh game.
2. If present: tries `GET /api/games/:id`. On 404, falls back to (1).

The two backends have independent in-memory stores. After switching which
backend is running, the stored `gameId` will normally return 404 and this
fallback creates a fresh game automatically.

## Event-to-toast mapping

```
ship_sunk where by="human"  -> toast.good "You sunk the enemy <Ship>!"
ship_sunk where by="ai"     -> toast.bad  "Enemy sunk your <Ship>!"
game_over winner="human"    -> toast.good "Victory!"
game_over winner="ai"       -> toast.bad  "Defeat."
```

All events also append to the battle log with shorter human-readable text.
