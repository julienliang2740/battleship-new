import { useGame } from "../state/GameContext";

export function Toasts(): React.ReactElement {
  const { store } = useGame();
  return (
    <div className="toast-container" aria-live="polite" aria-atomic="true">
      {store.ui.toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} role="status">
          {t.text}
        </div>
      ))}
    </div>
  );
}
