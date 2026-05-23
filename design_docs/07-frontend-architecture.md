# 07 - Frontend Architecture

## Component tree

```
<App>
  <Header>
    <Title />
    <StatusBar />            shows phase, turn, winner
    <Controls />             new game, end-turn (playing), clear-selection
  </Header>
  <Main>
    <BoardView side="you" overlay={<ShipHoverMenu/>} />
                                   own board; hover a ship to reveal a floating
                                   action menu next to it
    <BoardView side="enemy" />     enemy board, click cells to attack
  </Main>
  <Sidebar>
    <FleetPanel side="you"  />     read-only fleet summary (own)
    <FleetPanel side="enemy" />    read-only fleet summary (enemy)
    <BattleLog />
  </Sidebar>
  <Toasts />
  <PlacementPanel />              floats during placement phase only
</App>
```

Every component is purely presentational: it receives data via props or via
`useGame()` and dispatches events back through callbacks.

## Ship-hover action menu (the primary interaction surface)

During the playing phase, the user interacts with their own fleet **directly
on the board**, not through a sidebar. The new flow is:

1. **Hover** any cell of one of your alive ships on the own-board.
2. A floating `ShipHoverMenu` popover appears next to the ship's bounding
   box, listing each available action as a button (with the remaining count
   for multi-use actions, e.g. "Fire shot x4" for the Carrier).
3. **Click** an action button to arm it. Movement-class actions
   (`MOVE_1`, `ROTATE_90`) submit immediately on click - the popover gains
   a compass for picking the move direction; rotation is one-click.
4. For attack actions the cursor moves to the enemy board; clicking a cell
   submits the action. The popover stays sticky while a ship is selected so
   the player can fire the Carrier's 4 shots in rapid succession without
   re-hovering.
5. **Escape** or "Clear selection" cancels the flow.

### Hover-tunneling

The popover is rendered inside the same `.board-stage` wrapper as the board,
absolutely positioned. A 150ms grace timer (`hoverTimerRef` in `App.tsx`)
keeps it open while the cursor travels from a ship cell into the popover, so
the user does not lose the menu by accidentally leaving the ship's hitbox.

### Sticky selection

Once an action button is clicked, the selected ship's `flow` state becomes
`actionArmed` / `targeting`. The reducer's `SNAPSHOT` handler preserves the
flow across server responses as long as:

- it is still the human's turn,
- the selected ship still exists and is not sunk,
- and the ship still has quota for the armed kind (otherwise the flow falls
  back to `shipSelected` so the user can pick another action).

This way, firing one of the Carrier's 4 shots does NOT close the menu;
firing the 4th DOES close it (no quota left, but the menu remains showing
the Carrier with the option to switch to another ship).

### Positioning algorithm

`ShipHoverMenu` uses `useLayoutEffect` plus a `ResizeObserver` on the board
to recompute its position whenever the layout changes. The algorithm:

1. Query every `[data-cell="i"]` element for the ship's `positions[i]`.
2. Compute the union bounding box of those rects.
3. Prefer placement to the **right** of the bounding box; if there is not
   enough room within the stage, try **left**; otherwise place **below**.
4. Render an arrow nub on the appropriate side via the `.placement-*` class.

## Top-level layout

CSS grid:

```
grid-template-areas:
  "header header"
  "boards sidebar";
grid-template-columns: 1fr 360px;
```

The boards row uses an auto-fit subgrid so the two boards sit side-by-side
on wide screens and stack on narrow ones.

## BoardView

Props:

```ts
interface BoardViewProps {
  side: "you" | "enemy";
  board: BoardViewDTO;
  // UI flow context (read from useGame()):
  //   - placement preview cells (own board)
  //   - selected-ship highlights (own board)
  //   - action target preview (enemy board)
  hoverCell?: number;
  highlightCells?: number[];
  highlightValid?: boolean;
  onCellClick?: (cell: number) => void;
  onCellHover?: (cell: number) => void;
}
```

