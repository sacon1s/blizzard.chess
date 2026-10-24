// Настройки: доска, звук, координаты, автоферзь.
import Board from '../components/Board';
import { settings, useSettings, THEMES } from '../lib/store';

export default function SettingsPage() {
  const s = useSettings();
  const toggle = (k: 'sound' | 'showCoords' | 'autoQueen', label: string, hint: string) => (
    <label className="toggle-row">
      <span><b>{label}</b><span className="muted">{hint}</span></span>
      <span className="switch"><input type="checkbox" checked={s[k]} onChange={(e) => settings.set({ [k]: e.target.checked })} /><span /></span>
    </label>
  );
  return (
    <div className="page narrow">
      <header className="page-head"><h1>Settings</h1><p>Saved in this browser.</p></header>
      <section className="settings">
        <h2 className="label">Board</h2>
        <div className="themes">
          {THEMES.map((t) => (
            <button key={t.v} className="theme" aria-pressed={s.theme === t.v} onClick={() => settings.set({ theme: t.v })}>
              <span className="swatch4" style={{ background: `conic-gradient(${t.a} 0 25%, ${t.b} 0 50%, ${t.a} 0 75%, ${t.b} 0)` }} />
              {t.label}
            </button>
          ))}
        </div>
        <div className="preview"><Board fen="r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3" orientation={0} theme={s.theme} coords={s.showCoords} movable={null} lastMove={null} /></div>
        {toggle('showCoords', 'Coordinates', 'Letters and numbers on the board edge')}
        {toggle('autoQueen', 'Always promote to a queen', 'Skip the piece choice when a pawn promotes')}
        <h2 className="label">Sound</h2>
        {toggle('sound', 'Move sounds', 'A click for moves, captures, castling and checks')}
      </section>
    </div>
  );
}
