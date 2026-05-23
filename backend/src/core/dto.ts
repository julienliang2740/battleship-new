import type { GameStateDTO, PlayerSide } from "@shared/index.js";
import type { Game } from "./Game.js";

/**
 * Project a Game to a serializable DTO from the requested viewer's perspective.
 *
 * - `viewer === "human"`: `you` is human (full view), `enemy` is AI (filtered).
 * - `viewer === "ai"`: symmetric. Used internally for tests/debugging only.
 */
export function toGameStateDTO(game: Game, viewer: PlayerSide = "human"): GameStateDTO {
  const own = game.boardFor(viewer);
  const enemy = game.enemyBoardFor(viewer);
  const dto: GameStateDTO = {
    gameId: game.id,
    phase: game.phase,
    activePlayer: game.activePlayer,
    you: own.toOwnerView(),
    enemy: enemy.toEnemyView(),
  };
  if (game.phase === "placement" && viewer === "human") {
    dto.placement = {
      order: [...game.placement.order],
      nextIndex: game.placement.nextIndex,
    };
  }
  if (game.winner) dto.winner = game.winner;
  return dto;
}
