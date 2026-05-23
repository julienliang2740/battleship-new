import type { BoardViewDTO } from "./board.js";
import type { ShipKind } from "./ships.js";

export type PlayerSide = "human" | "ai";

export type GamePhase = "placement" | "playing" | "gameover";

/** Progress through the human player's initial ship placement. */
export interface PlacementProgress {
  /** Order in which the human must place ships. */
  order: ShipKind[];
  /** Index of the next ship to place; equal to order.length when complete. */
  nextIndex: number;
}

/** Complete game snapshot from the requester's perspective. */
export interface GameStateDTO {
  gameId: string;
  phase: GamePhase;
  activePlayer: PlayerSide;
  you: BoardViewDTO;
  enemy: BoardViewDTO;
  placement?: PlacementProgress;
  winner?: PlayerSide;
}
