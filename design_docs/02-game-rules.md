# 02 - Game Rules

These rules are implemented independently by both `backend/` and `backend-rs/`.
The selected backend is authoritative during play, and both implementations
must produce the same observable result for the same seed and action sequence.

## Board

- Default grid: **12 x 12** (configured in `backend/src/config.ts` and
  `backend-rs/src/config.rs`). Larger than the classic 10 x 10 to comfortably
  fit the new, larger Aircraft Carrier.
- Cells are addressed by `(row, col)` with `row` in `[0, size)` and `col` in
  `[0, size)`. On the wire and in code we also use a flat index
  `i = row * size + col`.
- Coordinates shown in the UI: rows `A..L`, columns `1..12`.

## Fleet

Each player starts with the same fleet of **5 ships**:

| Ship             | Length | Action(s) per turn                                    |
| ---------------- | ------ | ----------------------------------------------------- |
| Aircraft Carrier | 8      | 4 separate single-cell hits                           |
| Battleship       | 6      | 1 heavy attack covering a 2x2 area (4 cells)          |
| Cruiser          | 4      | 2 separate single-cell hits                           |
| Frigate          | 3      | 1 single-cell hit                                     |
| Submarine        | 2      | 1 of: single-cell hit, move 1 space, or rotate 90 deg |

Total ship cells: 8 + 6 + 4 + 3 + 2 = **23 cells per fleet**.

A player loses when **all five of their ships are sunk**. A ship is sunk when
every one of its cells has been hit.

## Phases

```
placement -> playing -> gameover
```

### Placement phase

- Both players (human and AI) place all ships on their own board.
- Ships are placed orthogonally (horizontal or vertical), entirely inside the
  grid, and must not overlap any other ship. Adjacency is allowed (ships may
  touch).
- The human places ships one at a time in the order: Aircraft Carrier, Battleship,
  Cruiser, Frigate, Submarine. The human can press **R** to rotate or click a
  "Random" button to auto-place.
- The selected backend places the AI's ships as soon as the game is created.
- Once the human has placed the final ship (Submarine), the phase transitions to
  `playing` and it becomes the human's turn.

### Playing phase

A **turn** is structured as:

1. **Ship selection**: the active player selects one of their alive ships.
2. **Action selection**: the active player chooses one of that ship's available
   actions. An action is available iff:
   - the ship's per-turn quota for that action has not been exhausted, and
   - the action is currently legal on the board (e.g. submarine move target is
     in bounds and unoccupied).
3. **Targeting**: the player nominates the action's target(s) on the appropriate
   board (enemy board for attacks; own board for `MOVE`/`ROTATE`).
4. **Resolution**: the selected backend executes the action atomically and
   returns events.
5. The turn ends when:
   - the player has used every action of every ship at least once **and** they
     explicitly end the turn (recommended UX), OR
   - the player calls `POST /actions` with `endTurn: true`, OR
   - the player has no legal actions remaining (auto end-turn).

> **Important multi-action rule**: each ship's actions are *independent*. The
> Aircraft Carrier can fire its 4 single-cell hits in any order, interleaved with
> the Cruiser's 2 hits, the Battleship's 2x2 strike, the Frigate's 1 hit, and the
> Submarine's chosen utility action. Hits at any time can sink ships and reveal
> new information mid-turn.

Per-turn quotas reset at the **start** of every owning-player turn. (E.g. when
turn passes back to the human, all of the human's ships' counters reset.)

A ship that is **sunk** contributes no actions. A ship that is alive but partially
damaged contributes full actions (damage does not degrade firepower).

### Gameover phase

- Set as soon as `Board.allShipsSunk()` becomes true for either player.
- The game is read-only at this point. The client may call `POST /api/games`
  again to start a fresh game.

## Action catalogue

Each action is identified by an `ActionKind` enum:

| ActionKind     | Target shape       | Owner ship type  | Effect                                                          |
| -------------- | ------------------ | ---------------- | --------------------------------------------------------------- |
| `SINGLE_HIT`   | 1 enemy cell       | Carrier, Cruiser, Frigate, Submarine | Reveal & damage that cell.                          |
| `AREA_HIT_2X2` | 1 enemy cell = top-left of 2x2 region | Battleship | Reveal & damage 4 cells.                                |
| `MOVE_1`       | 1 own cell         | Submarine        | Translate the ship 1 cell N/E/S/W. Must remain in bounds and not overlap another ship. |
| `ROTATE_90`    | (no target)        | Submarine        | Toggle horizontal/vertical around the ship's anchor cell. Must fit and not overlap. |

### Hit semantics

For `SINGLE_HIT` and `AREA_HIT_2X2`:

- For each affected cell:
  - If outside the grid: that cell is silently dropped (the action still spends
    its quota; the player should target legally).
  - If already in state `MISS`, `HIT`, or `SUNK`: the cell is no-op'd (no extra
    damage; quota still consumed).
  - If `UNKNOWN`/`empty` and contains no ship: cell becomes `MISS`.
  - If `UNKNOWN`/`empty` and contains a ship segment: cell becomes `HIT`; record
    the hit on that ship. If the ship is now fully hit, transition all of its
    cells to `SUNK` and emit a `ship_sunk` event.

A single 2x2 attack can hit 0..4 ships and sink any number of them.

### Submarine actions

- `MOVE_1` requires a `direction` payload (`"N" | "E" | "S" | "W"`). The whole
  ship's set of cells shifts by the unit vector. Move is rejected if any
  resulting cell is out of bounds or overlaps another **owned** ship. Hits and
  misses already inflicted on the **enemy view** of the submarine's old cells
  stay where they were on the enemy's board (i.e. moving does not "heal" the
  submarine - hits stay with the ship; previously-revealed cells the submarine
  vacates remain shown to the enemy as having been hit historically).
  - Implementation detail: the submarine's `positions[]` slides; the `hits` set
    is rewritten using the same delta vector so the hits stay attached to ship
    segments. The enemy's board view reveals only what *was* observed, which is
    the historical record of cells the enemy attacked - those stay in `MISS` or
    `HIT` state on the enemy's view, unchanged by the move. This means moving
    primarily helps when the enemy has not yet attacked the new cells.
- `ROTATE_90` pivots the 2-cell submarine around its first cell (`positions[0]`).
  Rejected if the new orientation would overflow the grid or overlap another
  ship. Hits transfer to the new cells with the same indexing (hit on
  `positions[i]` stays with `positions[i]`).
