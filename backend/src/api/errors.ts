import type { NextFunction, Request, Response } from "express";

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "NOT_FOUND"
  | "WRONG_PHASE"
  | "NOT_YOUR_TURN"
  | "INVALID_PLACE"
  | "INVALID_ACTION"
  | "NO_QUOTA"
  | "INVALID_TARGET"
  | "GAME_OVER"
  | "INTERNAL";

const STATUS: Record<ApiErrorCode, number> = {
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  WRONG_PHASE: 409,
  NOT_YOUR_TURN: 409,
  INVALID_PLACE: 422,
  INVALID_ACTION: 422,
  NO_QUOTA: 422,
  INVALID_TARGET: 422,
  GAME_OVER: 409,
  INTERNAL: 500,
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;

  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.code = code;
    this.status = STATUS[code];
  }
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  const message = err instanceof Error ? err.message : "Unexpected server error.";
  res
    .status(500)
    .json({ error: { code: "INTERNAL", message } });
}
