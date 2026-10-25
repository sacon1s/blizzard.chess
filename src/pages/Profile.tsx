// Профиль игрока: рейтинги, друзья, партии. Любую законченную партию можно открыть и разобрать.
import { useEffect, useState } from 'react';
import { useAuth, getProfile, uidByName, logOut, type Profile as P, type Speed } from '../lib/auth';
import { userGames, SPEED_LABEL, tcName, type UserGame } from '../lib/online';
import { useFriendState, useFriends, useRequests, useOnlineSet, sendRequest, cancelRequest, acceptRequest, declineRequest, removeFriend } from '../lib/social';
import { savedGames } from '../lib/store';
import { go } from '../lib/router';
import { Icon } from '../components/icons';
import { AvatarImg, Flag, AVATAR_COLORS, AVATAR_PIECES } from '../components/Avatar';
import { COUNTRIES } from '../lib/countries';
import { award, ACHIEVEMENTS, achStore } from '../lib/achievements';
import { AchBadge } from '../components/AchIcon';
import { ref, update } from 'firebase/database';
import { db } from '../lib/firebase';

export function UserGameList({ games, empty }: { games: (UserGame & { id: string })[]; empty: string }) {
  if (!games.length) return <p className="muted small">{empty}</p>;
  return (
    <ul className="game-list">
      {games.map((g) => {
        const res = !g.result ? '' : g.result === '1/2-1/2' ? 'draw' : (g.result === '1-0') === (g.color === 0) ? 'win' : 'loss';
        return (
          <li key={g.id}>
            <a className="game-row" href={(g.result ? '#/review/' : '#/game/') + g.id} title={g.result ? 'Open the game review' : 'Open the game'}>
              <span className={'res ' + res}>{!g.result ? 'Live' : res === 'draw' ? '½' : res === 'win' ? 'Won' : 'Lost'}</span>
              <span className="players"><b>vs {g.oppName}</b><span>{tcName(g.tc)} {SPEED_LABEL[g.speed].toLowerCase()}{g.rated ? '' : ', casual'}</span></span>
              <span className="meta">{g.delta ? (g.delta > 0 ? '+' : '−') + Math.abs(g.delta) : ''}<br />{new Date(g.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

function FriendButton({ me, other }: { me: P; other: P }) {
  const st = useFriendState(me.uid, other.uid);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const run = (f: () => Promise<unknown>) => { setBusy(true); f().catch(() => {}).finally(() => setBusy(false)); };
  if (st === null) return null;
  if (st === 'friends') {
    return (
      <div className="row">
        <button className="btn primary" onClick={() => go(`/?tab=friends&with=${other.uid}`)}><Icon.online />Play</button>
        {confirm
          ? <button className="btn danger" disabled={busy} onClick={() => run(() => removeFriend(me.uid, other.uid))}>Remove from friends</button>
          : <button className="btn" onClick={() => { setConfirm(true); setTimeout(() => setConfirm(false), 3000); }}>Friends ✓</button>}
      </div>
    );
  }
  if (st === 'sent') return <button className="btn" disabled={busy} onClick={() => run(() => cancelRequest(me.uid, other.uid))}>Cancel friend request</button>;
  if (st === 'received') {
    return (
      <div className="row">
        <button className="btn primary" disabled={busy} onClick={() => run(() => acceptRequest(me, other.uid, other.name))}>Accept friend request</button>
        <button className="btn ghost" disabled={busy} onClick={() => run(() => declineRequest(me.uid, other.uid))}>Decline</button>
      </div>
    );
  }
  return <button className="btn primary" disabled={busy} onClick={() => run(() => sendRequest(me, other.uid))}>Add friend</button>;
}

function MySocial({ me }: { me: P }) {
  const requests = useRequests(me.uid);
  const friends = useFriends(me.uid);
  const onlineSet = useOnlineSet();
  useEffect(() => { if (friends && friends.length) award('friend1'); }, [friends && friends.length]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      {requests.length > 0 && (
        <section className="side-box">
          <h2 className="label">Friend requests</h2>
          {requests.map((r) => (
            <div key={r.uid} className="friend-row">
              <a href={'#/profile/' + r.name}>{r.name}</a>
              <button className="btn primary small-btn" onClick={() => acceptRequest(me, r.uid, r.name)}>Accept</button>
              <button className="btn ghost small-btn" onClick={() => declineRequest(me.uid, r.uid)}>Decline</button>
            </div>
          ))}
        </section>
      )}
      <section className="side-box">
        <h2 className="label">Friends</h2>
        {friends === null ? <p className="muted small">Loading…</p> : friends.length === 0 ? (
          <p className="muted small">No friends yet. Find players on the Play page, in the Friends tab.</p>
        ) : friends.map((f) => (
          <div key={f.uid} className="friend-row">
            <i className={'dot' + (onlineSet.has(f.uid) ? ' on' : '')} />
            <a href={'#/profile/' + f.name}>{f.name}</a>
            <button className="btn small-btn" onClick={() => go(`/?tab=friends&with=${f.uid}`)}>Play</button>
          </div>
        ))}
      </section>
    </>
  );
}

export default function Profile({ name }: { name?: string }) {
  const { profile: me } = useAuth();
  const [p, setP] = useState<P | null | undefined>(undefined);
  const [games, setGames] = useState<(UserGame & { id: string })[] | null>(null);
  const [tab, setTab] = useState<'online' | 'bots'>('online');
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!name) { setP(null); return; }
    let alive = true;
    setP(undefined); setGames(null);
    uidByName(name).then((uid) => (uid ? getProfile(uid) : null)).then((x) => {
      if (!alive) return;
      setP(x);
      if (x) userGames(x.uid, 100).then((g) => alive && setGames(g), () => alive && setGames([]));
    }, () => alive && setP(null));
    return () => { alive = false; };
  }, [name, me && me.ratings && JSON.stringify(me.ratings)]); // eslint-disable-line react-hooks/exhaustive-deps

  if (p === undefined) return <div className="page narrow"><p className="muted">Loading…</p></div>;
  if (p === null) {
    return (
      <div className="page narrow">
        <h1>Player not found</h1>
        <p className="muted">No player is called “{name}”.</p>
        <button className="btn primary" onClick={() => go('/')}>Play</button>
      </div>
    );
  }
  const mine = !!me && me.uid === p.uid;
  const total = (p.wins || 0) + (p.draws || 0) + (p.losses || 0);
  const botGames = mine ? savedGames().filter((g) => g.source === 'bot') : [];
  return (
    <div className="page profile">
      <header className="page-head profile-head">
        <AvatarImg avatar={p.avatar} size={84} />
        <div className="who">
          <h1>{p.name} <Flag country={p.country} size={30} /></h1>
          <p>Joined {new Date(p.created).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}. {total} {total === 1 ? 'game' : 'games'}: {p.wins || 0} won, {p.draws || 0} drawn, {p.losses || 0} lost.</p>
        </div>
        <div className="row">
          {me && !mine && <FriendButton me={me} other={p} />}
          {mine && <button className="btn" onClick={() => setEditing(!editing)}>{editing ? 'Done' : 'Edit profile'}</button>}
          {mine && <button className="btn ghost" onClick={() => { logOut(); go('/'); }}>Sign out</button>}
        </div>
      </header>
      {mine && editing && <EditLook p={p} onSaved={(x) => setP({ ...p, ...x })} />}
      <div className="ratings">
        {(['bullet', 'blitz', 'rapid', 'classical'] as Speed[]).map((sp) => (
          <div key={sp} className="rating">
            <span>{SPEED_LABEL[sp]}</span>
            <b>{p.ratings ? p.ratings[sp] : 1200}</b>
            <small>{p.games && p.games[sp] ? `${p.games[sp]} rated` : 'no games yet'}</small>
          </div>
        ))}
        <div className="rating">
          <span>Puzzles</span>
          <b>{p.puzzle ? Math.round(p.puzzle.rating) : 1200}</b>
          <small>{p.puzzle ? `${p.puzzle.solved} solved` : 'none solved yet'}</small>
        </div>
      </div>
      <div className="profile-row">
        <RatingChart p={p} />
        <Stats games={games} />
      </div>
      <Achievements got={mine ? { ...(p.ach || {}), ...achStore.get().got } : p.ach || {}} />
      <div className="profile-grid">
        <section className="profile-games">
          <div className="games-head">
            <h2 className="label">Games</h2>
            {mine && (
              <div className="seg small">
                <button aria-pressed={tab === 'online'} onClick={() => setTab('online')}>Online</button>
                <button aria-pressed={tab === 'bots'} onClick={() => setTab('bots')}>Vs bots</button>
              </div>
            )}
          </div>
          {tab === 'online' || !mine ? (
            games ? <UserGameList games={games.slice(0, 30)} empty={mine ? 'Play a game online and it shows up here.' : 'No games yet.'} /> : <p className="muted small">Loading…</p>
          ) : botGames.length === 0 ? <p className="muted small">Your games against bots on this device show up here.</p> : (
            <ul className="game-list">
              {botGames.map((g) => {
                const res = g.result === '1/2-1/2' ? 'draw' : (g.result === '1-0') === (g.playerColor === 0) ? 'win' : 'loss';
                return (
                  <li key={g.id}>
                    <a className="game-row" href={'#/review/' + g.id}>
                      <span className={'res ' + res}>{res === 'draw' ? '½' : res === 'win' ? 'Won' : 'Lost'}</span>
                      <span className="players"><b>vs {g.playerColor === 0 ? g.black : g.white}</b><span>{Math.ceil(g.moves.length / 2)} moves</span></span>
                      <span className="meta">{new Date(g.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="muted small hint-line">Open any finished game to see the full engine review.</p>
        </section>
        <aside>{mine && <MySocial me={p} />}</aside>
      </div>
    </div>
  );
}

// выбор аватарки (фигура и цвет) и страны
function EditLook({ p, onSaved }: { p: P; onSaved: (x: { avatar?: string; country?: string }) => void }) {
  const [piece, setPiece] = useState(p.avatar ? p.avatar[0] : 'N');
  const [color, setColor] = useState(p.avatar ? +p.avatar[1] : 0);
  const [country, setCountry] = useState(p.country || '');
  const [saved, setSaved] = useState(false);
  const save = () => {
    const x = { avatar: piece + color, country: country || null };
    update(ref(db, 'users/' + p.uid), x).then(() => { onSaved({ avatar: x.avatar, country: country || undefined }); setSaved(true); setTimeout(() => setSaved(false), 1500); }, () => {});
  };
  return (
    <section className="side-box edit-look">
      <div className="look-row">
        <AvatarImg avatar={piece + color} size={64} />
        <div className="look-pick">
          <span className="label">Piece</span>
          <div className="row">{AVATAR_PIECES.map((x) => <button key={x} className="look-btn" aria-pressed={piece === x} onClick={() => setPiece(x)}><AvatarImg avatar={x + color} size={34} /></button>)}</div>
          <span className="label">Colour</span>
          <div className="row">{AVATAR_COLORS.map((c, i) => <button key={c} className="swatch-btn" aria-pressed={color === i} style={{ background: c }} onClick={() => setColor(i)} aria-label={'Colour ' + (i + 1)} />)}</div>
        </div>
      </div>
      <label className="label" htmlFor="country">Country</label>
      <div className="row">
        <select id="country" value={country} onChange={(e) => setCountry(e.target.value)}>
          <option value="">Not shown</option>
          {COUNTRIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
        </select>
        <Flag country={country} size={28} />
      </div>
      <button className="btn primary" onClick={save}>{saved ? 'Saved' : 'Save'}</button>
    </section>
  );
}

// график рейтинга по выбранному контролю
function RatingChart({ p }: { p: P }) {
  const speeds: Speed[] = ['bullet', 'blitz', 'rapid', 'classical'];
  const withData = speeds.filter((sp) => p.hist && p.hist[sp] && Object.keys(p.hist[sp]!).length > 0);
  const [sp, setSp] = useState<Speed>(withData[0] || 'blitz');
  const pts = Object.values((p.hist && p.hist[sp]) || {}).sort((a, b) => a.t - b.t);
  const series = [{ r: 1200, t: p.created }, ...pts];
  const W = 520, H = 150, pad = 8;
  const rs = series.map((x) => x.r), lo = Math.min(...rs) - 20, hi = Math.max(...rs) + 20;
  const x = (i: number) => pad + (i / Math.max(1, series.length - 1)) * (W - 2 * pad);
  const y = (r: number) => H - pad - ((r - lo) / Math.max(1, hi - lo)) * (H - 2 * pad);
  const d = series.map((s, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(s.r).toFixed(1)}`).join(' ');
  return (
    <section className="side-box chart-box">
      <div className="games-head">
        <h2 className="label">Rating</h2>
        <div className="seg small">{speeds.map((v) => <button key={v} aria-pressed={sp === v} onClick={() => setSp(v)}>{SPEED_LABEL[v]}</button>)}</div>
      </div>
      {pts.length < 1 ? <p className="muted small">Play rated {SPEED_LABEL[sp].toLowerCase()} games and the rating graph appears here.</p> : (
        <svg className="rating-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${SPEED_LABEL[sp]} rating over time`}>
          <path d={`${d} L${x(series.length - 1)},${H} L${x(0)},${H} Z`} className="area" />
          <path d={d} className="line" />
          <circle cx={x(series.length - 1)} cy={y(series[series.length - 1].r)} r="4" className="dot" />
        </svg>
      )}
      {pts.length > 0 && <p className="muted small">{series.length - 1} rated games. Highest {Math.max(...rs)}, now {rs[rs.length - 1]}.</p>}
    </section>
  );
}

// статистика по последним партиям: результаты белыми и чёрными, любимые дебюты
function Stats({ games }: { games: (UserGame & { id: string })[] | null }) {
  if (!games) return <section className="side-box"><p className="muted small">Loading…</p></section>;
  const done = games.filter((g) => g.result);
  const by = (c: 0 | 1) => {
    const gs = done.filter((g) => g.color === c);
    const w = gs.filter((g) => g.result !== '1/2-1/2' && (g.result === '1-0') === (c === 0)).length;
    const dr = gs.filter((g) => g.result === '1/2-1/2').length;
    return { n: gs.length, w, d: dr, l: gs.length - w - dr };
  };
  const ops = new Map<string, { n: number; pts: number }>();
  done.forEach((g) => { if (!g.op) return; const name = g.op.replace(/^[A-E]\d\d\s+/, '').split(':')[0]; const o = ops.get(name) || { n: 0, pts: 0 }; o.n++; o.pts += g.result === '1/2-1/2' ? 0.5 : (g.result === '1-0') === (g.color === 0) ? 1 : 0; ops.set(name, o); });
  const top = [...ops.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 4);
  const Bar = ({ s, label }: { s: { n: number; w: number; d: number; l: number }; label: string }) => (
    <div className="wdl">
      <span className="label">{label} <span className="muted">{s.n} {s.n === 1 ? 'game' : 'games'}</span></span>
      {s.n === 0 ? <p className="muted small">No games yet.</p> : (
        <div className="wdl-bar" title={`${s.w} won, ${s.d} drawn, ${s.l} lost`}>
          <i className="w" style={{ flex: s.w }}>{s.w ? Math.round((100 * s.w) / s.n) + '%' : ''}</i>
          <i className="d" style={{ flex: s.d }}>{s.d ? Math.round((100 * s.d) / s.n) + '%' : ''}</i>
          <i className="l" style={{ flex: s.l }}>{s.l ? Math.round((100 * s.l) / s.n) + '%' : ''}</i>
        </div>
      )}
    </div>
  );
  return (
    <section className="side-box stats-box">
      <h2 className="label">Results</h2>
      <Bar s={by(0)} label="With white" />
      <Bar s={by(1)} label="With black" />
      {top.length > 0 && (
        <>
          <h2 className="label">Favourite openings</h2>
          {top.map(([n, o]) => <div key={n} className="op-row"><span>{n}</span><span className="muted">{o.n} {o.n === 1 ? 'game' : 'games'}, {Math.round((100 * o.pts) / o.n)}%</span></div>)}
        </>
      )}
    </section>
  );
}

function Achievements({ got }: { got: Record<string, number> }) {
  const n = ACHIEVEMENTS.filter((a) => got[a.id]).length;
  return (
    <section className="side-box ach-box">
      <h2 className="label">Achievements <span className="muted">{n} of {ACHIEVEMENTS.length}</span></h2>
      <div className="ach-grid">
        {ACHIEVEMENTS.map((a) => (
          <div key={a.id} className={'ach' + (got[a.id] ? ' got' : '')} title={a.text}>
            <AchBadge id={a.id} got={!!got[a.id]} />
            <span><b>{a.name}</b><span>{a.text}</span></span>
          </div>
        ))}
      </div>
    </section>
  );
}
