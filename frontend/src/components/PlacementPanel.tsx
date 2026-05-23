import type { ShipKind } from "@shared/index";
import { useGame } from "../state/GameContext";

const KIND_NAME: Record<ShipKind, { name: string; length: number }> = {
  AIRCRAFT_CARRIER: { name: "Aircraft Carrier", length: 8 },
  BATTLESHIP: { name: "Battleship", length: 6 },
  CRUISER: { name: "Cruiser", length: 4 },
  FRIGATE: { name: "Frigate", length: 3 },
  SUBMARINE: { name: "Submarine", length: 2 },
};

export function PlacementPanel(): React.ReactElement | null {
  const { store, toggleOrientation, placeRandom, resetPlacement } = useGame();
  const state = store.state;
  if (!state || state.phase !== "placement") return null;

  const placement = state.placement!;
  const nextKind = placement.order[placement.nextIndex];
  const info = nextKind ? KIND_NAME[nextKind] : null;

  return (
    <div className="placement-panel">
      <h3>Placement</h3>
      {info ? (
        <p>
          Place your <strong className={`kind-${nextKind!.toLowerCase()}`}>{info.name}</strong>{" "}
          (length {info.length}). Click on your board.
        </p>
      ) : (
        <p>All ships placed.</p>
      )}
      <div className="placement-controls">
        <button onClick={toggleOrientation}>Rotate ({store.ui.orientation})</button>
        <button onClick={placeRandom}>Random</button>
        <button onClick={resetPlacement}>Clear</button>
      </div>
      <p className="hint">Press <kbd>R</kbd> to rotate, <kbd>Esc</kbd> to cancel a flow.</p>
    </div>
  );
}