Renders:
- Column letters along the top, row labels along the left.
- `size x size` grid of `<button class="cell">` elements.
- Cell class derived from `CellKnowledge`:
  - `UNKNOWN` -> `cell empty`
  - `SHIP`    -> `cell ship` (own board only)
  - `MISS`    -> `cell miss` (renders an `o`)
  - `HIT`     -> `cell hit`  (renders an `x`)
  - `SUNK`    -> `cell sunk` (renders an `X`)
- Plus optional `highlight-valid` / `highlight-invalid` outlines for preview.

The component computes the highlight set internally from props; clicking
delegates to the parent.

## FleetPanel (read-only)

Renders ships as a list. Each entry shows:

- Ship marker (colored bar) by ship kind.
- Name + length.
- Damage bar: `hits.length / length`.
- For own ships during your turn: inline "uses left" pills per action
  (`Hit x4`, `2x2 x1`, etc.).

This panel is **read-only**. Ship selection happens on the board itself via
hover - see "Ship-hover action menu" above. The FleetPanel exists to give an
at-a-glance summary even when no ship is hovered.

The currently-selected ship's row receives a `.selected` class so the player
can confirm at a glance which ship's actions are armed.

## ShipHoverMenu

A floating popover anchored to the bounding box of a ship on the own-board.
See "Ship-hover action menu" above for the interaction model. The component:

- Takes the `ship: ShipDTO`, a `boardEl: HTMLElement | null` ref, and the
  current `armedKind` prop.
- Builds buttons from `ship.actionsRemaining`.
- For `MOVE_1`, expands an inline compass once armed.
- For `ROTATE_90`, submits immediately on click.
- Uses `useLayoutEffect` to position itself on every render.

## PreviewLayer

Conceptual layer (no extra DOM): when `flow.step === "targeting"`, the
`BoardView` for the relevant side highlights the cells the action would
affect at the current `hovered` cell. Specifically:

- `SINGLE_HIT`: 1 cell.
- `AREA_HIT_2X2`: 4 cells (the 2x2 anchored at the hovered cell). If the 2x2
  would overflow, falls back to highlighting just the valid subset and marks
  the preview as invalid.
- `MOVE_1`: shows the submarine's new cells in green if the move is legal,
  red otherwise.

## PlacementPanel

Visible only in `phase === "placement"`. Shows:

- Which ship is next (`placement.order[placement.nextIndex]`).
- Current orientation (toggled with R key or a button).
- Buttons: "Rotate", "Clear", "Random".

## BattleLog

Renders the last N events from the local `log` array, color-coded:
`you` -> green, `enemy` -> red, `neutral` -> muted.

## Toasts

Bottom-right stack. Triggered on key events (`ship_sunk`, `game_over`,
errors). 3-second auto-dismiss; same animation tokens as the prototype.

## Custom hooks

### `useGame()`

```ts
function useGame(): {
  state: GameStateDTO | null;
  ui: UIState;
  isLoading: boolean;
  error: string | null;

  // Mutations
  newGame: (seed?: number) => Promise<void>;
  placeShip: (kind: ShipKind, anchor: number, orient: Orientation) => Promise<void>;
  placeRandom: () => Promise<void>;
  resetPlacement: () => Promise<void>;
  submitAction: (req: ActionRequest) => Promise<void>;
  endTurn: () => Promise<void>;

  // UI flow
  selectShip: (shipId: string) => void;
  armAction: (kind: ActionKind) => void;
  cancelFlow: () => void;
  hoverCell: (cell: number | undefined) => void;
}
```

It is implemented inside `GameContext.tsx` and re-exported. Components never
talk to `api/client.ts` directly.

### `useToasts()`

Manages the toast queue; called from inside `useGame` whenever an `events`
stream arrives.

## Communication with backend

- One `gameId` per session, stored in localStorage so that a refresh restores
  the game. On mount, the App calls `GET /api/games/:id`. If 404, it calls
  `POST /api/games` to create a new one.
- After every mutation the API returns the full `GameStateDTO`; the reducer
  replaces its snapshot. There is no client-side derivation of game state.
