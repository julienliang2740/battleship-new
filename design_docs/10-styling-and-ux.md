# 10 - Styling and UX

Styling and interaction behavior are frontend-only and do not vary by backend.
The TypeScript and Rust backends expose the same snapshots and event cadence,
so switching implementations must not change the rendered UX.

## Visual identity

We preserve the dark-naval palette of the original prototype. New tokens
extend the palette to cover ship-by-ship colorization and the new action UI.

### Design tokens (CSS variables, defined in `App.css :root`)

```css
:root {
  /* Base layers (carried over) */
  --bg:     #0b1d2a;
  --bg-2:   #112c41;
  --sea:    #1d4a6b;
  --sea-2:  #245a80;
  --grid:   #0a1822;
  --text:   #e8eef3;
  --muted:  #9bb0bf;
  --accent: #ffd166;

  /* Cell states (carried over) */
  --hit:  #d9534f;
  --miss: #cfd8dc;
  --sunk: #8b0000;
  --valid:   rgba(80, 200, 120, 0.55);
  --invalid: rgba(220, 80, 80, 0.55);

  /* Ship colors (new) - each ShipKind gets a distinct hull color so the
     player can recognize ships at a glance on their own board. */
  --ship-carrier:    #6e7a86;
  --ship-battleship: #4a4a4a;
  --ship-cruiser:    #586d7d;
  --ship-frigate:    #7d8a99;
  --ship-submarine:  #3d525e;

  /* UI surfaces (new) */
  --action-armed: rgba(255, 209, 102, 0.18);   /* faint amber overlay */
  --action-edge:  rgba(255, 209, 102, 0.65);
}
```

### Cell renderings

| Cell state | Background        | Symbol | Notes                              |
| ---------- | ----------------- | ------ | ---------------------------------- |
| UNKNOWN    | `--sea`           | -      | Hover -> `--sea-2`                 |
| SHIP       | per-kind color    | -      | Subtle inner border               |
| MISS       | `--miss`          | `o`    | Dark text on light                |
| HIT        | `--hit`           | `x`    | White text                        |
| SUNK       | `--sunk`          | `X`    | Slight inner shadow              |

### Action targeting overlay

- `SINGLE_HIT` preview: 2px outline `--action-edge`, fill `--action-armed`.
- `AREA_HIT_2X2` preview: same overlay applied to a 2x2 block; if any cell
  of the block is out of bounds, the whole block flips to `--invalid` outline.
- `MOVE_1` preview on own board: green outline for legal target cells, red
  for illegal.

### Ship indicators on the own board

The own board uses two distinct levels of emphasis:

1. **Hovered ship** (transient, no commitment): the ship's cells receive a
   soft amber inset shadow via `.cell.hovered`. The floating
   `ShipHoverMenu` appears next to the ship's bounding box.
2. **Selected ship** (sticky after click): the ship's cells get a pulsing
   amber outline via `.cell.selected` + `@keyframes cell-pulse`. The
   matching row in `FleetPanel` also gets the `.selected` class.

## UX flow notes

- **Ship-first interaction via direct hover**: the player hovers a ship on
  the board to see what it can do. No sidebar navigation needed. This puts
  the action menu *next to the thing it acts on*.
- **Hover-tunneling**: a 150ms grace timer keeps the popover open while the
  cursor travels from a ship cell into the popover. Once the user is over
  the popover the timer is cancelled.
- **Sticky selection**: after clicking an action button, the popover stays
  visible on that ship across snapshots so multi-shot ships (Carrier,
  Cruiser) can fire all their shots without re-hovering. The reducer
  preserves the flow until either the ship is sunk, the player's turn ends,
  or the player presses Esc / "Clear selection".
- **Stepwise enemy turn**: the AI plays one action at a time on a 700ms
  cadence (see `04-api-contracts.md`'s `ai-step` endpoint). Each enemy shot
  appears individually on the board and as a separate line in the battle
  log, so the player can actually see what the enemy is doing.
- **Always cancel-able**: pressing `Escape` at any non-idle step returns
  `flow` to `idle`.
- **End-turn glow**: when all alive ships have exhausted their quotas, the
  End Turn button glows (`btn-glow` keyframes). The turn does not auto-end
  unless every ship is completely out of actions.
- **Animation budget**: keep CSS transitions <= 200ms. Toast in/out reuses
  the existing 250ms keyframes from the prototype. Menu slide-in is 150ms.
- **Accessibility**: every cell is a `<button>` with an `aria-label` set to
  its coordinate (e.g. `B3`). The popover has `role="menu"`. Toasts are
  `role="status"` inside an `aria-live="polite"` region.
- **Keyboard**: during placement, `R` toggles orientation. During play,
  `Esc` cancels flow. Action buttons in the popover are reachable via
  normal tab order.

## Responsive layout

- `>= 1100px`: two boards side-by-side, sidebar fixed at 360px.
- `760-1099px`: boards stack vertically, sidebar moves to bottom.
- `< 760px`: single-column layout; the action bar becomes a sticky bottom
  drawer.
