// Профиль игрока: рейтинги, друзья, партии. Любую законченную партию можно открыть и разобрать.
import { useEffect, useState } from 'react';
import { useAuth, getProfile, uidByName, logOut, type Profile as P, type Speed } from '../lib/auth';
import { userGames, SPEED_LABEL, tcName, type UserGame } from '../lib/online';
import { useFriendState, useFriends, useRequests, useOnlineSet, sendRequest, cancelRequest, acceptRequest, declineRequest, removeFriend } from '../lib/social';
import { savedGames } from '../lib/store';
import { go } from '../lib/router';
import { Icon } from '../components/icons';

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
  useEffect(() => {
    if (!name) { setP(null); return; }
    let alive = true;
    setP(undefined); setGames(null);
    uidByName(name).then((uid) => (uid ? getProfile(uid) : null)).then((x) => {
      if (!alive) return;
      setP(x);
      if (x) userGames(x.uid, 30).then((g) => alive && setGames(g), () => alive && setGames([]));
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
        <div>
          <h1>{p.name}</h1>
          <p>Joined {new Date(p.created).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}. {total} {total === 1 ? 'game' : 'games'}: {p.wins || 0} won, {p.draws || 0} drawn, {p.losses || 0} lost.</p>
        </div>
        <div className="row">
          {me && !mine && <FriendButton me={me} other={p} />}
          {mine && <button className="btn" onClick={() => { logOut(); go('/'); }}>Sign out</button>}
        </div>
      </header>
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
            games ? <UserGameList games={games} empty={mine ? 'Play a game online and it shows up here.' : 'No games yet.'} /> : <p className="muted small">Loading…</p>
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
