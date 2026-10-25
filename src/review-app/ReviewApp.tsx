// Разбор партий на сайте движка Blizzard: партии с chess.com, lichess, Blizzard Chess или любой PGN.
// Сам разбор — тот же, что на Blizzard Chess (движок Blizzard прямо в браузере).
import { useEffect, useState } from 'react';
import Board from '../components/Board';
import { PlayerBar } from '../components/GameParts';
import { Icon } from '../components/icons';
import { ReviewGame } from '../pages/Review';
import { START_FEN } from '../lib/chess';
import { buildMoves, parseInput } from '../lib/review';
import { useSettings, makeStore, type SavedGame } from '../lib/store';
import { uidByName } from '../lib/auth';
import { userGames, tcName } from '../lib/online';
import { ref, get } from 'firebase/database';
import { db } from '../lib/firebase';

const CHESS_SITE = 'https://sacon1s.github.io/blizzard.chess/';
// карточка игрока открывает профиль на сайте Blizzard Chess
(window as unknown as { BLZ_PROFILE_BASE?: string }).BLZ_PROFILE_BASE = CHESS_SITE;
type Source = 'chesscom' | 'lichess' | 'blizzard' | 'pgn';
const SOURCES: { v: Source; label: string; hint: string }[] = [
  { v: 'chesscom', label: 'chess.com', hint: 'chess.com username' },
  { v: 'lichess', label: 'lichess', hint: 'lichess username' },
  { v: 'blizzard', label: 'Blizzard Chess', hint: 'Blizzard Chess username' },
  { v: 'pgn', label: 'PGN', hint: '' },
];
interface Item { key: string; white: string; black: string; wElo?: number; bElo?: number; result: string; date: number; tc: string; me?: 0 | 1; load: () => Promise<SavedGame> }

const prefs = makeStore<{ source: Source; names: Partial<Record<Source, string>> }>('reviewApp', { source: 'chesscom', names: {} });

const resOf = (w?: string, b?: string) => (w === 'win' ? '1-0' : b === 'win' ? '0-1' : '1/2-1/2');
function fromPgn(id: string, pgn: string, meName: string, extra: Partial<SavedGame> = {}): SavedGame {
  const r = parseInput(pgn);
  if (r.error || !r.moves.length) throw new Error(r.error || 'This game has no moves.');
  const b = buildMoves(r.startFen, r.moves);
  const h = r.headers;
  const white = h.White || 'White', black = h.Black || 'Black';
  const me = meName && white.toLowerCase() === meName.toLowerCase() ? 0 : meName && black.toLowerCase() === meName.toLowerCase() ? 1 : undefined;
  return {
    id, date: new Date().toISOString(), white, black, startFen: r.startFen, moves: r.moves, sans: b.moves.map((m) => m.san),
    result: (b.end && b.end.result) || r.result || h.Result || '*', reason: b.end ? b.end.reason : '', source: 'import', playerColor: me, event: h.Event, ...extra,
  };
}

