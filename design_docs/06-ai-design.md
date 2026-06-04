# 06 - AI Design

The AI plays the role of the second player. It must:

1. Place its fleet during game creation.
2. On its turn, decide for each of its alive ships **which action to take and
   where**, subject to all the same legality rules a human faces.
3. Operate from a player-equivalent view: it never reads the human's
   `humanBoard.ships[*].positions` directly. It uses
   `humanBoard.toEnemyView()` plus its own memory of past shots.

The AI is implemented in both `backend/src/ai/` and `backend-rs/src/ai/`.
The TypeScript signatures below describe the shared behavior; the Rust modules
must make the same seeded decisions and emit the same events.

## Placement (`backend/src/ai/placement.ts`, `backend-rs/src/ai/placement.rs`)

```ts
export function autoPlaceFleet(board: Board, rng: Rng): void
```

Algorithm: rejection sampling per ship in fleet order. For each ship:

1. Pick a random orientation.
2. Pick a random anchor uniformly from valid anchors for that orientation.
3. If `board.canPlace(ship, anchor, orientation)`, place it.
4. Otherwise retry up to 500 times; on failure, clear the board and restart
   the whole fleet.

This mirrors the original prototype's `randomPlaceAllShips`. It is good enough
because the fleet occupies only 23 of 144 cells (16%).

## Targeting model (`backend/src/ai/targeting.ts`, `backend-rs/src/ai/targeting.rs`)

The AI maintains a `Targeter` object that derives strictly from the enemy view
DTO plus a small memory of unresolved hits.

```ts
class Targeter {
  // Cells we've already shot and what they returned: MISS, HIT, SUNK.
  // Mirrors enemyView.cells but is recomputed from the DTO each turn.
  shots: Map<number, "MISS" | "HIT" | "SUNK">;

  // Unresolved HIT cells: cells we've hit that aren't yet part of a SUNK ship.
  activeHits: Set<number>;

  // Remaining ship sizes the opponent still has, inferred from sunk ships
  // visible on the enemy view (sunk ships expose `positions`).
  remainingSizes: number[];

  /** Highest-value cell to attack with a SINGLE_HIT. */
  bestSingleTarget(): number;

  /** Best 2x2 anchor for AREA_HIT_2X2 (maximizes expected damage). */
  bestAreaTarget(): { anchor: number; score: number };
}
```

### Single-cell scoring

Same probability-density algorithm as the original prototype, with two
upgrades:

1. Iterates over **all remaining enemy ship sizes** (not just the classic 5).
2. When there are unresolved hits, switches to **target mode**: only legal
   placements that cover at least one unresolved hit contribute density; the
   AI greedily clears the current "hot" ship before resuming the hunt.

### 2x2 scoring

Score of a 2x2 anchor = sum of single-cell density values for its 4 cells,
penalized by cells that are already attacked. We never use `AREA_HIT_2X2`
unless there are at least 2 unattacked cells in the chosen 2x2 (it's a waste
of the Battleship's only action otherwise).

## Turn policy (`backend/src/ai/policy.ts`, `backend-rs/src/ai/policy.rs`)

The AI's turn is a sequence of *micro-decisions*, one per available action,
in the following priority order:

1. **Battleship `AREA_HIT_2X2`**: fired exactly once. Uses `bestAreaTarget()`
   if its score exceeds a small threshold; otherwise saves the action by
   targeting the densest legal 2x2 anyway (we never skip a Battleship attack,
   since the Battleship has no other use).
2. **Aircraft Carrier x4 `SINGLE_HIT`**: 4 shots. After each shot, the
   targeter is updated from the post-shot enemy view, so the second shot
   can capitalize on a fresh hit from the first.
3. **Cruiser x2 `SINGLE_HIT`**: same logic.
4. **Frigate x1 `SINGLE_HIT`**.
5. **Submarine**: chooses one of:
   - `SINGLE_HIT` if the targeter has a clear best target (density > average).
   - `ROTATE_90` if the submarine is currently in a column/row the human has
     been actively shelling (heuristic: any cell adjacent to a known enemy
     miss-cluster).
   - `MOVE_1` away from the most-attacked side of the board.
   - Falls back to `SINGLE_HIT` if neither evasive option is legal.

After all actions are taken, the AI ends its turn. The selected backend's
service and game logic handle the transition back to the human.

## `AIOpponent` (`backend/src/ai/AIOpponent.ts`, `backend-rs/src/ai/opponent.rs`)

```ts
class AIOpponent {
  constructor(private rng: Rng);

  /** Called once during game creation. */
  placeFleet(board: Board): void;

  /**
   * Execute exactly ONE AI action. Returns the events for that action,
   * or [] if the AI has nothing left to do this turn. Called repeatedly
   * by `GameService.aiStep()` until the AI is out of actions, at which
   * point `Game.finishAiTurnIfDone()` transitions control back to the
   * human.
   */
  stepOnce(game: Game): GameEvent[];
}
```

`stepOnce`:

```
if game.isOver(): return []
ship = nextShip(game)   # first alive ship with actions, in SHIP_ORDER
if not ship: return []
targeter = new Targeter(game.humanBoard.toEnemyView())
req = (ship.kind == SUBMARINE)
      ? pickSubmarineAction(game, ship, targeter)
      : pickAttackAction(ship, targeter)
return game.applyAction("ai", req)
```

`SHIP_ORDER` is `[BATTLESHIP, AIRCRAFT_CARRIER, CRUISER, FRIGATE, SUBMARINE]`,
which means the player sees the big 2x2 strike first, then each Carrier shot
individually, and so on. The targeter is rebuilt from the *public* enemy view
on every step so the AI keeps capitalizing on hits as they happen.

> Rationale for stepwise rather than full-turn: a single-call full turn made
> 8-12 events arrive at once, which was unreadable. The stepwise interface
> lets the frontend animate each action separately on a ~700ms cadence.

## Why the AI uses the enemy view

The AI is *forced* to play with the same information any opponent has. This
keeps the game fair and means we can later use the same `AIOpponent` to drive
a hint feature for the human player without leaking information.

It also provides a parity boundary: for the same seed and public game history,
the TypeScript and Rust AIs must choose the same next action.
