import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import type {
  ActionKind,
  GameStateDTO,
  Orientation,
  ShipActionRequest,
  ShipKind,
} from "@shared/index";
import { ApiClientError, api } from "../api/client";
import { initialStore, reducer, nextToastId } from "./reducer";
import type { Store } from "./types";

const LS_KEY = "battleship.gameId";

interface GameApi {
  store: Store;
  newGame: () => Promise<void>;
  placeShip: (kind: ShipKind, anchor: number, orientation: Orientation) => Promise<void>;
  placeRandom: () => Promise<void>;
  resetPlacement: () => Promise<void>;
  submitAction: (req: ShipActionRequest) => Promise<void>;
  endTurn: () => Promise<void>;

  // UI flow
  selectShip: (shipId: string) => void;
  selectAndArm: (shipId: string, kind: ActionKind) => void;
  armAction: (kind: ActionKind) => void;
  cancelFlow: () => void;
  hoverCell: (cell: number | undefined) => void;

  // Placement helpers
  setOrientation: (o: Orientation) => void;
  toggleOrientation: () => void;

  // Misc
  dismissToast: (id: number) => void;
}

const Ctx = createContext<GameApi | null>(null);

export function useGame(): GameApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useGame must be used inside <GameProvider>");
  return ctx;
}

