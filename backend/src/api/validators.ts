import type {
  ActionKind,
  ActionRequest,
  Direction,
  Orientation,
  ShipKind,
} from "@shared/index.js";
import { ApiError } from "./errors.js";

const SHIP_KINDS: ShipKind[] = [
  "AIRCRAFT_CARRIER",
  "BATTLESHIP",
  "CRUISER",
  "FRIGATE",
  "SUBMARINE",
];

const ACTION_KINDS: ActionKind[] = [
  "SINGLE_HIT",
  "AREA_HIT_2X2",
  "MOVE_1",
  "ROTATE_90",
];

const ORIENTATIONS: Orientation[] = ["horizontal", "vertical"];

const DIRECTIONS: Direction[] = ["N", "E", "S", "W"];

function need(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new ApiError("BAD_REQUEST", msg);
}

export function asString(v: unknown, field: string): string {
  need(typeof v === "string" && v.length > 0, `Missing field: ${field}`);
  return v as string;
}

export function asNonNegInt(v: unknown, field: string): number {
  need(typeof v === "number" && Number.isInteger(v) && v >= 0, `Field ${field} must be a non-negative integer`);
  return v as number;
}

export function asShipKind(v: unknown): ShipKind {
  need(typeof v === "string" && SHIP_KINDS.includes(v as ShipKind), `Invalid ship kind: ${v}`);
  return v as ShipKind;
}

export function asOrientation(v: unknown): Orientation {
  need(typeof v === "string" && ORIENTATIONS.includes(v as Orientation), `Invalid orientation: ${v}`);
  return v as Orientation;
}

export function asActionKind(v: unknown): ActionKind {
  need(typeof v === "string" && ACTION_KINDS.includes(v as ActionKind), `Invalid action kind: ${v}`);
  return v as ActionKind;
}

export function asDirection(v: unknown): Direction {
  need(typeof v === "string" && DIRECTIONS.includes(v as Direction), `Invalid direction: ${v}`);
  return v as Direction;
}

/** Validate the body of `POST /api/games/:id/actions`. */
export function parseActionRequest(body: unknown): ActionRequest {
  need(body && typeof body === "object", "Request body must be a JSON object");
  const obj = body as Record<string, unknown>;

  if (obj.endTurn === true) {
    return { endTurn: true };
  }

  const shipId = asString(obj.shipId, "shipId");
  const kind = asActionKind(obj.kind);
  const targetsRaw = obj.targets;
  need(Array.isArray(targetsRaw), "Field 'targets' must be an array of cell indices");
  const targets = (targetsRaw as unknown[]).map((t, i) => asNonNegInt(t, `targets[${i}]`));
  const out: ActionRequest = { shipId, kind, targets };
  if (obj.direction !== undefined) {
    (out as { direction?: Direction }).direction = asDirection(obj.direction);
  }
  return out;
}

/** Validate `POST /api/games/:id/place`. */
export function parsePlaceBody(body: unknown): {
  kind: ShipKind;
  anchor: number;
  orientation: Orientation;
} {
  need(body && typeof body === "object", "Request body must be a JSON object");
  const obj = body as Record<string, unknown>;
  return {
    kind: asShipKind(obj.kind),
    anchor: asNonNegInt(obj.anchor, "anchor"),
    orientation: asOrientation(obj.orientation),
  };
}

/** Validate `POST /api/games` body (optional seed). */
export function parseCreateBody(body: unknown): { seed?: number } {
  if (!body || typeof body !== "object") return {};
  const obj = body as Record<string, unknown>;
  if (obj.seed === undefined) return {};
  return { seed: asNonNegInt(obj.seed, "seed") };
}
