// Игра онлайн: быстрый поиск соперника по контролю времени, вызов друга по ссылке, свои партии, лучшие игроки.
import { useEffect, useState } from 'react';
import { Icon } from '../components/icons';
import { useAuth, speedOf, type Speed } from '../lib/auth';
import { seek, watchSeeks, createFriendGame, userGames, leaderboard, parseTcStr, tcName, QUICK, SPEED_LABEL, ratingOf, type UserGame } from '../lib/online';
import { go, useRoute } from '../lib/router';

const speedOfTc = (tc: string) => { const t = parseTcStr(tc); return speedOf(t.base, t.inc); };

export default function Online() {
  const { user, profile, loading } = useAuth();
  const { query } = useRoute();
  const [seeking, setSeeking] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [friendTc, setFriendTc] = useState('10+0');
  const [friendColor, setFriendColor] = useState<'white' | 'random' | 'black'>('random');
  const [err, setErr] = useState('');
  const [cancel, setCancel] = useState<(() => void) | null>(null);

  useEffect(() => (user ? watchSeeks(setCounts) : undefined), [user]);
  useEffect(() => () => { if (cancel) cancel(); }, [cancel]);
  // «Новая партия» из итогов: сразу искать соперника с тем же контролем
  const auto = query.get('tc');
  useEffect(() => { if (auto && profile && !seeking && QUICK.includes(auto)) start(auto); }, [auto, profile]); // eslint-disable-line react-hooks/exhaustive-deps

  function start(tc: string) {
    if (!profile) { go('/login'); return; }
    if (cancel) cancel();
    setErr('');
    setSeeking(tc);
    const c = seek(tc, profile, (gid) => { setCancel(null); setSeeking(null); go('/game/' + gid); });
    setCancel(() => c);
  }
  function stop() { if (cancel) cancel(); setCancel(null); setSeeking(null); if (auto) go('/online'); }
  async function friend() {
    if (!profile) { go('/login'); return; }
    try { const gid = await createFriendGame(friendTc, profile, friendColor); go('/game/' + gid); } catch { setErr('Couldn’t create the game. Check your connection.'); }
  }

  const needAccount = !loading && (!user || !profile);
  return (
    <div className="page online">
      <header className="page-head">
        <h1>Play online</h1>
        <p>{profile ? <>You play as <a href={'#/profile/' + profile.name}>{profile.name}</a>. Pick a time control and we’ll find an opponent.</> : 'Rated games against people. Ratings start at 1200.'}</p>
      </header>
      {needAccount && (
        <div className="notice big">
          <span>{user ? 'Choose a username to start playing.' : 'Sign in to play online. It’s free and takes a minute.'}</span>
          <button className="btn primary" onClick={() => go('/login')}>{user ? 'Choose a username' : 'Sign in'}</button>
        </div>
      )}
      <div className="online-grid">
        <section>
          <h2 className="label">Quick pairing</h2>
          <div className="tc-grid">
            {QUICK.map((tc) => {
              const sp = speedOfTc(tc), n = counts[tc] || 0, on = seeking === tc;
              return (
                <button key={tc} className={'tc' + (on ? ' on' : '')} onClick={() => (on ? stop() : start(tc))} disabled={needAccount}>
                  <b>{tcName(tc)}</b>
                  <span>{on ? 'Searching… click to cancel' : SPEED_LABEL[sp]}{!on && n > 0 ? ` · ${n} waiting` : ''}</span>
                  {profile && !on && <small>{ratingOf(profile, sp)}</small>}
                  {on && <span className="waiting" aria-hidden="true"><i /><i /><i /></span>}
                </button>
              );
            })}
          </div>
          {err && <p className="error" role="alert">{err}</p>}

          <h2 className="label section-gap">Play a friend</h2>
          <div className="friend">
            <div className="field">
              <span className="label">Time control</span>
              <div className="seg wrap">
                {['3+2', '5+0', '10+0', '15+10', '30+0'].map((tc) => <button key={tc} aria-pressed={friendTc === tc} onClick={() => setFriendTc(tc)}>{tcName(tc)}</button>)}
              </div>
            </div>
            <div className="field">
              <span className="label">I play</span>
              <div className="seg">
                {(['white', 'random', 'black'] as const).map((c) => (
                  <button key={c} aria-pressed={friendColor === c} onClick={() => setFriendColor(c)}><i className={'swatch ' + c} />{c === 'random' ? 'Random' : c === 'white' ? 'White' : 'Black'}</button>
                ))}
              </div>
            </div>
            <button className="btn primary big" onClick={friend} disabled={needAccount}><Icon.plus />Create a game link</button>
            <p className="muted small">Friend games are casual: ratings don’t change.</p>
          </div>
        </section>
        <aside>
          {profile && <MyGames uid={profile.uid} />}
          <Leaders />
        </aside>
      </div>
    </div>
  );
}

export function UserGameList({ games, empty }: { games: (UserGame & { id: string })[]; empty: string }) {
  if (!games.length) return <p className="muted small">{empty}</p>;
  return (
    <ul className="game-list">
      {games.map((g) => {
        const res = !g.result ? '' : g.result === '1/2-1/2' ? 'draw' : (g.result === '1-0') === (g.color === 0) ? 'win' : 'loss';
        return (
          <li key={g.id}>
            <a className="game-row" href={'#/game/' + g.id}>
              <span className={'res ' + res}>{!g.result ? '…' : res === 'draw' ? '½' : res === 'win' ? 'Won' : 'Lost'}</span>
              <span className="players"><b>{g.oppName}</b><span>{tcName(g.tc)} {SPEED_LABEL[g.speed].toLowerCase()}{g.rated ? '' : ', casual'}</span></span>
              <span className="meta">{g.delta ? (g.delta > 0 ? '+' : '−') + Math.abs(g.delta) : ''}<br />{new Date(g.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

function MyGames({ uid }: { uid: string }) {
  const [games, setGames] = useState<(UserGame & { id: string })[] | null>(null);
  useEffect(() => { userGames(uid, 8).then(setGames, () => setGames([])); }, [uid]);
  return (
    <section className="side-box">
      <h2 className="label">Your games</h2>
      {games ? <UserGameList games={games} empty="Your online games will appear here." /> : <p className="muted small">Loading…</p>}
    </section>
  );
}

function Leaders() {
  const [sp, setSp] = useState<Speed>('blitz');
  const [rows, setRows] = useState<{ uid: string; name: string; rating: number; games: number }[] | null>(null);
  useEffect(() => { setRows(null); leaderboard(sp).then(setRows, () => setRows([])); }, [sp]);
  return (
    <section className="side-box">
      <h2 className="label">Top players</h2>
      <div className="seg small">
        {(['bullet', 'blitz', 'rapid', 'classical'] as Speed[]).map((x) => <button key={x} aria-pressed={sp === x} onClick={() => setSp(x)}>{SPEED_LABEL[x]}</button>)}
      </div>
      {!rows ? <p className="muted small">Loading…</p> : rows.length === 0 ? <p className="muted small">No rated {SPEED_LABEL[sp].toLowerCase()} games yet. Play one and take first place.</p> : (
        <ol className="leaders">
          {rows.map((r) => <li key={r.uid}><a href={'#/profile/' + r.name}>{r.name}</a><b>{r.rating}</b></li>)}
        </ol>
      )}
    </section>
  );
}
