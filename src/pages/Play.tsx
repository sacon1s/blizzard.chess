// Play — главная страница: слева доска, справа панель с вкладками: онлайн, боты, друзья, лучшие игроки.
// Всё помещается на одном экране, без прокрутки.
import { useEffect, useMemo, useState } from 'react';
import Board from '../components/Board';
import { PlayerBar } from '../components/GameParts';
import { Icon } from '../components/icons';
import { BotAvatar } from '../components/BotAvatar';
import { START_FEN } from '../lib/chess';
import { BOTS, TIME_CONTROLS } from '../lib/bots';
import { useAuth, useOnlineCount, speedOf, type Speed } from '../lib/auth';
import { seek, watchSeeks, createFriendGame, leaderboard, parseTcStr, tcName, QUICK, SPEED_LABEL, ratingOf } from '../lib/online';
import { useFriends, useOnlineSet, sendChallenge, searchPlayers } from '../lib/social';
import { settings, useSettings } from '../lib/store';
import { go, useRoute } from '../lib/router';

const speedOfTc = (tc: string) => { const t = parseTcStr(tc); return speedOf(t.base, t.inc); };
type Tab = 'online' | 'bots' | 'friends' | 'top';
const TABS: { v: Tab; label: string }[] = [
  { v: 'online', label: 'Online' }, { v: 'bots', label: 'Bots' }, { v: 'friends', label: 'Friends' }, { v: 'top', label: 'Top' },
];

export default function Play({ initialTab }: { initialTab?: Tab }) {
  const s = useSettings();
  const { user, profile, loading } = useAuth();
  const { query } = useRoute();
  const [tab, setTab] = useState<Tab>(() => initialTab || ((query.get('tab') as Tab) || 'online'));
  const qTab = query.get('tab') as Tab | null;
  useEffect(() => { if (initialTab) setTab(initialTab); else if (qTab) setTab(qTab); }, [initialTab, qTab]);
  const [seeking, setSeeking] = useState<string | null>(null);
  const [cancel, setCancel] = useState<(() => void) | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => () => { if (cancel) cancel(); }, [cancel]);

  function start(tc: string) {
    if (!profile) { go('/login'); return; }
    if (cancel) cancel();
    setErr(''); setSeeking(tc);
    const c = seek(tc, profile, (gid) => { setCancel(null); setSeeking(null); go('/game/' + gid); });
    setCancel(() => c);
  }
  function stop() { if (cancel) cancel(); setCancel(null); setSeeking(null); }
  // «Новая партия» из итогов: сразу искать соперника с тем же контролем
  const auto = query.get('tc');
  useEffect(() => { if (auto && profile && !seeking && QUICK.includes(auto)) { setTab('online'); start(auto); } }, [auto, profile]); // eslint-disable-line react-hooks/exhaustive-deps

  const bot = BOTS[s.botLevel - 1] || BOTS[4];
  const orient: 0 | 1 = tab === 'bots' && s.botColor === 'black' ? 1 : 0;
  const mySpeed: Speed = tab === 'online' && seeking ? speedOfTc(seeking) : 'blitz';
  const top = tab === 'bots'
    ? <PlayerBar color={(orient ^ 1) as 0 | 1} name={bot.name} sub={bot.elo} avatar={<BotAvatar level={bot.level} size={36} />} />
    : <PlayerBar color={(orient ^ 1) as 0 | 1} name={seeking ? 'Searching for an opponent…' : 'Opponent'} avatar={<Icon.user />} thinking={!!seeking} />;
  const bottom = <PlayerBar color={orient} name={profile ? profile.name : 'You'} sub={profile ? String(ratingOf(profile, mySpeed)) : ''} avatar={<Icon.user />} />;

  return (
    <div className="game-layout fixed-panel play">
      <div className="board-col">
        {top}
        <Board fen={START_FEN} orientation={orient} movable={null} lastMove={null} theme={s.theme} coords={s.showCoords} />
        {bottom}
      </div>
      <aside className="side-panel">
        <div className="tabs four" role="tablist">
          {TABS.map((t) => <button key={t.v} role="tab" aria-selected={tab === t.v} onClick={() => setTab(t.v)}>{t.label}</button>)}
        </div>
        <div className="tab-body">
          {tab === 'online' && <OnlineTab needAccount={!loading && !profile} signedIn={!!user} seeking={seeking} onStart={start} onStop={stop} err={err} />}
          {tab === 'bots' && <BotsTab />}
          {tab === 'friends' && <FriendsTab />}
          {tab === 'top' && <TopTab />}
        </div>
      </aside>
    </div>
  );
}

