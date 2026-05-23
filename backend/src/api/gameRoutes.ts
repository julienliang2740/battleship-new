import { Router } from "express";
import type { GameController } from "./gameController.js";

export function buildGameRouter(controller: GameController): Router {
  const r = Router();

  r.get("/meta/fleet", controller.getFleetMeta);

  r.post("/games", controller.createGame);
  r.get("/games/:id", controller.getGame);
  r.delete("/games/:id", controller.deleteGame);

  r.post("/games/:id/place", controller.placeShip);
  r.post("/games/:id/place-random", controller.placeRandom);
  r.post("/games/:id/reset-placement", controller.resetPlacement);
  r.post("/games/:id/actions", controller.postAction);
  r.post("/games/:id/ai-step", controller.aiStep);

  return r;
}
