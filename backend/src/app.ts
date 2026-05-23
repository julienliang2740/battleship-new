import cors from "cors";
import express, { type Express } from "express";
import { GameController, buildGameRouter, errorHandler } from "./api/index.js";
import { GameService } from "./services/GameService.js";
import { GameStore } from "./services/GameStore.js";

export function createApp(): Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "64kb" }));

  const store = new GameStore();
  const service = new GameService(store);
  const controller = new GameController(service);

  app.get("/health", (_req, res) => {
    res.json({ ok: true, games: store.size() });
  });

  app.use("/api", buildGameRouter(controller));

  app.use(errorHandler);
  return app;
}
