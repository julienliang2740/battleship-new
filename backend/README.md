# Battleship Backend (TypeScript)

Node.js + Express + TypeScript implementation of the Battleship REST API. It is
one of two supported, interchangeable backends; `../backend-rs` implements the
same API in Rust with Axum.

## Run

```bash
npm install
npm run dev
```

The server listens on `http://localhost:4000` by default. Run either this
backend or `../backend-rs`, not both on the same port. Both stores are
in-memory and do not share games.

## Compatibility

This implementation consumes the canonical TypeScript DTOs from `../shared`.
Any API, game-rule, DTO, AI, or error behavior change must also be made in the
Rust backend so both remain wire-compatible.

See `../design_docs/04-api-contracts.md` for the shared API contract and
`../design_docs/05-backend-modules.md` for both backend layouts.
