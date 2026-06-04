# Battleship (Advanced)

A redesign of the classic Battleship game where each ship is an individual tactical unit
with its own attack profile and abilities, played against an AI opponent.

The repository contains one frontend and two interchangeable backend
implementations:

| Folder         | Purpose                                                                  |
| -------------- | ------------------------------------------------------------------------ |
| `shared/`      | Canonical TypeScript DTOs and wire types used by the frontend and TS backend. |
| `backend/`     | Node.js + Express + TypeScript REST API.                                 |
| `backend-rs/`  | Rust + Axum REST API with the same HTTP behavior and JSON wire contract.  |
| `frontend/`    | React + Vite UI. Pure presentation; works with either backend.             |
| `design_docs/` | Exhaustive design documentation. Read this first.                         |

Both backends own all game state and AI logic. They expose the same endpoints
on port `4000` by default, so run exactly one of them at a time.

## Quick start

Choose one backend:

```bash
# Option A - TypeScript/Express backend on http://localhost:4000
cd backend
npm install
npm run dev
```

```bash
# Option B - Rust/Axum backend on http://localhost:4000
cd backend-rs
cargo run --release
```

Then run the frontend in another terminal:

```bash
cd frontend
npm install
npm run dev
```

The frontend dev server proxies `/api/*` to whichever backend is listening on
`http://localhost:4000` (see `frontend/vite.config.ts`). Each backend has its
own in-memory game store; switching implementations starts with an empty store.

## Documentation

Start with [`design_docs/00-overview.md`](./design_docs/00-overview.md).
The docs are written as a precise blueprint: any future agent or developer should be
able to add a new ship, ability, or game mode by following them without needing to
re-derive design decisions from the code.
