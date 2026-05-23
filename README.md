# Battleship (Advanced)

A redesign of the classic Battleship game where each ship is an individual tactical unit
with its own attack profile and abilities, played against an AI opponent.

This repository is split into three TypeScript projects:

| Folder      | Purpose                                                       |
| ----------- | ------------------------------------------------------------- |
| `shared/`   | DTOs and shared types used by both frontend and backend.      |
| `backend/`  | Node.js + Express REST API. Owns all game state and AI logic. |
| `frontend/` | React + Vite UI. Pure presentation; calls the backend API.    |
| `design_docs/` | Exhaustive design documentation. Read this first.          |

## Quick start

In two terminals:

```bash
# Terminal 1 - backend on http://localhost:4000
cd backend
npm install
npm run dev

# Terminal 2 - frontend on http://localhost:5173
cd frontend
npm install
npm run dev
```

The frontend dev server proxies `/api/*` to the backend (see `frontend/vite.config.ts`).

## Documentation

Start with [`design_docs/00-overview.md`](./design_docs/00-overview.md).
The docs are written as a precise blueprint: any future agent or developer should be
able to add a new ship, ability, or game mode by following them without needing to
re-derive design decisions from the code.
