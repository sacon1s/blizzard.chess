// Настройки: доска, звук, координаты, автоферзь.
import Board from '../components/Board';
import { settings, useSettings, THEMES, SKINS } from '../lib/store';
import { PIECE_SETS, pieceImgs } from '../lib/pieces';
import { useEffect, useState } from 'react';
import { enableNotifications, disableNotifications, pushUrl, pushSupported } from '../lib/push';
import { useAuth } from '../lib/auth';

// уведомления: при открытой вкладке — всегда; при закрытом сайте — если настроен сервер уведомлений
function NotifyToggle() {
  const s = useSettings();
  const { user } = useAuth();
  const [remote, setRemote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => { pushUrl().then((u) => setRemote(!!u && pushSupported())); }, []);
  const hint = remote
    ? (user ? 'Your move in daily games, challenges and friend requests, even when the site is closed' : 'Challenges and friend requests. Sign in to get them even when the site is closed')
    : 'Challenges and friend requests while the tab is in the background';
  return (
    <>
      <label className="toggle-row">
        <span><b>Notifications</b><span className="muted">{hint}</span></span>
        <span className="switch"><input type="checkbox" checked={s.notify} disabled={busy} onChange={(e) => {
          const on = e.target.checked;
          setMsg(''); setBusy(true);
          (on ? enableNotifications() : disableNotifications().then(() => null)).then((err) => setMsg(err || ''), () => setMsg('Something went wrong. Try again.')).finally(() => setBusy(false));
        }} /><span /></span>
      </label>
      {msg && <p className="muted small notify-msg" role="status">{msg}</p>}
    </>
  );
}

export default function SettingsPage() {
  const s = useSettings();
  const toggle = (k: 'sound' | 'showCoords' | 'autoQueen' | 'premove' | 'chat', label: string, hint: string) => (
    <label className="toggle-row">
      <span><b>{label}</b><span className="muted">{hint}</span></span>
      <span className="switch"><input type="checkbox" checked={s[k]} onChange={(e) => settings.set({ [k]: e.target.checked })} /><span /></span>
    </label>
  );
  return (
    <div className="page narrow">
      <header className="page-head"><h1>Settings</h1><p>Saved in this browser.</p></header>
      <section className="settings">
        <h2 className="label">Theme</h2>
        <div className="seg">
          {SKINS.map((k) => <button key={k.v} aria-pressed={s.skin === k.v} onClick={() => settings.set({ skin: k.v })}>{k.label}</button>)}
        </div>
        <h2 className="label">Pieces</h2>
        <div className="themes">
          {Object.entries(PIECE_SETS).map(([k, v]) => (
            <button key={k} className="theme" aria-pressed={s.pieces === k} onClick={() => settings.set({ pieces: k })}>
              <img src={pieceImgs(k).wN} alt="" width={26} height={26} />{v.label}
            </button>
          ))}
        </div>
        <p className="muted small credit">{PIECE_SETS[s.pieces] ? `${PIECE_SETS[s.pieces].label} pieces by ${PIECE_SETS[s.pieces].author}, ${PIECE_SETS[s.pieces].license}.` : ''}</p>
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
        {toggle('premove', 'Premoves', 'Make your next move while the opponent is thinking. Right-click cancels it')}
        {toggle('chat', 'Chat in online games', 'Show messages from your opponent')}
        <NotifyToggle />
        <h2 className="label">Sound</h2>
        {toggle('sound', 'Move sounds', 'A click for moves, captures, castling and checks')}
      </section>
    </div>
  );
}
