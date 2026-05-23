import type { ActionKind, GameStateDTO, Orientation } from "@shared/index";

export type ActionFlowStep =
  | { step: "idle" }
  | { step: "shipSelected"; shipId: string }
  | { step: "actionArmed"; shipId: string; kind: ActionKind }
  | { step: "targeting"; shipId: string; kind: ActionKind; hovered?: number };

export interface Toast {
  id: number;
  kind: "good" | "bad" | "info";
  text: string;
}

export interface LogEntry {
  id: number;
  who: "you" | "enemy" | "neutral";
  text: string;
}

export interface UIState {
  flow: ActionFlowStep;
  orientation: Orientation; // for placement
  hoverCell?: number;        // for placement preview
  toasts: Toast[];
  log: LogEntry[];
}

export interface Store {
  state: GameStateDTO | null;
  ui: UIState;
  loading: boolean;
  error: string | null;
}
