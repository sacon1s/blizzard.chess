// Профиль игрока: шапка с аватаром, рейтинги, график, партии, достижения, друзья.
// Любую законченную партию можно открыть и разобрать.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth, getProfile, uidByName, logOut, type Profile as P, type Speed } from '../lib/auth';
import { userGames, SPEED_LABEL, tcName, type UserGame } from '../lib/online';
import { useFriendState, useFriends, useRequests, useOnlineSet, sendRequest, cancelRequest, acceptRequest, declineRequest, removeFriend } from '../lib/social';
import { savedGames } from '../lib/store';
import { go } from '../lib/router';
import { Icon } from '../components/icons';
import { AvatarImg, PlayerAvatar, Flag, avatarColor, photoToDataUrl } from '../components/Avatar';
import { COUNTRIES, countryName } from '../lib/countries';
import { award, ACHIEVEMENTS, achStore } from '../lib/achievements';
import { AchBadge } from '../components/AchIcon';
import { ref, update } from 'firebase/database';
import { db } from '../lib/firebase';

const SPEED_ICON: Record<Speed, () => ReactNode> = { bullet: Icon.bullet, blitz: Icon.bolt, rapid: Icon.clock, classical: Icon.hourglass };

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
              <span className="players">
                <b><PlayerAvatar uid={g.opp} size={20} />vs {g.oppName}</b>
                <span>{tcName(g.tc)} {SPEED_LABEL[g.speed].toLowerCase()}{g.rated ? '' : ', casual'}{g.op ? ` · ${g.op.split(':')[0]}` : ''}</span>
              </span>
              <span className="meta">
                {g.delta ? <em className={g.delta > 0 ? 'up' : 'down'}>{(g.delta > 0 ? '+' : '−') + Math.abs(g.delta)}</em> : null}
                <span>{new Date(g.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

// compact — в карточке игрока во время партии: без кнопки вызова, чтобы не уходить из партии
export function FriendButton({ me, other, compact }: { me: P; other: P; compact?: boolean }) {
  const st = useFriendState(me.uid, other.uid);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const run = (f: () => Promise<unknown>) => { setBusy(true); f().catch(() => {}).finally(() => setBusy(false)); };
  if (st === null) return null;
  if (st === 'friends') {
    return (
      <>
        {!compact && <button className="btn primary" onClick={() => go(`/?tab=friends&with=${other.uid}`)}><Icon.online />Challenge</button>}
        {confirm
          ? <button className="btn danger" disabled={busy} onClick={() => run(() => removeFriend(me.uid, other.uid))}>Remove from friends</button>
          : <button className="btn" onClick={() => { setConfirm(true); setTimeout(() => setConfirm(false), 3000); }}>Friends ✓</button>}
      </>
    );
  }
  if (st === 'sent') return <button className="btn" disabled={busy} onClick={() => run(() => cancelRequest(me.uid, other.uid))}>Cancel friend request</button>;
  if (st === 'received') {
    return (
      <>
        <button className="btn primary" disabled={busy} onClick={() => run(() => acceptRequest(me, other.uid, other.name))}>Accept friend request</button>
        <button className="btn ghost" disabled={busy} onClick={() => run(() => declineRequest(me.uid, other.uid))}>Decline</button>
      </>
    );
  }
  return <button className="btn primary" disabled={busy} onClick={() => run(() => sendRequest(me, other.uid))}><Icon.plus />Add friend</button>;
}

function Friends({ p, mine }: { p: P; mine: boolean }) {
  const requests = useRequests(mine ? p.uid : null);
  const friends = useFriends(p.uid);
  const onlineSet = useOnlineSet();
  useEffect(() => { if (mine && friends && friends.length) award('friend1'); }, [mine, friends && friends.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const sorted = (friends || []).slice().sort((a, b) => +onlineSet.has(b.uid) - +onlineSet.has(a.uid));
  return (
    <>
      {mine && requests.length > 0 && (
        <section className="side-box">
          <h2 className="label">Friend requests</h2>
          {requests.map((r) => (
            <div key={r.uid} className="friend-row">
              <PlayerAvatar uid={r.uid} size={30} />
              <a href={'#/profile/' + r.name}>{r.name}</a>
              <button className="btn primary small-btn" onClick={() => acceptRequest(p, r.uid, r.name)}>Accept</button>
              <button className="btn ghost small-btn" onClick={() => declineRequest(p.uid, r.uid)}>Decline</button>
            </div>
          ))}
        </section>
      )}
      <section className="side-box">
        <h2 className="label">Friends {friends && friends.length > 0 && <span className="muted">{friends.length}</span>}</h2>
        {friends === null ? <p className="muted small">Loading…</p> : friends.length === 0 ? (
          <p className="muted small">{mine ? 'No friends yet. Find players with the search at the top.' : 'No friends yet.'}</p>
        ) : sorted.map((f) => (
          <div key={f.uid} className="friend-row">
            <span className="ava-wrap"><PlayerAvatar uid={f.uid} size={30} />{onlineSet.has(f.uid) && <i className="ava-online" title="Online" />}</span>
            <a href={'#/profile/' + f.name}>{f.name}</a>
            {mine && <button className="btn small-btn" onClick={() => go(`/?tab=friends&with=${f.uid}`)}>Play</button>}
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
  const onlineSet = useOnlineSet();
  useEffect(() => {
    if (!name) { setP(null); return; }
    let alive = true;
    setP(undefined); setGames(null); setEditing(false);
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
  const online = onlineSet.has(p.uid);
  const speeds: Speed[] = ['bullet', 'blitz', 'rapid', 'classical'];
  const main = speeds.reduce((a, b) => ((p.games?.[b] || 0) > (p.games?.[a] || 0) ? b : a), 'blitz' as Speed);
  return (
    <div className="page profile">
      <header className="profile-hero" style={{ ['--tint' as string]: avatarColor(p.avatar) }}>
        <div className="hero-cover" aria-hidden="true" />
        <div className="hero-body">
          <div className="hero-ava">
            <AvatarImg avatar={p.avatar} photo={p.photo} size={128} />
            {online && <i className="ava-online big" title="Online now" />}
          </div>
          <div className="hero-who">
            <h1>{p.name} <Flag country={p.country} size={28} /></h1>
            <p className="hero-meta">
              {online ? <span className="online-tag">Online now</span> : null}
              {p.country && <span>{countryName(p.country)}</span>}
              <span>Joined {new Date(p.created).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
            </p>
            {p.about && <p className="hero-about">{p.about}</p>}
          </div>
          <div className="hero-actions">
            {me && !mine && <FriendButton me={me} other={p} />}
            {mine && <button className="btn" onClick={() => setEditing(!editing)}><Icon.pencil />{editing ? 'Close' : 'Edit profile'}</button>}
            {mine && <button className="btn ghost" onClick={() => { logOut(); go('/'); }}>Sign out</button>}
          </div>
        </div>
        <div className="hero-stats">
          <div><b>{total}</b><span>games</span></div>
          <div><b className="w">{p.wins || 0}</b><span>won</span></div>
          <div><b>{p.draws || 0}</b><span>drawn</span></div>
          <div><b className="l">{p.losses || 0}</b><span>lost</span></div>
          <div><b>{total ? Math.round((100 * ((p.wins || 0) + (p.draws || 0) / 2)) / total) + '%' : '—'}</b><span>score</span></div>
        </div>
      </header>
      {mine && editing && <EditProfile p={p} onSaved={(x) => setP({ ...p, ...x })} onClose={() => setEditing(false)} />}
      <div className="ratings">
        {speeds.map((sp) => {
          const I = SPEED_ICON[sp];
          return (
            <div key={sp} className={'rating' + (sp === main && p.games?.[sp] ? ' main' : '')}>
              <span className="r-head"><I />{SPEED_LABEL[sp]}</span>
              <b>{p.ratings ? p.ratings[sp] : 1200}</b>
              <small>{p.games && p.games[sp] ? `${p.games[sp]} rated ${p.games[sp] === 1 ? 'game' : 'games'}` : 'no games yet'}</small>
            </div>
          );
        })}
        <div className="rating">
          <span className="r-head"><Icon.puzzle />Puzzles</span>
          <b>{p.puzzle ? Math.round(p.puzzle.rating) : 1200}</b>
          <small>{p.puzzle ? `${p.puzzle.solved} solved` : 'none solved yet'}</small>
        </div>
      </div>
      <div className="profile-cols">
        <div className="profile-main">
          <RatingChart p={p} />
          <section className="side-box profile-games">
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
                        <span className="meta"><span>{new Date(g.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span></span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="muted small hint-line">Open any finished game to see the full engine review.</p>
          </section>
        </div>
        <aside className="profile-side">
          <Stats games={games} />
          <Achievements got={mine ? { ...(p.ach || {}), ...achStore.get().got } : p.ach || {}} />
          <Friends p={p} mine={mine} />
        </aside>
      </div>
    </div>
  );
}

// изменение профиля: картинка (своё фото или стандартная), страна, пара слов о себе
function EditProfile({ p, onSaved, onClose }: { p: P; onSaved: (x: Partial<P>) => void; onClose: () => void }) {
  const [usePhoto, setUsePhoto] = useState(p.avatar === 'p' && !!p.photo);
  const [photo, setPhoto] = useState(p.photo || '');
  const [country, setCountry] = useState(p.country || '');
  const [about, setAbout] = useState(p.about || '');
  const [state, setState] = useState<'' | 'saving' | 'saved' | 'error'>('');
  const [photoErr, setPhotoErr] = useState('');
  const file = useRef<HTMLInputElement>(null);
  async function pick(f: File | undefined) {
    if (!f) return;
    setPhotoErr('');
    try { const d = await photoToDataUrl(f); setPhoto(d); setUsePhoto(true); } catch { setPhotoErr('Couldn’t read this picture. Try a JPG or PNG.'); }
  }
  function save() {
    setState('saving');
    const avatar = usePhoto && photo ? 'p' : null;
    const x: Record<string, unknown> = { avatar, country: country || null, about: about.trim().slice(0, 160) || null };
    if (avatar) x.photo = photo;
    update(ref(db, 'users/' + p.uid), x).then(() => {
      onSaved({ avatar: avatar || undefined, country: country || undefined, about: about.trim() || undefined, photo: avatar ? photo : p.photo });
      setState('saved'); setTimeout(() => { setState(''); onClose(); }, 900);
    }, () => setState('error'));
  }
  return (
    <section className="side-box edit-profile">
      <h2 className="edit-title">Profile picture</h2>
      <div className="pic-choice">
        <button className="pic-opt" aria-pressed={!usePhoto} onClick={() => setUsePhoto(false)}>
          <AvatarImg size={72} />
          <span>Standard</span>
        </button>
        <button className="pic-opt" aria-pressed={usePhoto} onClick={() => (photo ? setUsePhoto(true) : file.current && file.current.click())}>
          {photo ? <AvatarImg avatar="p" photo={photo} size={72} /> : <span className="pic-empty"><Icon.camera /></span>}
          <span>Your photo</span>
        </button>
        <div className="pic-actions">
          <input ref={file} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files ? e.target.files[0] : undefined)} />
          <button className="btn" onClick={() => file.current && file.current.click()}><Icon.camera />{photo ? 'Upload another photo' : 'Upload a photo'}</button>
          <p className="muted small">Cropped to a square. Everyone who opens your profile can see it.</p>
          {photoErr && <p className="error">{photoErr}</p>}
        </div>
      </div>
      <div className="edit-fields">
        <label className="field">
          <span className="label">Country</span>
          <span className="row">
            <select value={country} onChange={(e) => setCountry(e.target.value)}>
              <option value="">Not shown</option>
              {COUNTRIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
            </select>
            <Flag country={country} size={28} />
          </span>
        </label>
        <label className="field">
          <span className="label">About you <span className="muted">{about.length}/160</span></span>
          <textarea value={about} maxLength={160} rows={2} onChange={(e) => setAbout(e.target.value)} placeholder="Favourite opening, your club, anything" />
        </label>
      </div>
      <div className="row">
        <button className="btn primary" onClick={save} disabled={state === 'saving'}>{state === 'saved' ? 'Saved' : state === 'saving' ? 'Saving…' : 'Save'}</button>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        {state === 'error' && <span className="error">Couldn’t save. Check your connection.</span>}
      </div>
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
  const W = 620, H = 170, pad = 10;
  const rs = series.map((x) => x.r), lo = Math.min(...rs) - 20, hi = Math.max(...rs) + 20;
  const x = (i: number) => pad + (i / Math.max(1, series.length - 1)) * (W - 2 * pad);
  const y = (r: number) => H - pad - ((r - lo) / Math.max(1, hi - lo)) * (H - 2 * pad);
  const d = series.map((s, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(s.r).toFixed(1)}`).join(' ');
  const first = rs[0], now = rs[rs.length - 1];
  return (
    <section className="side-box chart-box">
      <div className="games-head">
        <h2 className="label">Rating</h2>
        <div className="seg small">{speeds.map((v) => <button key={v} aria-pressed={sp === v} onClick={() => setSp(v)}>{SPEED_LABEL[v]}</button>)}</div>
      </div>
      {pts.length < 1 ? <p className="muted small chart-empty">Play rated {SPEED_LABEL[sp].toLowerCase()} games and the rating graph appears here.</p> : (
        <>
          <div className="chart-nums">
            <b>{now}</b>
            <span className={now >= first ? 'up' : 'down'}>{now >= first ? '+' : '−'}{Math.abs(now - first)} since joining</span>
            <span className="muted">highest {Math.max(...rs)}</span>
          </div>
          <svg className="rating-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${SPEED_LABEL[sp]} rating over time`}>
            {[0.25, 0.5, 0.75].map((k) => <line key={k} x1="0" x2={W} y1={H * k} y2={H * k} className="grid" />)}
            <path d={`${d} L${x(series.length - 1)},${H} L${x(0)},${H} Z`} className="area" />
            <path d={d} className="line" />
            <circle cx={x(series.length - 1)} cy={y(now)} r="4.5" className="dot" />
          </svg>
          <p className="muted small">{series.length - 1} rated {series.length - 1 === 1 ? 'game' : 'games'}.</p>
        </>
      )}
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
  const Bar = ({ s, label, c }: { s: { n: number; w: number; d: number; l: number }; label: string; c: 0 | 1 }) => (
    <div className="wdl">
      <span className="wdl-label"><i className={'piece-dot ' + (c ? 'b' : 'w')} />{label} <span className="muted">{s.n} {s.n === 1 ? 'game' : 'games'}</span></span>
      {s.n === 0 ? <p className="muted small">No games yet.</p> : (
        <>
          <div className="wdl-bar" title={`${s.w} won, ${s.d} drawn, ${s.l} lost`}>
            <i className="w" style={{ flex: s.w }} /><i className="d" style={{ flex: s.d }} /><i className="l" style={{ flex: s.l }} />
          </div>
          <span className="wdl-nums"><span className="w">{s.w} won</span><span>{s.d} drawn</span><span className="l">{s.l} lost</span></span>
        </>
      )}
    </div>
  );
  return (
    <section className="side-box stats-box">
      <h2 className="label">Results</h2>
      <Bar s={by(0)} label="With white" c={0} />
      <Bar s={by(1)} label="With black" c={1} />
      {top.length > 0 && (
        <>
          <h2 className="label">Favourite openings</h2>
          {top.map(([n, o]) => <div key={n} className="op-row"><span>{n}</span><span className="muted">{o.n} {o.n === 1 ? 'game' : 'games'}, {Math.round((100 * o.pts) / o.n)}%</span></div>)}
        </>
      )}
    </section>
  );
}

// достижения: полученные — значками, остальные — по кнопке
function Achievements({ got }: { got: Record<string, number> }) {
  const [all, setAll] = useState(false);
  const have = ACHIEVEMENTS.filter((a) => got[a.id]);
  const list = all ? ACHIEVEMENTS : have;
  return (
    <section className="side-box ach-box">
      <div className="games-head">
        <h2 className="label">Achievements <span className="muted">{have.length} of {ACHIEVEMENTS.length}</span></h2>
        <button className="link-btn" onClick={() => setAll(!all)}>{all ? 'Show earned' : 'Show all'}</button>
      </div>
      <div className="ach-meter"><i style={{ width: `${(100 * have.length) / ACHIEVEMENTS.length}%` }} /></div>
      {list.length === 0 ? <p className="muted small">None yet. Win a game online or solve puzzles to earn the first one.</p> : (
        <div className="ach-list">
          {list.map((a) => (
            <div key={a.id} className={'ach' + (got[a.id] ? ' got' : '')} title={a.text}>
              <AchBadge id={a.id} got={!!got[a.id]} size={34} />
              <span><b>{a.name}</b><span>{a.text}</span></span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
