// Страница арены: таблица, время до начала или конца, вход и автоматический подбор соперника.
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/auth';
import { arenaById, useArenaPlayers, joinArena, leaveArena, schedule } from '../lib/arena';
import { seek, tcName, ratingOf, parseTcStr } from '../lib/online';
import { speedOf } from '../lib/auth';
import { award } from '../lib/achievements';
import { PlayerAvatar } from '../components/Avatar';
import { go } from '../lib/router';

const fmt = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};

export default function Arena({ id }: { id?: string }) {
  const info = id ? arenaById(id) : null;
  const { profile } = useAuth();
  const players = useArenaPlayers(id || 'none');
  const [, tick] = useState(0);
  const [pairing, setPairing] = useState(false);
  const [err, setErr] = useState('');
  const cancelRef = useRef<(() => void) | null>(null);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  const now = Date.now();
  const running = !!info && now >= info.start && now < info.end;
  const over = !!info && now >= info.end;
  const me = profile && players ? players.find((p) => p.uid === profile.uid) : undefined;
  // автоматический подбор соперника, пока игрок в арене и страница открыта
  useEffect(() => {
    if (!info || !profile || !me || !running || cancelRef.current) return;
    setPairing(true);
    cancelRef.current = seek(info.tc, profile, (gid) => { cancelRef.current = null; setPairing(false); go('/game/' + gid); }, { arena: info.id });
  }, [info && info.id, profile && profile.uid, !!me, running]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (cancelRef.current) { cancelRef.current(); cancelRef.current = null; } }, []);
  useEffect(() => { if (!running && cancelRef.current) { cancelRef.current(); cancelRef.current = null; setPairing(false); } }, [running]);
  useEffect(() => {
    if (!over || !profile || !players || !players.length) return;
    const mine = players.find((p) => p.uid === profile.uid);
    if (mine && mine.games > 0) award('arena1');
    if (players[0].uid === profile.uid && players[0].games > 0) award('arenaWin');
  }, [over, players && players.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!info) return <div className="page narrow"><h1>Arena not found</h1><button className="btn primary" onClick={() => go('/')}>Play</button></div>;
  const sp = speedOf(parseTcStr(info.tc).base, parseTcStr(info.tc).inc);
  async function join() {
    if (!profile) { go('/login'); return; }
    try { await joinArena(info!.id, profile, ratingOf(profile, sp)); } catch { setErr('Couldn’t join. Check your connection.'); }
  }
  async function leave() {
    if (!profile) return;
    if (cancelRef.current) { cancelRef.current(); cancelRef.current = null; }
    setPairing(false);
    await leaveArena(info!.id, profile.uid).catch(() => {});
  }
  return (
    <div className="page arena">
      <header className="page-head">
        <h1>{info.name}</h1>
        <p>{tcName(info.tc)}, rated. Win 2 points, draw 1. After two wins in a row your points double until you stop winning.</p>
      </header>
      <div className="arena-grid">
        <section className="side-box">
          <h2 className="label">Standings</h2>
          {!players ? <p className="muted small">Loading…</p> : players.length === 0 ? <p className="muted small">No players yet. Join and be the first.</p> : (
            <table className="standings">
              <tbody>
                {players.map((p, i) => (
                  <tr key={p.uid} className={profile && p.uid === profile.uid ? 'me' : ''}>
                    <td className="rk">{i + 1}</td>
                    <td className="who"><PlayerAvatar uid={p.uid} size={24} /><a href={'#/profile/' + p.name}>{p.name}</a><span className="muted">{p.rating}</span>{p.streak >= 2 && <span className="fire" title="On a winning streak: double points">🔥</span>}</td>
                    <td className="sheet">{p.sheet.split('').map((c, k) => <i key={k} className={'s' + c}>{c}</i>)}</td>
                    <td className="pts">{p.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <aside className="side-box arena-side">
          <div className="arena-clock">
            <span>{over ? 'Finished' : running ? 'Ends in' : 'Starts in'}</span>
            <b>{over ? '—' : fmt(running ? info.end - now : info.start - now)}</b>
          </div>
          {err && <p className="error">{err}</p>}
          {over ? (
            <p className="muted">{players && players[0] ? <>Winner: <b>{players[0].name}</b> with {players[0].score} points.</> : 'Nobody played.'}</p>
          ) : !me ? (
            <button className="btn primary big wide" onClick={join}>{profile ? 'Join the arena' : 'Sign in to join'}</button>
          ) : (
            <>
              <p className="notice">{running ? (pairing ? 'Looking for your next opponent… Keep this page open.' : 'You’re in. Your next game starts automatically.') : 'You’re in. Pairing starts when the arena begins. Keep this page open.'}</p>
              <p className="muted small">Your score: <b>{me.score}</b> in {me.games} {me.games === 1 ? 'game' : 'games'}.</p>
              <button className="btn ghost" onClick={leave}>Leave the arena</button>
            </>
          )}
          <h2 className="label section-gap">Next arenas</h2>
          {schedule(now, 4).filter((a) => a.id !== info.id).slice(0, 3).map((a) => (
            <a key={a.id} href={'#/arena/' + a.id} className="arena-link"><b>{a.name}</b><span className="muted small">{a.start > now ? `starts in ${fmt(a.start - now)}` : 'running now'}</span></a>
          ))}
        </aside>
      </div>
    </div>
  );
}

// карточка ближайших арен для страницы Play
export function ArenaCards() {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  const now = Date.now();
  return (
    <div className="arena-cards">
      {schedule(now, 2).map((a) => (
        <a key={a.id} href={'#/arena/' + a.id} className="arena-link">
          <b>{a.name}</b>
          <span className="muted small">{tcName(a.tc)}, {a.start > now ? `starts in ${fmt(a.start - now)}` : `ends in ${fmt(a.end - now)}`}</span>
        </a>
      ))}
    </div>
  );
}
