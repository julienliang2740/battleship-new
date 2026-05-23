import type {
  ActionKind,
  GameEvent,
  GameStateDTO,
  Orientation,
  ShipKind,
} from "@shared/index";
import type { LogEntry, Store, Toast } from "./types";

export type Action =
  | { type: "START_LOADING" }
  | { type: "STOP_LOADING" }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "SNAPSHOT"; state: GameStateDTO }
  | { type: "EVENTS"; events: GameEvent[] }
  | { type: "SET_ORIENTATION"; orientation: Orientation }
  | { type: "TOGGLE_ORIENTATION" }
  | { type: "HOVER_CELL"; cell: number | undefined }
  | { type: "SELECT_SHIP"; shipId: string }
  | { type: "SELECT_AND_ARM"; shipId: string; kind: ActionKind }
  | { type: "ARM_ACTION"; kind: ActionKind }
  | { type: "ENTER_TARGETING"; hovered: number }
  | { type: "CANCEL_FLOW" }
  | { type: "PUSH_TOAST"; toast: Toast }
  | { type: "DISMISS_TOAST"; id: number }
  | { type: "CLEAR_LOG" };

export const initialStore: Store = {
  state: null,
  ui: {
    flow: { step: "idle" },
    orientation: "horizontal",
    hoverCell: undefined,
    toasts: [],
    log: [],
  },
  loading: false,
  error: null,
};

let _nextId = 1;
function nextId(): number {
  return _nextId++;
}

function shipName(state: GameStateDTO | null, side: "you" | "enemy", kind: ShipKind): string {
  const list = state ? (side === "you" ? state.you.ships : state.enemy.ships) : [];
  return list.find((s) => s.kind === kind)?.name ?? kind;
}

function eventsToLogAndToasts(
  state: GameStateDTO | null,
  events: GameEvent[],
): { log: LogEntry[]; toasts: Toast[] } {
  const log: LogEntry[] = [];
  const toasts: Toast[] = [];

  for (const ev of events) {
    switch (ev.type) {
      case "shot": {
        const who = ev.by === "human" ? "you" : "enemy";
        const verb = ev.result === "hit" ? "hit" : "missed";
        log.push({
          id: nextId(),
          who,
          text: `${who === "you" ? "You" : "Enemy"} ${verb} at ${coordOf(ev.cell, state)}`,
        });
        break;
      }
      case "ship_sunk": {
        const owner = ev.by === "human" ? "you" : "enemy";
        const sunkSide = ev.by === "human" ? "enemy" : "you";
        const name = shipName(state, sunkSide, ev.shipKind);
        const text = owner === "you" ? `You sunk the enemy ${name}!` : `Enemy sunk your ${name}!`;
        log.push({ id: nextId(), who: owner, text });
        toasts.push({ id: nextId(), kind: owner === "you" ? "good" : "bad", text });
        break;
      }
      case "ship_moved": {
        const who = ev.side === "human" ? "you" : "enemy";
        log.push({ id: nextId(), who, text: `${who === "you" ? "Your" : "Enemy"} submarine moved.` });
        break;
      }
      case "ship_rotated": {
        const who = ev.side === "human" ? "you" : "enemy";
        log.push({ id: nextId(), who, text: `${who === "you" ? "Your" : "Enemy"} submarine rotated.` });
        break;
      }
      case "turn_started": {
        log.push({
          id: nextId(),
          who: "neutral",
          text: ev.player === "human" ? "Your turn." : "Enemy turn.",
        });
        break;
      }
      case "game_over": {
        const text = ev.winner === "human" ? "Victory! You sank their fleet." : "Defeat. Your fleet is sunk.";
        log.push({ id: nextId(), who: "neutral", text });
        toasts.push({ id: nextId(), kind: ev.winner === "human" ? "good" : "bad", text });
        break;
      }
    }
  }
  return { log, toasts };
}

function coordOf(cell: number, state: GameStateDTO | null): string {
  const size = state?.you.size ?? 12;
  const row = Math.floor(cell / size);
  const col = cell % size;
  const letter = "ABCDEFGHIJKLMNOP"[row] ?? `R${row}`;
  return `${letter}${col + 1}`;
}