async function loadChesscom(user: string): Promise<Item[]> {
  const u = user.trim().toLowerCase();
  const r = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(u)}/games/archives`);
  if (r.status === 404) throw new Error('No chess.com player with this name.');
  if (!r.ok) throw new Error('chess.com didn’t answer. Try again in a minute.');
  const { archives } = await r.json() as { archives: string[] };
  const out: Item[] = [];
  for (const url of archives.slice().reverse().slice(0, 4)) {
    const m = await (await fetch(url)).json() as { games: any[] };
    for (const g of m.games.slice().reverse()) {
      if (g.rules !== 'chess' || !g.pgn) continue;
      const [base, inc] = String(g.time_control || '').split('+');
      const tc = base.includes('/') ? 'daily' : inc ? `${Math.round(+base / 60)}+${inc}` : `${Math.round(+base / 60)}+0`;
      const me = g.white.username.toLowerCase() === u ? 0 : g.black.username.toLowerCase() === u ? 1 : undefined;
      out.push({
        key: g.url, white: g.white.username, black: g.black.username, wElo: g.white.rating, bElo: g.black.rating,
        result: resOf(g.white.result, g.black.result), date: (g.end_time || 0) * 1000, tc, me,
        load: async () => fromPgn('cc-' + String(g.url).split('/').pop(), g.pgn, u, { date: new Date((g.end_time || 0) * 1000).toISOString() }),
      });
      if (out.length >= 30) return out;
    }
  }
  return out;
}

async function loadLichess(user: string): Promise<Item[]> {
  const u = user.trim();
  const r = await fetch(`https://lichess.org/api/games/user/${encodeURIComponent(u)}?max=30&pgnInJson=true&clocks=false&evals=false`, { headers: { Accept: 'application/x-ndjson' } });
  if (r.status === 404) throw new Error('No lichess player with this name.');
  if (!r.ok) throw new Error('lichess didn’t answer. Try again in a minute.');
  const lines = (await r.text()).split('\n').filter(Boolean).map((l) => JSON.parse(l));
  return lines.filter((g) => g.variant === 'standard' && g.pgn).map((g) => {
    const name = (p: any) => (p.user ? p.user.name : p.aiLevel ? `Stockfish level ${p.aiLevel}` : 'Anonymous');
    const w = name(g.players.white), b = name(g.players.black);
    const me = w.toLowerCase() === u.toLowerCase() ? 0 : b.toLowerCase() === u.toLowerCase() ? 1 : undefined;
    const tc = g.clock ? `${Math.round(g.clock.initial / 60)}+${g.clock.increment}` : g.speed === 'correspondence' ? 'daily' : '';
    return {
      key: g.id, white: w, black: b, wElo: g.players.white.rating, bElo: g.players.black.rating,
      result: g.winner === 'white' ? '1-0' : g.winner === 'black' ? '0-1' : '1/2-1/2', date: g.createdAt, tc, me,
      load: async () => fromPgn('li-' + g.id, g.pgn, u, { date: new Date(g.createdAt).toISOString() }),
    } as Item;
  });
}

async function loadBlizzard(user: string): Promise<Item[]> {
  const uid = await uidByName(user.trim());
  if (!uid) throw new Error('No Blizzard Chess player with this name.');
  const list = (await userGames(uid, 30)).filter((g) => g.result);
  return list.map((ug) => ({
    key: ug.id, white: ug.color === 0 ? user : ug.oppName, black: ug.color === 1 ? user : ug.oppName, result: ug.result || '*', date: ug.date,
    tc: ug.daily ? 'daily' : ug.tc, me: ug.color,
    load: async () => {
      const s = await get(ref(db, 'games/' + ug.id));
      if (!s.exists()) throw new Error('This game was removed.');
      const v = s.val();
      const ms: string[] = v.moves ? v.moves.split(' ') : [];
      const start = v.fen || START_FEN;
      const b = buildMoves(start, ms);
      return {
        id: 'bc-' + ug.id, date: new Date(v.created || ug.date).toISOString(), white: v.wName || 'White', black: v.bName || 'Black', startFen: start,
        moves: ms, sans: b.moves.map((m) => m.san), result: v.result || '*', reason: v.reason || '', source: 'online', playerColor: ug.color, wUid: v.white, bUid: v.black, speed: v.speed,
      } as SavedGame;
    },
  }));
}

