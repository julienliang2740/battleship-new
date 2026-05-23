import { useMemo, useRef, useState } from "react";
import type { ActionKind, ShipDTO, ShipKind } from "@shared/index";
import { BattleLog } from "./components/BattleLog";
import { BoardView } from "./components/BoardView";
import { FleetPanel } from "./components/FleetPanel";
import { PlacementPanel } from "./components/PlacementPanel";
import { ShipHoverMenu } from "./components/ShipHoverMenu";
import { Toasts } from "./components/Toasts";
import { useGame } from "./state/GameContext";

const KIND_LENGTH: Record<ShipKind, number> = {
  AIRCRAFT_CARRIER: 8,
  BATTLESHIP: 6,
  CRUISER: 4,
  FRIGATE: 3,
  SUBMARINE: 2,
};

export function App(): React.ReactElement {
  const {
    store,
    newGame,
    placeShip,
    submitAction,
    hoverCell,
    endTurn,
    cancelFlow,
  } = useGame();

  const state = store.state;
  const ui = store.ui;

  // -- Selected ship (sticky after click) --------------------------------
  const selectedShipId: string | null =
    ui.flow.step === "idle" ? null : ui.flow.shipId;
  const selectedShip: ShipDTO | undefined = useMemo(() => {
    if (!state || !selectedShipId) return undefined;
    return state.you.ships.find((s) => s.id === selectedShipId);
  }, [state, selectedShipId]);

  // -- Hovered own ship (transient; shows the popover before commit) -----
  const [hoveredOwnShipId, setHoveredOwnShipId] = useState<string | null>(null);
  const hoverTimerRef = useRef<number | null>(null);

  function scheduleHoverClear(): void {
    if (hoverTimerRef.current != null) window.clearTimeout(hoverTimerRef.current);
    // 150ms grace period so the user can move the mouse from a ship cell
    // into the popover without the menu vanishing.
    hoverTimerRef.current = window.setTimeout(() => {
      setHoveredOwnShipId(null);
    }, 150);
  }

  function cancelHoverClear(): void {
    if (hoverTimerRef.current != null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }

  // The ship whose menu should currently be visible. Selected wins over hovered.
  const menuShipId = selectedShipId ?? hoveredOwnShipId;
  const menuShip: ShipDTO | undefined = useMemo(() => {
    if (!state || !menuShipId) return undefined;
    return state.you.ships.find((s) => s.id === menuShipId);
  }, [state, menuShipId]);

  const armedKind: ActionKind | null =
    ui.flow.step === "actionArmed" || ui.flow.step === "targeting" ? ui.flow.kind : null;

  const enemyHoverCell = ui.flow.step === "targeting" ? ui.flow.hovered : undefined;

  // -- Enemy-board highlights (action targeting preview) -----------------
  const enemyHighlights = useMemo<{ cells: number[]; valid: boolean }>(() => {
    if (!state) return { cells: [], valid: true };
    if (enemyHoverCell === undefined) return { cells: [], valid: true };
    const size = state.enemy.size;
    if (armedKind === "SINGLE_HIT") {
      const valid = state.enemy.cells[enemyHoverCell] === "UNKNOWN";
      return { cells: [enemyHoverCell], valid };
    }
    if (armedKind === "AREA_HIT_2X2") {
      const row = Math.floor(enemyHoverCell / size);
      const col = enemyHoverCell % size;
      const cells: number[] = [];
      let valid = row < size - 1 && col < size - 1;
      for (let dr = 0; dr < 2; dr++) {
        for (let dc = 0; dc < 2; dc++) {
          const r = row + dr;
          const c = col + dc;
          if (r < size && c < size) cells.push(r * size + c);
        }
      }
      if (valid && !cells.some((c) => state.enemy.cells[c] === "UNKNOWN")) {
        valid = false;
      }
      return { cells, valid };
    }
    return { cells: [], valid: true };
  }, [state, enemyHoverCell, armedKind]);

  // -- Own-board highlights (placement preview) --------------------------
  const ownHighlights = useMemo<{ cells: number[]; valid: boolean }>(() => {
    if (!state || state.phase !== "placement") return { cells: [], valid: true };
    if (ui.hoverCell === undefined) return { cells: [], valid: true };
    const placement = state.placement!;
    const nextKind = placement.order[placement.nextIndex];
    if (!nextKind) return { cells: [], valid: true };
    const length = KIND_LENGTH[nextKind];
    const size = state.you.size;
    const row = Math.floor(ui.hoverCell / size);
    const col = ui.hoverCell % size;
    const cells: number[] = [];
    for (let i = 0; i < length; i++) {
      const r = ui.orientation === "horizontal" ? row : row + i;
      const c = ui.orientation === "horizontal" ? col + i : col;
      if (r >= size || c >= size) return { cells, valid: false };
      cells.push(r * size + c);
    }
    const valid = cells.every((c) => state.you.cells[c] !== "SHIP");
    return { cells, valid };
  }, [state, ui.hoverCell, ui.orientation]);

  const selectedShipCells = selectedShip?.positions ?? [];
  const hoveredShipCells = !selectedShipId && hoveredOwnShipId
    ? (state?.you.ships.find((s) => s.id === hoveredOwnShipId)?.positions ?? [])
    : [];

  // -- Lookup: ownCell -> shipId (for hover detection) ------------------
  const ownCellToShipId = useMemo<Record<number, string>>(() => {
    const out: Record<number, string> = {};
    if (!state) return out;
    for (const s of state.you.ships) {
      if (s.sunk) continue; // sunk ships don't participate
      for (const c of s.positions) out[c] = s.id;
    }
    return out;
  }, [state]);

  // -- DOM refs for the menu positioner --------------------------------
  const ownBoardRef = useRef<HTMLDivElement | null>(null);

  // -- Handlers --------------------------------------------------------
  function handleOwnCellClick(cell: number): void {
    if (!state) return;
    if (state.phase === "placement") {
      const placement = state.placement!;
      const nextKind = placement.order[placement.nextIndex];
      if (!nextKind) return;
      if (!ownHighlights.valid) return;
      void placeShip(nextKind, cell, ui.orientation);
    }
  }

  function handleOwnCellHover(cell: number): void {
    hoverCell(cell);
    if (state?.phase === "playing" && state.activePlayer === "human") {
      const shipId = ownCellToShipId[cell];
      if (shipId) {
        cancelHoverClear();
        setHoveredOwnShipId(shipId);
      } else {
        scheduleHoverClear();
      }
    }
  }

  function handleOwnMouseLeave(): void {
    hoverCell(undefined);
    scheduleHoverClear();
  }

  function handleEnemyCellClick(cell: number): void {
    if (!state || state.phase !== "playing") return;
    if (state.activePlayer !== "human") return;
    if (!selectedShip || !armedKind) return;
    if (armedKind === "SINGLE_HIT") {
      if (!enemyHighlights.valid) return;
      void submitAction({ shipId: selectedShip.id, kind: "SINGLE_HIT", targets: [cell] });
    } else if (armedKind === "AREA_HIT_2X2") {
      if (!enemyHighlights.valid) return;
      void submitAction({ shipId: selectedShip.id, kind: "AREA_HIT_2X2", targets: [cell] });
    }
  }

  function handleEnemyBoardLeave(): void {
    hoverCell(undefined);
  }

  const yourTurn = state?.phase === "playing" && state.activePlayer === "human";
  const noActionsLeft =
    state &&
    state.phase === "playing" &&
    state.activePlayer === "human" &&
    state.you.ships.every((s) => {
      if (s.sunk) return true;
      if (!s.actionsRemaining) return true;
      return Object.values(s.actionsRemaining).every((v) => (v ?? 0) <= 0);
    });

  // Build the ship-menu overlay element for the own board.
  const ownBoardOverlay =
    state && state.phase === "playing" && menuShip && yourTurn ? (
      <ShipHoverMenu
        ship={menuShip}
        boardEl={ownBoardRef.current}
        armedKind={armedKind}
        onMouseEnter={cancelHoverClear}
        onMouseLeave={scheduleHoverClear}
      />
    ) : null;

  return (
    <div className="app">
      <header>
        <h1>Battleship</h1>
        <div className="status">
          {!state && <span>Loading...</span>}
          {state?.phase === "placement" && <span>Place your fleet to begin.</span>}
          {state?.phase === "playing" && (
            <span>
              {yourTurn ? (
                ui.flow.step === "idle" ? (
                  <>Hover one of your ships to see its actions.</>
                ) : ui.flow.step === "shipSelected" ? (
                  <>Pick an action for {selectedShip?.name}.</>
                ) : (
                  <>Target the enemy board, or press Esc to cancel.</>
                )
              ) : (
                <>Enemy is taking their turn...</>
              )}
            </span>
          )}
          {state?.phase === "gameover" && (
            <span className="winner">
              {state.winner === "human" ? "Victory!" : "Defeat."}
            </span>
          )}
        </div>
        <div className="controls">
          {yourTurn && selectedShip && (
            <button onClick={cancelFlow} title="Clear selection (Esc)">
              Clear selection
            </button>
          )}
          {yourTurn && (
            <button
              onClick={endTurn}
              className={noActionsLeft ? "primary glow" : "primary"}
              title={noActionsLeft ? "All actions spent. End turn." : "Pass the turn to the enemy"}
            >
              End Turn
            </button>
          )}
          <button onClick={newGame}>New Game</button>
        </div>
      </header>

      <main className="boards">
        <BoardView
          ref={ownBoardRef}
          title="Your Waters"
          board={state ? state.you : { size: 12, cells: [], ships: [] }}
          highlight={state?.phase === "placement" ? ownHighlights.cells : []}
          highlightValid={ownHighlights.valid}
          selectedShipCells={selectedShipCells}
          hoveredShipCells={hoveredShipCells}
          disabled={!state}
          onCellClick={handleOwnCellClick}
          onCellHover={handleOwnCellHover}
          onMouseLeave={handleOwnMouseLeave}
          overlay={ownBoardOverlay}
        />
        <BoardView
          title="Enemy Waters"
          board={state ? state.enemy : { size: 12, cells: [], ships: [] }}
          highlight={enemyHighlights.cells}
          highlightValid={enemyHighlights.valid}
          disabled={
            !state ||
            state.phase !== "playing" ||
            state.activePlayer !== "human" ||
            !armedKind ||
            armedKind === "MOVE_1" ||
            armedKind === "ROTATE_90"
          }
          onCellClick={handleEnemyCellClick}
          onCellHover={(c) => hoverCell(c)}
          onMouseLeave={handleEnemyBoardLeave}
        />
      </main>

      <aside className="sidebar">
        {state?.phase === "placement" && <PlacementPanel />}
        {state && (
          <FleetPanel
            title="Your Fleet"
            ships={state.you.ships}
            selectedShipId={selectedShip?.id}
          />
        )}
        {state && <FleetPanel title="Enemy Fleet" ships={state.enemy.ships} />}
        <BattleLog />
      </aside>

      <Toasts />
    </div>
  );
}
