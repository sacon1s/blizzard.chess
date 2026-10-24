// Профиль игрока: рейтинги по контролям, итоги, последние партии.
import { useEffect, useState } from 'react';
import { useAuth, getProfile, uidByName, logOut, type Profile as P, type Speed } from '../lib/auth';
import { userGames, SPEED_LABEL, type UserGame } from '../lib/online';
import { UserGameList } from './Online';
import { go } from '../lib/router';

export default function Profile({ name }: { name?: string }) {
  const { profile: me } = useAuth();
  const [p, setP] = useState<P | null | undefined>(undefined);
  const [games, setGames] = useState<(UserGame & { id: string })[] | null>(null);
  useEffect(() => {
    if (!name) { setP(null); return; }
    let alive = true;
    setP(undefined); setGames(null);
    uidByName(name).then((uid) => (uid ? getProfile(uid) : null)).then((x) => {
      if (!alive) return;
      setP(x);
      if (x) userGames(x.uid, 20).then((g) => alive && setGames(g), () => alive && setGames([]));
    }, () => alive && setP(null));
    return () => { alive = false; };
  }, [name, me && me.ratings && JSON.stringify(me.ratings)]); // eslint-disable-line react-hooks/exhaustive-deps

  if (p === undefined) return <div className="page narrow"><p className="muted">Loading…</p></div>;
  if (p === null) {
    return (
      <div className="page narrow">
        <h1>Player not found</h1>
        <p className="muted">No player is called “{name}”.</p>
        <button className="btn primary" onClick={() => go('/')}>Play online</button>
      </div>
    );
  }
  const mine = me && me.uid === p.uid;
  const total = (p.wins || 0) + (p.draws || 0) + (p.losses || 0);
  return (
    <div className="page profile">
      <header className="page-head profile-head">
        <div>
          <h1>{p.name}</h1>
          <p>Joined {new Date(p.created).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}. {total} {total === 1 ? 'game' : 'games'}: {p.wins || 0} won, {p.draws || 0} drawn, {p.losses || 0} lost.</p>
        </div>
        {mine && <button className="btn" onClick={() => { logOut(); go('/'); }}>Sign out</button>}
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
      <section className="profile-games">
        <h2 className="label">Recent games</h2>
        {games ? <UserGameList games={games} empty={mine ? 'Play a game online and it shows up here.' : 'No games yet.'} /> : <p className="muted small">Loading…</p>}
      </section>
    </div>
  );
}