function SignInNote({ signedIn, text }: { signedIn: boolean; text: string }) {
  return (
    <div className="notice">
      <span>{signedIn ? 'Choose a username to start playing.' : text}</span>
      <button className="btn primary" onClick={() => go('/login')}>{signedIn ? 'Choose a username' : 'Sign in'}</button>
    </div>
  );
}

function OnlineTab({ needAccount, signedIn, seeking, onStart, onStop, err }: { needAccount: boolean; signedIn: boolean; seeking: string | null; onStart: (tc: string) => void; onStop: () => void; err: string }) {
  const { user, profile } = useAuth();
  const online = useOnlineCount();
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => (user ? watchSeeks(setCounts) : undefined), [user]);
  return (
    <>
      {needAccount && <SignInNote signedIn={signedIn} text="Sign in to play rated games against people." />}
      <div className="tc-grid compact">
        {QUICK.map((tc) => {
          const sp = speedOfTc(tc), n = counts[tc] || 0, on = seeking === tc;
          return (
            <button key={tc} className={'tc' + (on ? ' on' : '')} onClick={() => (on ? onStop() : onStart(tc))} disabled={needAccount}>
              <b>{tcName(tc)}</b>
              <span>{on ? 'Cancel' : SPEED_LABEL[sp]}{!on && n > 0 ? ` · ${n}` : ''}</span>
              {profile && !on && <small>{ratingOf(profile, sp)}</small>}
              {on && <span className="waiting" aria-hidden="true"><i /><i /><i /></span>}
            </button>
          );
        })}
      </div>
      {err && <p className="error" role="alert">{err}</p>}
      <p className="muted small tab-foot">{seeking ? 'Searching for an opponent. Click the time control again to cancel.' : 'Rated games. Ratings start at 1200.'}{online ? ` ${online} ${online === 1 ? 'player' : 'players'} online.` : ''}</p>
    </>
  );
}

