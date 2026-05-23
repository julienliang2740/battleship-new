import type {
  ActionRequest,
  FleetMetaDTO,
  GameEvent,
  GameStateDTO,
  Orientation,
  ShipKind,
} from "@shared/index";

const BASE = "/api";

interface ErrorEnvelope {
  error: { code: string; message: string };
}

export class ApiClientError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const body = text ? (JSON.parse(text) as T | ErrorEnvelope) : ({} as T);
  if (!res.ok) {
    const err = body as ErrorEnvelope;
    throw new ApiClientError(
      err.error?.code ?? "UNKNOWN",
      err.error?.message ?? `HTTP ${res.status}`,
    );
  }
  return body as T;
}

export const api = {
  createGame: (seed?: number) =>
    call<{ state: GameStateDTO }>("/games", {
      method: "POST",
      body: JSON.stringify({ seed }),
    }),
  getGame: (id: string) => call<{ state: GameStateDTO }>(`/games/${id}`),
  deleteGame: (id: string) =>
    call<void>(`/games/${id}`, { method: "DELETE" }),
  placeShip: (id: string, kind: ShipKind, anchor: number, orientation: Orientation) =>
    call<{ state: GameStateDTO }>(`/games/${id}/place`, {
      method: "POST",
      body: JSON.stringify({ kind, anchor, orientation }),
    }),
  placeRandom: (id: string) =>
    call<{ state: GameStateDTO }>(`/games/${id}/place-random`, { method: "POST" }),
  resetPlacement: (id: string) =>
    call<{ state: GameStateDTO }>(`/games/${id}/reset-placement`, { method: "POST" }),
  postAction: (id: string, req: ActionRequest) =>
    call<{ state: GameStateDTO; events: GameEvent[] }>(`/games/${id}/actions`, {
      method: "POST",
      body: JSON.stringify(req),
    }),
  aiStep: (id: string) =>
    call<{ state: GameStateDTO; events: GameEvent[]; aiDone: boolean }>(
      `/games/${id}/ai-step`,
      { method: "POST" },
    ),
  fleetMeta: () => call<FleetMetaDTO>("/meta/fleet"),
};
