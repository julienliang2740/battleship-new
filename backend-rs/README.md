# Battleship Backend (Rust)

Rust + Axum implementation of the Battleship REST API. It is a drop-in
alternative to the peer Node.js + Express + TypeScript implementation in
`../backend`. Both expose exactly the same HTTP API on the same default port
(`4000`) and produce byte-identical JSON responses for the flows the frontend
uses.

## Run

```bash
cargo run --release       # listens on http://localhost:4000
PORT=4001 cargo run --release   # custom port
```

Run either this backend or the TypeScript backend, not both on port `4000`.
They use independent in-memory stores and do not share games.

## Architecture

Same module layout as the TS backend:

| Module             | Mirrors                            |
| ------------------ | ---------------------------------- |
| `src/shared`       | `shared/src/*.ts`                  |
| `src/config.rs`    | `backend/src/config.ts`            |
| `src/core/rng.rs`  | `backend/src/core/rng.ts`          |
| `src/core/coords.rs` | `backend/src/core/coords.ts`     |
| `src/core/board.rs` | `backend/src/core/Board.ts`       |
| `src/core/game.rs` | `backend/src/core/Game.ts`         |
| `src/core/actions/` | `backend/src/core/actions/`       |
| `src/core/dto.rs`  | `backend/src/core/dto.ts`          |
| `src/models/`      | `backend/src/models/`              |
| `src/ai/`          | `backend/src/ai/`                  |
| `src/services/`    | `backend/src/services/`            |
| `src/api/`         | `backend/src/api/` (uses axum)     |
| `src/app.rs`       | `backend/src/app.ts`               |
| `src/main.rs`      | `backend/src/server.ts`            |

The framework is `axum` (Tokio) instead of Express; the layered shape
(routes -> controller -> service -> game/board/actions/ai) is preserved.

## Wire compatibility

The Rust port reproduces the TS mulberry32 PRNG bit-for-bit, so the same
`seed` value in `POST /api/games` produces the same AI fleet placement and
the same AI decisions. JSON fields, enum spellings, event order, HTTP status
codes, and error message strings match the TS backend exactly (verified via
side-by-side diff over a 20-turn game).

The canonical TypeScript wire definitions live in `../shared`; their Serde
mirror lives in `src/shared/mod.rs`. Any API, game-rule, DTO, AI, or error
behavior change must be made in both backends.

See `../design_docs/04-api-contracts.md` for the shared API contract and
`../design_docs/05-backend-modules.md` for both backend layouts.
