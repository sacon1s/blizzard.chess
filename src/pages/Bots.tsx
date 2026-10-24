// Выбор бота: уровень, цвет, часы.
import { BOTS, TIME_CONTROLS } from '../lib/bots';
import { settings, useSettings } from '../lib/store';
import { go } from '../lib/router';

export function BotAvatar({ level, size = 44 }: { level: number; size?: number }) {
  const shade = Math.round(255 - (level - 1) * 22);
  return (
    <span className="bot-av" style={{ width: size, height: size, background: `rgb(${shade},${shade},${shade})`, color: level > 5 ? '#fff' : '#000' }}>
      <img src="logo.svg" alt="" style={{ filter: level > 5 ? 'none' : 'invert(1)' }} />
      <b>{level}</b>
    </span>
  );
}

export default function Bots() {
  const s = useSettings();
  const bot = BOTS[s.botLevel - 1] || BOTS[4];
  function start() {
    go(`/play/bot?level=${s.botLevel}&color=${s.botColor}&tc=${encodeURIComponent(s.botClock)}&t=${Date.now()}`);
  }
  return (
    <div className="page bots">
      <header className="page-head">
        <h1>Play a bot</h1>
        <p>Ten Blizzard bots, from a beginner who hangs pieces to the full-strength engine.</p>
      </header>
      <div className="bots-grid">
        <ul className="bot-list" role="listbox" aria-label="Bots">
          {BOTS.map((b) => (
            <li key={b.level} role="option" aria-selected={b.level === s.botLevel}>
              <button className={'bot-row' + (b.level === s.botLevel ? ' on' : '')} onClick={() => { settings.set({ botLevel: b.level }); if (window.innerWidth <= 860) window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                <BotAvatar level={b.level} />
                <span className="bot-name"><b>{b.name}</b><span>{b.elo}</span></span>
              </button>
            </li>
          ))}
        </ul>
        <aside className="bot-card">
          <BotAvatar level={bot.level} size={88} />
          <h2>{bot.name}</h2>
          <p className="bot-elo">{bot.elo}</p>
          <p className="bot-about">{bot.about}</p>
          <div className="field">
            <span className="label">I play</span>
            <div className="seg">
              {(['white', 'random', 'black'] as const).map((c) => (
                <button key={c} aria-pressed={s.botColor === c} onClick={() => settings.set({ botColor: c })}>
                  <i className={'swatch ' + c} />{c === 'random' ? 'Random' : c === 'white' ? 'White' : 'Black'}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="label">Clock</span>
            <div className="seg wrap">
              {TIME_CONTROLS.map((t) => (
                <button key={t.v} aria-pressed={s.botClock === t.v} onClick={() => settings.set({ botClock: t.v })}>{t.label}</button>
              ))}
            </div>
          </div>
          <button className="btn primary big" onClick={start}>Play</button>
        </aside>
      </div>
    </div>
  );
}
