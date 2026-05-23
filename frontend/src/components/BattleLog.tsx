import { useGame } from "../state/GameContext";

export function BattleLog(): React.ReactElement {
  const { store } = useGame();
  const tail = store.ui.log.slice(-14);
  return (
    <div className="log">
      <h3>Battle Log</h3>
      <ul>
        {tail.map((e) => (
          <li key={e.id} className={e.who}>
            {e.text}
          </li>
        ))}
        {tail.length === 0 && <li className="muted">No events yet.</li>}
      </ul>
    </div>
  );
}
