import type { Request, Response } from "express";
import { fleetMeta } from "../models/ShipFactory.js";
import type { GameService } from "../services/GameService.js";
import {
  parseActionRequest,
  parseCreateBody,
  parsePlaceBody,
} from "./validators.js";

export class GameController {
  constructor(private service: GameService) {}

  createGame = (req: Request, res: Response): void => {
    const { seed } = parseCreateBody(req.body);
    const state = this.service.createGame(seed);
    res.status(201).json({ state });
  };

  getGame = (req: Request, res: Response): void => {
    const id = req.params.id!;
    const state = this.service.getView(id);
    res.json({ state });
  };

  deleteGame = (req: Request, res: Response): void => {
    const id = req.params.id!;
    this.service.deleteGame(id);
    res.status(204).end();
  };

  placeShip = (req: Request, res: Response): void => {
    const id = req.params.id!;
    const { kind, anchor, orientation } = parsePlaceBody(req.body);
    const state = this.service.placeShip(id, kind, anchor, orientation);
    res.json({ state });
  };

  placeRandom = (req: Request, res: Response): void => {
    const id = req.params.id!;
    const state = this.service.placeRandom(id);
    res.json({ state });
  };

  resetPlacement = (req: Request, res: Response): void => {
    const id = req.params.id!;
    const state = this.service.resetPlacement(id);
    res.json({ state });
  };

  postAction = (req: Request, res: Response): void => {
    const id = req.params.id!;
    const action = parseActionRequest(req.body);
    const result = this.service.applyAction(id, action);
    res.json(result);
  };

  aiStep = (req: Request, res: Response): void => {
    const id = req.params.id!;
    const result = this.service.aiStep(id);
    res.json(result);
  };

  getFleetMeta = (_req: Request, res: Response): void => {
    res.json(fleetMeta());
  };
}