export default function ReviewApp() {
  const s = useSettings();
  const p = prefs.get();
  const [source, setSource] = useState<Source>(p.source);
  const [name, setName] = useState(p.names[p.source] || '');
  const [pgn, setPgn] = useState('');
  const [items, setItems] = useState<Item[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [game, setGame] = useState<SavedGame | null>(null);
  useEffect(() => { const n = prefs.get().names[source] || ''; setName(n); setItems(null); setErr(''); prefs.set({ source }); if (n && source !== 'pgn') load(n); }, [source]); // eslint-disable-line react-hooks/exhaustive-deps

  async function load(n = name) {
    if (!n.trim()) return;
    setBusy(true); setErr(''); setItems(null);
    prefs.set({ names: { ...prefs.get().names, [source]: n.trim() } });
    try {
      const list = source === 'chesscom' ? await loadChesscom(n) : source === 'lichess' ? await loadLichess(n) : await loadBlizzard(n);
      setItems(list);
      if (!list.length) setErr('No finished games found.');
    } catch (e: any) {
      setErr(e && e.message && !/Failed to fetch|NetworkError/.test(e.message) ? e.message : 'Couldn’t load the games. Check the name and your connection.');
    }
    setBusy(false);
  }
  async function open(it: Item) {
    setBusy(true); setErr('');
    try { setGame(await it.load()); } catch (e: any) { setErr(e && e.message ? e.message : 'Couldn’t open this game.'); }
    setBusy(false);
  }
  function openPgn() {
    try { setGame(fromPgn('pgn-' + Date.now().toString(36), pgn, '')); setErr(''); } catch (e: any) { setErr(e.message); }
  }

  return (
    <div className="app">
      <nav className="rail" aria-label="Main">
        <a className="rail-brand" href="../" aria-label="Blizzard engine">
          <img src="logo.svg" alt="" className="logo logo-light" />
          <img src="logo-dark.svg" alt="" className="logo logo-dark" />
          <span className="wordmark">Blizzard</span>
        </a>
        <div className="rail-items">
          <a href="../" className="rail-item"><Icon.analysis /><span>Engine</span></a>
          <a href="./" className="rail-item on" aria-current="page"><Icon.review /><span>Review</span></a>
        </div>
        <div className="rail-foot">
          <a href={CHESS_SITE} className="news-pill"><b>New</b><span>Blizzard Chess is out now</span></a>
        </div>
      </nav>
      <main className="main">
        {game ? (
          <ReviewGame key={game.id} game={game} onBack={() => setGame(null)} analyseUrl={(fen) => CHESS_SITE + '#/analysis?fen=' + encodeURIComponent(fen)} />
        ) : (
          <div className="game-layout fixed-panel ra-pick">
            <div className="board-col">
              <PlayerBar color={1} name="Black" avatar={<Icon.user />} />
              <Board resizable fen={START_FEN} orientation={0} movable={null} lastMove={null} theme={s.theme} coords={s.showCoords} />
              <PlayerBar color={0} name="White" avatar={<Icon.user />} />
            </div>
            <aside className="side-panel">
              <div className="ra-head">
                <h1>Game review</h1>
                <p className="muted small">Every move rated from brilliant to blunder, with accuracy and the better move. Blizzard runs right in your browser.</p>
                <a href={CHESS_SITE} className="news-pill ra-news"><b>New</b><span>Blizzard Chess is out now</span></a>
              </div>
              <div className="tabs four" role="tablist">
                {SOURCES.map((x) => <button key={x.v} role="tab" aria-selected={source === x.v} onClick={() => setSource(x.v)}>{x.label}</button>)}
              </div>
              {source === 'pgn' ? (
                <div className="tab-body">
                  <textarea value={pgn} onChange={(e) => { setPgn(e.target.value); setErr(''); }} spellCheck={false} placeholder={'Paste a PGN here.\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 …'} className="ra-pgn" />
                  {err && <p className="error" role="alert">{err}</p>}
                  <button className="btn primary big wide" onClick={openPgn} disabled={!pgn.trim()}><Icon.review />Start review</button>
                </div>
              ) : (
                <div className="tab-body">
                  <form className="ra-form" onSubmit={(e) => { e.preventDefault(); load(); }}>
                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder={SOURCES.find((x) => x.v === source)!.hint} aria-label={SOURCES.find((x) => x.v === source)!.hint} autoComplete="off" />
                    <button className="btn primary" disabled={busy || !name.trim()}>Load games</button>
                  </form>
                  {err && <p className="error" role="alert">{err}</p>}
                  {busy && <p className="muted small">Loading…</p>}
                  {items && items.length > 0 && (
                    <ul className="ra-list">
                      {items.map((it) => {
                        const res = it.me === undefined ? '' : it.result === '1/2-1/2' ? 'draw' : (it.result === '1-0') === (it.me === 0) ? 'win' : 'loss';
                        return (
                          <li key={it.key}>
                            <button className="game-row" onClick={() => open(it)} disabled={busy}>
                              <span className={'res ' + res}>{it.result === '1/2-1/2' ? '½' : it.result === '1-0' ? '1–0' : '0–1'}</span>
                              <span className="players">
                                <b>{it.white}{it.wElo ? <em> {it.wElo}</em> : null}</b>
                                <span>{it.black}{it.bElo ? <em> {it.bElo}</em> : null}</span>
                              </span>
                              <span className="meta">{it.tc === 'daily' ? 'daily' : it.tc ? tcName(it.tc) : ''}<br />{it.date ? new Date(it.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : ''}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
