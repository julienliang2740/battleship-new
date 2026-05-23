import { useLayoutEffect, useState } from "react";
import type { ActionKind, Direction, ShipDTO } from "@shared/index";
import { useGame } from "../state/GameContext";

const ACTION_LABEL: Record<ActionKind, string> = {
  SINGLE_HIT: "Fire shot",
  AREA_HIT_2X2: "2x2 strike",
  MOVE_1: "Move",
  ROTATE_90: "Rotate 90 deg",
};

const ACTION_HINT: Record<ActionKind, string> = {
  SINGLE_HIT: "Click any enemy cell.",
  AREA_HIT_2X2: "Click the top-left of a 2x2 region on the enemy board.",
  MOVE_1: "Pick a direction:",
  ROTATE_90: "",
};

interface ShipHoverMenuProps {
  /** The ship that the menu is for. */
  ship: ShipDTO;
  /** Ref to the board grid element containing the ship's cells. */
  boardEl: HTMLElement | null;
  /** Currently armed action kind, if any (for highlighting buttons). */
  armedKind: ActionKind | null;
  /** Called when the user dismisses (hover out without a sticky state). */
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

/**
 * Floating popover anchored to the right (or left, if no room) of the ship's
 * bounding box. Lists each available action as a clickable button.
 *
 * The popover does NOT use a portal: it lives inside the same `.board-stage`
 * container, absolutely positioned. This makes hover-tunneling
 * (ship -> popover) trivial because the elements are siblings inside a
 * common pointer-handling region.
 */
export function ShipHoverMenu({
  ship,
  boardEl,
  armedKind,
  onMouseEnter,
  onMouseLeave,
}: ShipHoverMenuProps): React.ReactElement | null {
  const { armAction, submitAction, selectAndArm, store } = useGame();
  const [pos, setPos] = useState<{ top: number; left: number; placement: "right" | "left" | "below" } | null>(null);

  // Compute popover position from the live DOM rects of the ship's cells.
  useLayoutEffect(() => {
    if (!boardEl) return;
    function compute(): void {
      if (!boardEl) return;
      const rects: DOMRect[] = [];
      for (const cell of ship.positions) {
        const el = boardEl.querySelector<HTMLElement>(`[data-cell="${cell}"]`);
        if (el) rects.push(el.getBoundingClientRect());
      }
      if (rects.length === 0) {
        setPos(null);
        return;
      }
      const stageRect = boardEl.parentElement!.getBoundingClientRect();
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const r of rects) {
        if (r.left < minX) minX = r.left;
        if (r.top < minY) minY = r.top;
        if (r.right > maxX) maxX = r.right;
        if (r.bottom > maxY) maxY = r.bottom;
      }
      const MENU_W = 200;
      const GAP = 10;
      // Prefer right. Fall back to left, then below.
      const stageW = stageRect.width;
      const roomRight = stageRect.right - maxX;
      const roomLeft = minX - stageRect.left;
      let placement: "right" | "left" | "below";
      let left: number;
      let top = minY - stageRect.top - 4;
      if (roomRight >= MENU_W + GAP) {
        placement = "right";
        left = maxX - stageRect.left + GAP;
      } else if (roomLeft >= MENU_W + GAP) {
        placement = "left";
        left = minX - stageRect.left - MENU_W - GAP;
      } else {
        placement = "below";
        left = Math.max(0, Math.min(minX - stageRect.left, stageW - MENU_W));
        top = maxY - stageRect.top + GAP;
      }
      setPos({ top, left, placement });
    }
    compute();
    // Recompute when window resizes.
    const ro = new ResizeObserver(() => compute());
    ro.observe(boardEl);
    window.addEventListener("resize", compute);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", compute);
    };
  }, [boardEl, ship.positions, ship.id]);

  if (!pos) return null;

  // Available actions = entries in actionsRemaining with > 0 quota.
  const kinds: ActionKind[] = [];
  if (ship.actionsRemaining) {
    for (const [k, n] of Object.entries(ship.actionsRemaining)) {
      if ((n ?? 0) > 0) kinds.push(k as ActionKind);
    }
  }
  const directions: Direction[] = ["N", "E", "S", "W"];

  function handleArm(kind: ActionKind): void {
    // Atomic select+arm so we go straight to armed (or invoke instant actions).
    if (kind === "ROTATE_90") {
      void submitAction({ shipId: ship.id, kind: "ROTATE_90", targets: [] });
      return;
    }
    selectAndArm(ship.id, kind);
  }

  const flow = store.ui.flow;
  const armedHere =
    armedKind &&
    (flow.step === "actionArmed" || flow.step === "targeting") &&
    flow.shipId === ship.id
      ? armedKind
      : null;

  return (
    <div
      className={`ship-menu placement-${pos.placement}`}
      style={{ top: pos.top, left: pos.left }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      role="menu"
    >
      <div className="ship-menu-head">
        <span className={`ship-marker kind-${ship.kind.toLowerCase()}`} aria-hidden />
        <strong>{ship.name}</strong>
        <span className="muted">L{ship.length}</span>
      </div>
      <div className="ship-menu-body">
        {kinds.length === 0 && (
          <div className="muted small">No actions left this turn.</div>
        )}
        {kinds.map((k) => (
          <button
            key={k}
            className={`ship-menu-action ${armedHere === k ? "armed" : ""}`}
            onClick={() => handleArm(k)}
          >
            {ACTION_LABEL[k]}
            {ship.actionsRemaining && ship.actionsRemaining[k] && ship.actionsRemaining[k]! > 1 ? (
              <span className="badge">x{ship.actionsRemaining[k]}</span>
            ) : null}
          </button>
        ))}
        {armedHere === "MOVE_1" && (
          <div className="compass-inline">
            {directions.map((d) => (
              <button
                key={d}
                className={`compass-btn dir-${d}`}
                onClick={() =>
                  submitAction({
                    shipId: ship.id,
                    kind: "MOVE_1",
                    targets: [],
                    direction: d,
                  })
                }
                aria-label={`Move ${d}`}
              >
                {d}
              </button>
            ))}
          </div>
        )}
        {armedHere && ACTION_HINT[armedHere] && (
          <div className="ship-menu-hint">{ACTION_HINT[armedHere]}</div>
        )}
      </div>
    </div>
  );
}
