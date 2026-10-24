// Задачи (появятся в следующем обновлении).
import { Icon } from '../components/icons';
import { go } from '../lib/router';

export default function Puzzles() {
  return (
    <div className="page narrow">
      <header className="page-head"><h1>Puzzles</h1><p>Tactics puzzles open in a coming update.</p></header>
      <button className="btn primary big" onClick={() => go('/bots')}><Icon.bot />Play a bot meanwhile</button>
    </div>
  );
}
