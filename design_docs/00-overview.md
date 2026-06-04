# 00 - Project Overview

## Goal

Reimplement the classic Battleship game with **tactical-unit mechanics**: ships are
not interchangeable hit-point pools that share a single shot per turn. Each ship is
an individual unit with its own attack profile, range, and abilities. A player's
options each turn are the union of what their currently-alive ships can do.

This codebase replaces the prior monolithic frontend-only prototype in `../battleship`
with a properly layered client/server design.

## Tech stack

| Layer                   | Choice                                      | Why                                                               |
| ----------------------- | ------------------------------------------- | ----------------------------------------------------------------- |
| Frontend + wire types   | TypeScript                                  | The frontend and canonical DTO definitions share one type system. |
| Backend implementation A | Node.js 20+ with Express 4 + TypeScript    | Fast development loop and direct use of `shared/`.                |
| Backend implementation B | Rust with Axum 0.7 + Tokio                 | Wire-compatible alternative with the same layered design.         |
| State store             | Per-process in-memory game map              | Single-player vs AI; trivially swappable.                         |
| Frontend                | React 19 + Vite 8 + TypeScript              | Matches the original prototype's stack; fast HMR.                 |
| Styling                 | Hand-written CSS variables                  | Preserves the original visual identity; no extra framework.       |
| Test runner             | (out of scope for v1)                       | Both backend designs admit focused unit/integration tests.         |

No build step is required for the `shared/` package. The TypeScript backend and
frontend consume it as a path-aliased TypeScript source folder via
`tsconfig.json` `paths` and Vite's `resolve.alias`. The Rust backend mirrors
the same wire definitions with Serde types in `backend-rs/src/shared/mod.rs`.
Changes to the wire contract must be applied to both representations.

## High-level architecture

```
        +-------------------+         HTTP/JSON         +----------------------+
        |  Frontend (React) |  ----------------------> | Choose one backend:  |
        |                   |  <---------------------- |                      |
        |  - UI components  |   GameStateDTO,          | - backend/           |
        |  - UI state       |   ActionResultDTO        |   Express/TypeScript |
        |    machine        |                          | - backend-rs/        |
        |  - API client     |                          |   Axum/Rust          |
        +-------------------+                          +----------------------+
                  ^                                              ^
                  |                                              |
                  +-------- shared HTTP/JSON contract -----------+
                           shared/ is canonical TS source;
                           backend-rs/src/shared mirrors it
```

Hard rules:

1. **The selected backend is authoritative.** The frontend never simulates a
   hit, never computes a turn outcome, never decides whether an action is legal.
   It sends an action and renders whatever `GameStateDTO` comes back.
2. **The frontend never receives the opponent's hidden state.** The backend serves
   *two different views* of the same game depending on which player is asking. The
   AI's ships are never sent to the human player as `positions[]` until they are
   hit or sunk.
3. **`shared/` contains only types and constants** - no runtime logic, so the
   frontend cannot accidentally depend on backend-only code. It is the canonical
   TypeScript wire contract; the Rust Serde types must remain equivalent.
4. **The two backends are interchangeable, not collaborative.** Run one at a
   time. They implement the same rules and API but keep separate in-memory game
   stores.

## Reading order

1. [`01-architecture.md`](./01-architecture.md) - layered architecture, request flow.
2. [`02-game-rules.md`](./02-game-rules.md) - the actual game design.
3. [`03-data-models.md`](./03-data-models.md) - entities and DTOs.
4. [`04-api-contracts.md`](./04-api-contracts.md) - every endpoint, every shape.
5. [`05-backend-modules.md`](./05-backend-modules.md) - shared backend layers +
   both implementation file maps.
6. [`06-ai-design.md`](./06-ai-design.md) - AI placement and turn policy.
7. [`07-frontend-architecture.md`](./07-frontend-architecture.md) - component tree.
8. [`08-state-management.md`](./08-state-management.md) - the UI state machine.
9. [`09-extensibility.md`](./09-extensibility.md) - how to add a ship/ability.
10. [`10-styling-and-ux.md`](./10-styling-and-ux.md) - design tokens and UX rules.