export function reducer(store: Store, action: Action): Store {
  switch (action.type) {
    case "START_LOADING":
      return { ...store, loading: true, error: null };
    case "STOP_LOADING":
      return { ...store, loading: false };
    case "SET_ERROR":
      return { ...store, error: action.error };

    case "SNAPSHOT": {
      // Try to PRESERVE the action flow across snapshots so a player firing
      // their Carrier's 4 shots doesn't have to re-pick the ship and action
      // each time. We reset the flow when:
      //   - it is no longer the human's turn, or
      //   - the selected ship has been sunk or no longer exists, or
      //   - the selected ship has NO actions left at all (auto-clear so the
      //     user moves on to the next ship).
      // When the armed action's quota hit zero but OTHER kinds remain on the
      // same ship (only possible for Submarine pre-spend, basically), we
      // drop back to "shipSelected" so the menu stays on that ship.
      const flow = store.ui.flow;
      let nextFlow = flow;
      const newState = action.state;
      const isHumanTurn =
        newState.phase === "playing" && newState.activePlayer === "human";
      if (!isHumanTurn) {
        nextFlow = { step: "idle" };
      } else if (flow.step !== "idle") {
        const ship = newState.you.ships.find((s) => s.id === flow.shipId);
        const alive = !!ship && !ship.sunk;
        if (!alive) {
          nextFlow = { step: "idle" };
        } else {
          const totalLeft = ship.actionsRemaining
            ? Object.values(ship.actionsRemaining).reduce(
                (a: number, b) => a + (b ?? 0),
                0,
              )
            : 0;
          if (totalLeft <= 0) {
            // Ship is fully spent: auto-clear selection.
            nextFlow = { step: "idle" };
          } else if (flow.step === "actionArmed" || flow.step === "targeting") {
            const remaining = ship.actionsRemaining?.[flow.kind] ?? 0;
            if (remaining <= 0) {
              // Armed kind is spent but other kinds remain: fall back to
              // shipSelected so the player can pick another action.
              nextFlow = { step: "shipSelected", shipId: flow.shipId };
            }
          }
        }
      }
      return {
        ...store,
        state: newState,
        ui: { ...store.ui, flow: nextFlow, hoverCell: undefined },
        error: null,
      };
    }

    case "EVENTS": {
      const { log, toasts } = eventsToLogAndToasts(store.state, action.events);
      return {
        ...store,
        ui: {
          ...store.ui,
          log: [...store.ui.log, ...log].slice(-50),
          toasts: [...store.ui.toasts, ...toasts],
        },
      };
    }

    case "SET_ORIENTATION":
      return { ...store, ui: { ...store.ui, orientation: action.orientation } };
    case "TOGGLE_ORIENTATION":
      return {
        ...store,
        ui: {
          ...store.ui,
          orientation: store.ui.orientation === "horizontal" ? "vertical" : "horizontal",
        },
      };

    case "HOVER_CELL": {
      const flow = store.ui.flow;
      let newFlow = flow;
      if (flow.step === "actionArmed" && action.cell !== undefined) {
        newFlow = { step: "targeting", shipId: flow.shipId, kind: flow.kind, hovered: action.cell };
      } else if (flow.step === "targeting") {
        newFlow = { ...flow, hovered: action.cell };
      }
      return { ...store, ui: { ...store.ui, hoverCell: action.cell, flow: newFlow } };
    }

    case "SELECT_SHIP":
      return {
        ...store,
        ui: { ...store.ui, flow: { step: "shipSelected", shipId: action.shipId } },
      };

    case "SELECT_AND_ARM":
      return {
        ...store,
        ui: {
          ...store.ui,
          flow: { step: "actionArmed", shipId: action.shipId, kind: action.kind },
        },
      };

    case "ARM_ACTION": {
      const flow = store.ui.flow;
      if (flow.step !== "shipSelected" && flow.step !== "actionArmed" && flow.step !== "targeting") {
        return store; // can't arm without a selected ship
      }
      const shipId = flow.step === "shipSelected" ? flow.shipId : flow.shipId;
      return {
        ...store,
        ui: { ...store.ui, flow: { step: "actionArmed", shipId, kind: action.kind } },
      };
    }

    case "ENTER_TARGETING": {
      const flow = store.ui.flow;
      if (flow.step !== "actionArmed") return store;
      return {
        ...store,
        ui: {
          ...store.ui,
          flow: { step: "targeting", shipId: flow.shipId, kind: flow.kind, hovered: action.hovered },
        },
      };
    }

    case "CANCEL_FLOW":
      return {
        ...store,
        ui: { ...store.ui, flow: { step: "idle" }, hoverCell: undefined },
      };

    case "PUSH_TOAST":
      return { ...store, ui: { ...store.ui, toasts: [...store.ui.toasts, action.toast] } };
    case "DISMISS_TOAST":
      return {
        ...store,
        ui: { ...store.ui, toasts: store.ui.toasts.filter((t) => t.id !== action.id) },
      };

    case "CLEAR_LOG":
      return { ...store, ui: { ...store.ui, log: [] } };
  }
}

export const nextToastId = nextId;
