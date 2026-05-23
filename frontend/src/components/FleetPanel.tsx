import type { ActionKind, ShipDTO } from "@shared/index";

interface FleetPanelProps {
  title: string;
  ships: ShipDTO[];
  /** When set, the matching ship row is rendered with a "selected" style. */
  selectedShipId?: string;
}

const ACTION_LABEL: Record<ActionKind, string> = {
  SINGLE_HIT: "Hit",
  AREA_HIT_2X2: "2x2",
  MOVE_1: "Move",
  ROTATE_90: "Rotate",
};

/**
 * Read-only summary of a fleet: each row shows the ship's hull color, name,
 * length, damage bar, and (for your own fleet) remaining actions. Ship
 * selection now happens by hovering ships directly on the board.
 */
export function FleetPanel({ title, ships, selectedShipId }: FleetPanelProps): React.ReactElement {
  return (
    <div className="fleet-panel">
      <h3>{title}</h3>
      <ul className="ship-list">
        {ships.map((ship) => {
          const damageRatio = ship.length > 0 ? ship.hits.length / ship.length : 0;
          const sunk = ship.sunk;
          const isSelected = ship.id === selectedShipId;
          const totalActions = ship.actionsRemaining
            ? Object.values(ship.actionsRemaining).reduce((a: number, b) => a + (b ?? 0), 0)
            : 0;
          return (
            <li
              key={ship.id}
              className={`ship-row kind-${ship.kind.toLowerCase()} ${sunk ? "sunk" : ""} ${isSelected ? "selected" : ""}`}
            >
              <div className="ship-row-head">
                <span className={`ship-marker kind-${ship.kind.toLowerCase()}`} aria-hidden />
                <span className="ship-name">{ship.name}</span>
                <span className="ship-length">L{ship.length}</span>
              </div>
              <div className="damage-bar" aria-label={`${ship.hits.length} of ${ship.length} hit`}>
                <div className="damage-bar-fill" style={{ width: `${damageRatio * 100}%` }} />
              </div>
              {!sunk && ship.actionsRemaining && (
                <div className="ship-actions-summary">
                  {Object.entries(ship.actionsRemaining).map(([k, n]) =>
                    n && n > 0 ? (
                      <span key={k} className="action-pill">
                        {ACTION_LABEL[k as ActionKind]} x{n}
                      </span>
                    ) : null,
                  )}
                  {totalActions === 0 && <span className="action-pill spent">spent</span>}
                </div>
              )}
              {sunk && (
                <div className="ship-actions-summary">
                  <span className="action-pill sunk">sunk</span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
