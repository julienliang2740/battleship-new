import { forwardRef, useMemo } from "react";
import type { BoardViewDTO, CellKnowledge, ShipKind } from "@shared/index";

interface BoardViewProps {
  title: string;
  board: BoardViewDTO;
  /** Cells to highlight as a preview (e.g. placement, 2x2 target). */
  highlight?: number[];
  highlightValid?: boolean;
  /** Cells belonging to the currently-selected ship (own board only). */
  selectedShipCells?: number[];
  /** Cells of the ship currently being hovered (own board only). */
  hoveredShipCells?: number[];
  disabled?: boolean;
  onCellClick?: (cell: number) => void;
  onCellHover?: (cell: number) => void;
  onMouseLeave?: () => void;
  /** Extra DOM children rendered after the grid, inside the board-wrap. */
  overlay?: React.ReactNode;
}

function cellClassFor(state: CellKnowledge, ownerKind?: ShipKind): string {
  switch (state) {
    case "UNKNOWN":
      return "cell empty";
    case "SHIP":
      return `cell ship${ownerKind ? ` kind-${ownerKind.toLowerCase()}` : ""}`;
    case "MISS":
      return "cell miss";
    case "HIT":
      return "cell hit";
    case "SUNK":
      return "cell sunk";
  }
}

function cellContent(state: CellKnowledge): string {
  if (state === "HIT") return "x";
  if (state === "SUNK") return "X";
  if (state === "MISS") return "o";
  return "";
}

export const BoardView = forwardRef<HTMLDivElement, BoardViewProps>(function BoardView(
  props,
  ref,
) {
  const {
    title,
    board,
    highlight = [],
    highlightValid = true,
    selectedShipCells = [],
    hoveredShipCells = [],
    disabled = false,
    onCellClick,
    onCellHover,
    onMouseLeave,
    overlay,
  } = props;

  const labels = useMemo(() => {
    return "ABCDEFGHIJKLMNOP".slice(0, board.size).split("");
  }, [board.size]);

  // Build a lookup of cell -> owner ShipKind for ship coloring.
  const cellOwnerKind = useMemo<Record<number, ShipKind>>(() => {
    const out: Record<number, ShipKind> = {};
    for (const s of board.ships) {
      for (const pos of s.positions) out[pos] = s.kind;
    }
    return out;
  }, [board.ships]);

  const hilSet = useMemo(() => new Set(highlight), [highlight]);
  const selSet = useMemo(() => new Set(selectedShipCells), [selectedShipCells]);
  const hovSet = useMemo(() => new Set(hoveredShipCells), [hoveredShipCells]);

  return (
    <div className="board-wrap">
      <h2>{title}</h2>
      <div className="board-stage">
        <div
          ref={ref}
          className={`board ${disabled ? "disabled" : ""}`}
          style={{ gridTemplateColumns: `auto repeat(${board.size}, 1fr)` }}
          onMouseLeave={onMouseLeave}
        >
          <div className="corner" />
          {Array.from({ length: board.size }).map((_, c) => (
            <div key={`col-${c}`} className="header">
              {c + 1}
            </div>
          ))}
          {Array.from({ length: board.size }).map((_, r) => (
            <RowFragment
              key={`row-${r}`}
              row={r}
              label={labels[r] ?? `R${r}`}
              board={board}
              hilSet={hilSet}
              highlightValid={highlightValid}
              selSet={selSet}
              hovSet={hovSet}
              cellOwnerKind={cellOwnerKind}
              disabled={disabled}
              onCellClick={onCellClick}
              onCellHover={onCellHover}
            />
          ))}
        </div>
        {overlay}
      </div>
    </div>
  );
});

interface RowProps {
  row: number;
  label: string;
  board: BoardViewDTO;
  hilSet: Set<number>;
  highlightValid: boolean;
  selSet: Set<number>;
  hovSet: Set<number>;
  cellOwnerKind: Record<number, ShipKind>;
  disabled: boolean;
  onCellClick?: (cell: number) => void;
  onCellHover?: (cell: number) => void;
}

function RowFragment(props: RowProps): React.ReactElement {
  const {
    row,
    label,
    board,
    hilSet,
    highlightValid,
    selSet,
    hovSet,
    cellOwnerKind,
    disabled,
    onCellClick,
    onCellHover,
  } = props;
  return (
    <>
      <div className="header">{label}</div>
      {Array.from({ length: board.size }).map((_, c) => {
        const i = row * board.size + c;
        const state = board.cells[i]!;
        const base = cellClassFor(state, cellOwnerKind[i]);
        const hil = hilSet.has(i) ? (highlightValid ? " highlight-valid" : " highlight-invalid") : "";
        const sel = selSet.has(i) ? " selected" : "";
        const hov = !sel && hovSet.has(i) ? " hovered" : "";
        return (
          <button
            key={`c-${i}`}
            type="button"
            data-cell={i}
            className={base + hil + sel + hov}
            onClick={() => onCellClick?.(i)}
            onMouseEnter={() => onCellHover?.(i)}
            disabled={disabled}
            aria-label={`${label}${c + 1}`}
          >
            {cellContent(state)}
          </button>
        );
      })}
    </>
  );
}