export function GameProvider({ children }: { children: ReactNode }): React.ReactElement {
  const [store, dispatch] = useReducer(reducer, initialStore);

  const handleError = useCallback((err: unknown) => {
    if (err instanceof ApiClientError) {
      dispatch({ type: "SET_ERROR", error: err.message });
      dispatch({
        type: "PUSH_TOAST",
        toast: { id: nextToastId(), kind: "bad", text: err.message },
      });
    } else {
      const msg = err instanceof Error ? err.message : "Network error";
      dispatch({ type: "SET_ERROR", error: msg });
    }
  }, []);

  // Bootstrap: try existing gameId from localStorage, else create.
  useEffect(() => {
    let cancelled = false;
    async function boot(): Promise<void> {
      dispatch({ type: "START_LOADING" });
      try {
        const existing = typeof window !== "undefined" ? window.localStorage.getItem(LS_KEY) : null;
        if (existing) {
          try {
            const { state } = await api.getGame(existing);
            if (cancelled) return;
            dispatch({ type: "SNAPSHOT", state });
            return;
          } catch {
            window.localStorage.removeItem(LS_KEY);
          }
        }
        const { state } = await api.createGame();
        if (cancelled) return;
        window.localStorage.setItem(LS_KEY, state.gameId);
        dispatch({ type: "SNAPSHOT", state });
      } catch (e) {
        handleError(e);
      } finally {
        if (!cancelled) dispatch({ type: "STOP_LOADING" });
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, [handleError]);

  const requireId = useCallback((): string => {
    const id = store.state?.gameId;
    if (!id) throw new Error("No active game.");
    return id;
  }, [store.state]);

  const setSnapshot = useCallback(
    (state: GameStateDTO, events?: import("@shared/index").GameEvent[]) => {
      if (events && events.length > 0) dispatch({ type: "EVENTS", events });
      dispatch({ type: "SNAPSHOT", state });
    },
    [],
  );

  const newGame = useCallback(async () => {
    dispatch({ type: "START_LOADING" });
    try {
      const { state } = await api.createGame();
      window.localStorage.setItem(LS_KEY, state.gameId);
      dispatch({ type: "CLEAR_LOG" });
      setSnapshot(state);
    } catch (e) {
      handleError(e);
    } finally {
      dispatch({ type: "STOP_LOADING" });
    }
  }, [handleError, setSnapshot]);

  const placeShip = useCallback(
    async (kind: ShipKind, anchor: number, orientation: Orientation) => {
      const id = requireId();
      try {
        const { state } = await api.placeShip(id, kind, anchor, orientation);
        setSnapshot(state);
      } catch (e) {
        handleError(e);
      }
    },
    [handleError, requireId, setSnapshot],
  );

  const placeRandom = useCallback(async () => {
    const id = requireId();
    try {
      const { state } = await api.placeRandom(id);
      setSnapshot(state);
    } catch (e) {
      handleError(e);
    }
  }, [handleError, requireId, setSnapshot]);

  const resetPlacement = useCallback(async () => {
    const id = requireId();
    try {
      const { state } = await api.resetPlacement(id);
      setSnapshot(state);
    } catch (e) {
      handleError(e);
    }
  }, [handleError, requireId, setSnapshot]);

  const submitAction = useCallback(
    async (req: ShipActionRequest) => {
      const id = requireId();
      try {
        const { state, events } = await api.postAction(id, req);
        setSnapshot(state, events);
      } catch (e) {
        handleError(e);
      }
    },
    [handleError, requireId, setSnapshot],
  );

  const endTurn = useCallback(async () => {
    const id = requireId();
    try {
      const { state, events } = await api.postAction(id, { endTurn: true });
      setSnapshot(state, events);
    } catch (e) {
      handleError(e);
    }
  }, [handleError, requireId, setSnapshot]);

  // Step the AI one action at a time. Each call returns events for a single
  // AI action (or a small burst, e.g. all 4 cells of a 2x2 strike), which the
  // UI then animates separately from the next step.
  const aiStep = useCallback(async () => {
    const id = requireId();
    try {
      const { state, events } = await api.aiStep(id);
      setSnapshot(state, events);
    } catch (e) {
      handleError(e);
    }
  }, [handleError, requireId, setSnapshot]);

  const selectShip = useCallback((shipId: string) => {
    dispatch({ type: "SELECT_SHIP", shipId });
  }, []);
  const selectAndArm = useCallback((shipId: string, kind: ActionKind) => {
    dispatch({ type: "SELECT_AND_ARM", shipId, kind });
  }, []);
  const armAction = useCallback((kind: ActionKind) => {
    dispatch({ type: "ARM_ACTION", kind });
  }, []);
  const cancelFlow = useCallback(() => {
    dispatch({ type: "CANCEL_FLOW" });
  }, []);
  const hoverCell = useCallback((cell: number | undefined) => {
    dispatch({ type: "HOVER_CELL", cell });
  }, []);
  const setOrientation = useCallback((o: Orientation) => {
    dispatch({ type: "SET_ORIENTATION", orientation: o });
  }, []);
  const toggleOrientation = useCallback(() => {
    dispatch({ type: "TOGGLE_ORIENTATION" });
  }, []);

  const dismissToast = useCallback((id: number) => {
    dispatch({ type: "DISMISS_TOAST", id });
  }, []);

  // Auto-dismiss toasts after 3.2 seconds.
  useEffect(() => {
    if (store.ui.toasts.length === 0) return;
    const oldest = store.ui.toasts[0]!;
    const timer = setTimeout(() => dismissToast(oldest.id), 3200);
    return () => clearTimeout(timer);
  }, [store.ui.toasts, dismissToast]);

  // Keyboard: R to toggle orientation in placement; Escape to cancel flow.
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") {
        cancelFlow();
        return;
      }
      if ((e.key === "r" || e.key === "R") && store.state?.phase === "placement") {
        toggleOrientation();
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [cancelFlow, toggleOrientation, store.state?.phase]);

  // Auto-step the AI whenever it's their turn. We use a single timer that
  // re-arms after every snapshot update. The 700ms cadence gives the user
  // time to read each event without making the game feel slow.
  useEffect(() => {
    if (!store.state) return;
    if (store.state.phase !== "playing") return;
    if (store.state.activePlayer !== "ai") return;
    if (store.loading) return;
    const t = setTimeout(() => {
      void aiStep();
    }, 700);
    return () => clearTimeout(t);
  }, [
    store.state?.gameId,
    store.state?.phase,
    store.state?.activePlayer,
    store.loading,
    // Re-run when the log changes (i.e. a new step has been applied).
    store.ui.log.length,
    aiStep,
  ]);

  const value = useMemo<GameApi>(
    () => ({
      store,
      newGame,
      placeShip,
      placeRandom,
      resetPlacement,
      submitAction,
      endTurn,
      selectShip,
      selectAndArm,
      armAction,
      cancelFlow,
      hoverCell,
      setOrientation,
      toggleOrientation,
      dismissToast,
    }),
    [
      store,
      newGame,
      placeShip,
      placeRandom,
      resetPlacement,
      submitAction,
      endTurn,
      selectShip,
      selectAndArm,
      armAction,
      cancelFlow,
      hoverCell,
      setOrientation,
      toggleOrientation,
      dismissToast,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
