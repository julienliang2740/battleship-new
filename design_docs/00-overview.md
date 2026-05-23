# 00 - Project Overview

## Goal

Reimplement the classic Battleship game with **tactical-unit mechanics**: ships are
not interchangeable hit-point pools that share a single shot per turn. Each ship is
an individual unit with its own attack profile, range, and abilities. A player's
options each turn are the union of what their currently-alive ships can do.

This codebase replaces the prior monolithic frontend-only prototype in `../battleship`
with a properly layered client/server design.

## Tech stack

| Layer        | Choice                          | Why                                                                 |
| ------------ | ------------------------------- | ------------------------------------------------------------------- |
| Language     | TypeScript everywhere           | Single language; shared DTOs between client and server.             |
| Backend      | Node.js 20+ with Express 4      | Smallest viable REST runtime; no ORM, no DB.                        |
| State store  | In-memory `Map<gameId, Game>`   | Single-process, single-player vs AI. Trivially swappable.           |
| Frontend     | React 19 + Vite 8 + TypeScript  | Matches the original prototype's stack; fast HMR.                   |
| Styling      | Hand-written CSS variables      | Preserves the original visual identity; no extra framework.         |
| Test runner  | (out of scope for v1)           | Architecture admits Vitest/Jest cleanly.                            |

No build step is required for the `shared/` package - the backend and frontend both
consume it as a path-aliased TypeScript source folder via `tsconfig.json` `paths`
and Vite's `resolve.alias`. This keeps types live without a publish step.

## High-level architecture

```
        +-------------------+         HTTP/JSON         +--------------------+
        |  Frontend (React) |  ----------------------> |   Backend (Express)  |
        |                   |  <---------------------- |                      |
        |  - UI components  |   GameStateDTO,          |  - REST API          |
        |  - UI state       |   ActionResultDTO        |  - Game / Board /    |
        |    machine        |                          |    Ship / AIOpponent |
        |  - API client     |                          |  - In-memory store   |
        +-------------------+                          +--------------------+
                  ^                                              ^
                  |                                              |
                  +--------------- shared/ (types) --------------+
```

Hard rules:

1. **The backend is authoritative.** The frontend never simulates a hit, never
   computes a turn outcome, never decides whether an action is legal. It sends an
   action and renders whatever `GameStateDTO` comes back.
2. **The frontend never receives the opponent's hidden state.** The backend serves
   *two different views* of the same game depending on which player is asking. The
   AI's ships are never sent to the human player as `positions[]` until they are
   hit or sunk.
3. **`shared/` contains only types and constants** - no runtime logic, so the
   frontend cannot accidentally depend on backend-only code.

## Reading order

1. [`01-architecture.md`](./01-architecture.md) - layered architecture, request flow.
2. [`02-game-rules.md`](./02-game-rules.md) - the actual game design.
3. [`03-data-models.md`](./03-data-models.md) - entities and DTOs.
4. [`04-api-contracts.md`](./04-api-contracts.md) - every endpoint, every shape.
5. [`05-backend-modules.md`](./05-backend-modules.md) - class diagram + file map.
6. [`06-ai-design.md`](./06-ai-design.md) - AI placement and turn policy.
7. [`07-frontend-architecture.md`](./07-frontend-architecture.md) - component tree.
8. [`08-state-management.md`](./08-state-management.md) - the UI state machine.
9. [`09-extensibility.md`](./09-extensibility.md) - how to add a ship/ability.
10. [`10-styling-and-ux.md`](./10-styling-and-ux.md) - design tokens and UX rules.
