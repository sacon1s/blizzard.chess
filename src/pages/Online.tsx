// Игра онлайн (подключается на следующем шаге).
import { Icon } from '../components/icons';
import { go } from '../lib/router';

export default function Online() {
  return (
    <div className="page narrow">
      <header className="page-head"><h1>Play online</h1><p>Rated games against people open in the next update.</p></header>
      <button className="btn primary big" onClick={() => go('/bots')}><Icon.bot />Play a bot meanwhile</button>
    </div>
  );
}