function BotsTab() {
  const s = useSettings();
  const bot = BOTS[s.botLevel - 1] || BOTS[4];
  const play = () => go(`/play/bot?level=${s.botLevel}&color=${s.botColor}&tc=${encodeURIComponent(s.botClock)}&t=${Date.now()}`);
  return (
    <>
      <ul className="bot-grid" role="listbox" aria-label="Bots">
        {BOTS.map((b) => (
          <li key={b.level} role="option" aria-selected={b.level === s.botLevel}>
            <button className={'bot-chip' + (b.level === s.botLevel ? ' on' : '')} onClick={() => settings.set({ botLevel: b.level })}>
              <BotAvatar level={b.level} size={34} />
              <span><b>{b.name}</b><span>{b.elo}</span></span>
            </button>
          </li>
        ))}
      </ul>
      <p className="bot-about small">{bot.about}</p>
      <div className="field">
        <span className="label">I play</span>
        <div className="seg">
          {(['white', 'random', 'black'] as const).map((c) => (
            <button key={c} aria-pressed={s.botColor === c} onClick={() => settings.set({ botColor: c })}><i className={'swatch ' + c} />{c === 'random' ? 'Random' : c === 'white' ? 'White' : 'Black'}</button>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="label">Clock</span>
        <div className="seg wrap">
          {TIME_CONTROLS.map((t) => <button key={t.v} aria-pressed={s.botClock === t.v} onClick={() => settings.set({ botClock: t.v })}>{t.label}</button>)}
        </div>
      </div>
      <button className="btn primary big wide" onClick={play}><Icon.bot />Play {bot.name}</button>
    </>
  );
}

function FriendsTab() {
  const { user, profile, loading } = useAuth();
  const friends = useFriends(profile ? profile.uid : null);
  const onlineSet = useOnlineSet();
  const [tc, setTc] = useState('10+0');
  const [color, setColor] = useState<'white' | 'random' | 'black'>('random');
  const [q, setQ] = useState('');
  const [found, setFound] = useState<{ uid: string; name: string }[] | null>(null);
  const [err, setErr] = useState('');
  const { query } = useRoute();
  const qWith = query.get('with');
  const [withUid, setWith] = useState<string | null>(qWith);
  useEffect(() => { if (qWith) setWith(qWith); }, [qWith]);
  const sel = (friends || []).find((f) => f.uid === withUid) || null;
  useEffect(() => {
    if (!q.trim()) { setFound(null); return; }
    const t = setTimeout(() => searchPlayers(q).then(setFound, () => setFound([])), 250);
    return () => clearTimeout(t);
  }, [q]);
  const sorted = useMemo(() => (friends || []).slice().sort((a, b) => Number(onlineSet.has(b.uid)) - Number(onlineSet.has(a.uid))), [friends, onlineSet]);
  async function create(to?: string) {
    if (!profile) { go('/login'); return; }
    try {
      const gid = await createFriendGame(tc, profile, color, to);
      if (to) await sendChallenge(to, gid, profile, tc);
      go('/game/' + gid);
    } catch { setErr('Couldn’t create the game. Check your connection.'); }
  }
  if (!loading && !profile) return <SignInNote signedIn={!!user} text="Sign in to add friends and challenge them." />;
  return (
    <>
      {sel && (
        <div className="vs-friend">
          <i className={'dot' + (onlineSet.has(sel.uid) ? ' on' : '')} />
          <span>Game with <b>{sel.name}</b></span>
          <button className="btn ghost small-btn" onClick={() => setWith(null)}>Change</button>
        </div>
      )}
      <div className="field">
        <span className="label">Time control</span>
        <div className="seg">
          {['3+2', '5+0', '10+0', '15+10', '30+0'].map((x) => <button key={x} aria-pressed={tc === x} onClick={() => setTc(x)}>{tcName(x)}</button>)}
        </div>
      </div>
      <div className="field">
        <span className="label">I play</span>
        <div className="seg">
          {(['white', 'random', 'black'] as const).map((c) => (
            <button key={c} aria-pressed={color === c} onClick={() => setColor(c)}><i className={'swatch ' + c} />{c === 'random' ? 'Random' : c === 'white' ? 'White' : 'Black'}</button>
          ))}
        </div>
      </div>
      {err && <p className="error" role="alert">{err}</p>}
      <div className="friend-list">
        {friends === null ? <p className="muted small">Loading…</p> : sorted.length === 0 ? (
          <p className="muted small">No friends yet. Find players below and add them.</p>
        ) : sorted.map((f) => (
          <div key={f.uid} className={'friend-row' + (sel && sel.uid === f.uid ? ' on' : '')}>
            <i className={'dot' + (onlineSet.has(f.uid) ? ' on' : '')} title={onlineSet.has(f.uid) ? 'Online' : 'Offline'} />
            <a href={'#/profile/' + f.name}>{f.name}</a>
            <button className="btn small-btn" aria-pressed={!!sel && sel.uid === f.uid} onClick={() => setWith(f.uid)}>Play</button>
          </div>
        ))}
      </div>
      <div className="search">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find players by name" aria-label="Find players by name" />
        {found && (
          <div className="search-results">
            {found.length === 0 ? <p className="muted small">No players found.</p> : found.map((r) => <a key={r.uid} href={'#/profile/' + r.name}>{r.name}</a>)}
          </div>
        )}
      </div>
      {sel
        ? <button className="btn primary big wide push" onClick={() => create(sel.uid)}><Icon.online />Challenge {sel.name}</button>
        : <button className="btn wide push" onClick={() => create()}><Icon.plus />Create a game link</button>}
    </>
  );
}

function TopTab() {
  const [sp, setSp] = useState<Speed>('blitz');
  const [rows, setRows] = useState<{ uid: string; name: string; rating: number; games: number }[] | null>(null);
  useEffect(() => { setRows(null); leaderboard(sp, 12).then(setRows, () => setRows([])); }, [sp]);
  return (
    <>
      <div className="seg small">
        {(['bullet', 'blitz', 'rapid', 'classical'] as Speed[]).map((x) => <button key={x} aria-pressed={sp === x} onClick={() => setSp(x)}>{SPEED_LABEL[x]}</button>)}
      </div>
      {!rows ? <p className="muted small">Loading…</p> : rows.length === 0 ? <p className="muted small">No rated {SPEED_LABEL[sp].toLowerCase()} games yet. Play one and take first place.</p> : (
        <ol className="leaders">
          {rows.map((r) => <li key={r.uid}><a href={'#/profile/' + r.name}>{r.name}</a><b>{r.rating}</b></li>)}
        </ol>
      )}
    </>
  );
}
