import type { Game } from "../core/Game.js";

/**
 * Trivial in-memory store. Single-process only. Replaceable behind this
 * interface with Redis/Postgres if persistence is ever needed.
 */
export class GameStore {
  private games = new Map<string, Game>();

  get(id: string): Game | undefined {
    return this.games.get(id);
  }

  create(game: Game): void {
    this.games.set(game.id, game);
  }

  delete(id: string): boolean {
    return this.games.delete(id);
  }

  size(): number {
    return this.games.size;
  }
}
