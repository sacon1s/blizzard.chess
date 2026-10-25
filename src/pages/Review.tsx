// Разбор партии (открывается из профиля или после партии): движок оценивает каждую позицию, ходы получают оценки, тренер объясняет ошибки.
import { useCallback, useEffect, useMemo, useState } from 'react';
import Board from '../components/Board';
import { MoveList, NavButtons, useArrowKeys, EvalBar, PlayerBar } from '../components/GameParts';
import { Icon } from '../components/icons';
import ClsSvg, { CLS_LABEL as MOVE_CLASS_LABELS } from '../components/ClsIcon';
import { E, START_FEN, newPos, moveNumber, toPgn, REASONS } from '../lib/chess';
import { ref, get } from 'firebase/database';
import { db } from '../lib/firebase';
import { useAuth, uidByName } from '../lib/auth';
import { PlayerAvatar } from '../components/Avatar';
import { award } from '../lib/achievements';
import { analyst } from '../lib/engine';
import { buildMoves, entryFromInfo, terminalEntry, classifyAll, accuracy, counts, fmtEval, winPct, coachComment, gameRatings, type Entry, type Cls } from '../lib/review';
import { useSettings, getGame, cacheGet, cacheSet, type SavedGame } from '../lib/store';
import { playSound, soundFor } from '../lib/sound';
import { go } from '../lib/router';

export default function Review({ id }: { id?: string }) {
  const { user } = useAuth();
  const [g, setG] = useState<SavedGame | null | undefined>(() => (id ? getGame(id) || undefined : null));
  useEffect(() => {
    if (!id) { go('/'); return; }
    const local = getGame(id);
    if (local) { setG(local); return; }
    // партия онлайн из профиля: берём из базы
    let alive = true;
    setG(undefined);
    get(ref(db, 'games/' + id)).then((snap) => {
      if (!alive) return;
      if (!snap.exists()) { setG(null); return; }
      const v = snap.val();
      if (v.status === 'started' || v.status === 'open') { go('/game/' + id); return; }
      if (v.status !== 'over' || !v.moves) { setG(null); return; }
      const ms: string[] = v.moves.split(' ');
      const b = buildMoves(START_FEN, ms);
      const color = user && v.white === user.uid ? 0 : user && v.black === user.uid ? 1 : undefined;
      setG({
        id, date: new Date(v.created || Date.now()).toISOString(), white: v.wName || 'White', black: v.bName || 'Black', startFen: START_FEN,
        moves: ms, sans: b.moves.map((m) => m.san), result: v.result || '*', reason: v.reason || '', source: 'online', playerColor: color,
        event: `${v.rated ? 'Rated' : 'Casual'} game`, wUid: v.white, bUid: v.black, speed: v.speed,
      });
    }, () => alive && setG(null));
    return () => { alive = false; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!id) return null;
  if (g === undefined) return <div className="page narrow"><p className="muted">Loading the game…</p></div>;
  if (g === null) {
    return (
      <div className="page narrow">
        <h1>Game not found</h1>
        <p className="muted">This game doesn’t exist or hasn’t finished yet.</p>
        <button className="btn primary" onClick={() => go('/')}>Play</button>
      </div>
    );
  }
  if (g.id !== id) return <div className="page narrow"><p className="muted">Loading the game…</p></div>;
  return <ReviewGame key={g.id} game={g} />;
}

const VERDICT: Record<string, string> = {
  brilliant: 'is brilliant', best: 'is best', excellent: 'is excellent', good: 'is good', book: 'is a book move',
  inaccuracy: 'is an inaccuracy', miss: 'is a miss', mistake: 'is a mistake', blunder: 'is a blunder',
};
const ORDER = ['brilliant', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'miss', 'mistake', 'blunder'];

// onBack и analyseUrl — для отдельной страницы разбора на сайте движка
export function ReviewGame({ game, onBack, analyseUrl }: { game: SavedGame; onBack?: () => void; analyseUrl?: (fen: string) => string }) {
  const s = useSettings();
  const built = useMemo(() => buildMoves(game.startFen, game.moves), [game]);
  const moves = built.moves, N = moves.length;
  const fens = useMemo(() => [game.startFen, ...moves.map((m) => m.fenAfter)], [moves, game.startFen]);
  const firstColor = newPos(game.startFen).side as 0 | 1;
  const cacheKey = 'rev.' + game.id + '.' + N;
  const [retry, setRetry] = useState(false);
  const [entries, setEntries] = useState<(Entry | null)[]>(() => {
    const c = cacheGet<(Entry | null)[]>(cacheKey);
    return c && c.length === N + 1 ? c : Array(N + 1).fill(null);
  });
  const [view, setView] = useState(0);
  const [orient, setOrient] = useState<0 | 1>(game.playerColor ?? 0);
  const [tab, setTab] = useState<'review' | 'moves'>('review');
  const [showBest, setShowBest] = useState(true);
  const [copied, setCopied] = useState(false);

  // оценка позиций по очереди; готовое сохраняется в браузере
  useEffect(() => {
    let cancelled = false;
    const eng = analyst();
    const cur = entries.slice();
    (async () => {
      for (let i = 0; i <= N; i++) {
        if (cancelled) return;
        if (cur[i]) continue;
        if (i === N && built.end) { cur[i] = terminalEntry(built.end); setEntries(cur.slice()); continue; }
        const side = newPos(fens[i]).side as 0 | 1;
        const info = await eng.go(game.startFen, game.moves.slice(0, i), { movetime: N > 120 ? 300 : 500 });
        if (cancelled) return;
        cur[i] = entryFromInfo(info, side) || { cp: 0, mate: null, best: null, pv: [], depth: 0 };
        setEntries(cur.slice());
      }
      cacheSet(cacheKey, cur);
    })();
    return () => { cancelled = true; eng.stop(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const done = entries.filter(Boolean).length;
  const complete = done === N + 1;
  const cls = useMemo(() => classifyAll(moves, entries), [moves, entries]);
  const mistakes = useMemo(() => cls.map((c, k) => (c && ['mistake', 'blunder', 'miss'].includes(c.cls) && (game.playerColor === undefined || moves[k].color === game.playerColor) && entries[k] && entries[k]!.best ? k : -1)).filter((k) => k >= 0), [cls, moves, entries, game.playerColor]);
  useEffect(() => {
    if (complete && game.playerColor !== undefined && cls.some((c, k) => c && c.cls === 'brilliant' && moves[k].color === game.playerColor)) award('brilliant');
  }, [complete]); // eslint-disable-line react-hooks/exhaustive-deps
  const acc = useMemo(() => (complete ? accuracy(entries, firstColor) : { white: null, black: null }), [complete, entries, firstColor]);

  const onView = useCallback((i: number) => {
    const j = Math.max(0, Math.min(N, i));
    setView((v) => { if (j === v + 1 && moves[j - 1]) playSound(soundFor(moves[j - 1])); return j; });
  }, [N, moves]);
  useArrowKeys(view, N, onView);

  const e = entries[view];
  const wp = winPct(e);
  const last = view > 0 ? moves[view - 1] : null;
  const c = view > 0 ? cls[view - 1] : null;
  const arrows = [];
  if (showBest && e && e.best) arrows.push({ from: e.best.slice(0, 2), to: e.best.slice(2, 4), color: '#4aa3df', opacity: 0.7 });
  const top = (orient ^ 1) as 0 | 1, bottom = orient;
  const nameOf = (side: 0 | 1) => (side === 0 ? game.white : game.black);
  // игроки Blizzard Chess: uid из партии, а у старых сохранённых партий — по нику (ники уникальны)
  const [uids, setUids] = useState<[string | undefined, string | undefined]>([game.wUid, game.bUid]);
  useEffect(() => {
    if (game.source === 'import' || (uids[0] && uids[1])) return;
    let alive = true;
    const look = (n: string) => (/^[A-Za-z0-9_-]{2,20}$/.test(n) ? uidByName(n).catch(() => null) : Promise.resolve(null));
    Promise.all([uids[0] ? uids[0] : look(game.white), uids[1] ? uids[1] : look(game.black)]).then(([w, b]) => { if (alive) setUids([w || undefined, b || undefined]); });
    return () => { alive = false; };
  }, [game.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const barOf = (side: 0 | 1, place: 'top' | 'bottom') => (
    <PlayerBar color={side} name={nameOf(side)} sub={accOf(side) !== null ? `Accuracy ${accOf(side)!.toFixed(1)}` : ''}
      avatar={uids[side] ? <PlayerAvatar uid={uids[side]} /> : <Icon.user />} uid={uids[side]} speed={game.speed} place={place} />
  );
  const accOf = (side: 0 | 1) => (side === 0 ? acc.white : acc.black);

  function copyPgn() {
    const pgn = toPgn({ white: game.white, black: game.black, startFen: game.startFen, sans: moves.map((m) => m.san), result: game.result, date: game.date.slice(0, 10), event: game.event });
    navigator.clipboard.writeText(pgn).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }, () => {});
  }

  if (retry) return <RetryMistakes game={game} moves={moves} entries={entries} list={mistakes} onExit={() => setRetry(false)} />;
  return (
    <div className="game-layout review fixed-panel">
      <div className="board-col with-eval">
        <EvalBar white={wp === null ? 50 : wp} label={fmtEval(e)} flipped={orient === 1} />
        <div className="board-stack">
          {barOf(top, 'top')}
          <Board resizable fen={fens[view]} orientation={orient} movable={null} lastMove={last} animate theme={s.theme} coords={s.showCoords}
            arrows={arrows} badge={last && c ? { sq: last.to, cls: c.cls } : null} />
          {barOf(bottom, 'bottom')}
        </div>
      </div>
      <aside className="side-panel">
        {onBack && <button className="back-link as-btn" onClick={onBack}>← Back to games</button>}
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'review'} onClick={() => setTab('review')}>Review</button>
          <button role="tab" aria-selected={tab === 'moves'} onClick={() => setTab('moves')}>Moves</button>
        </div>
        <div className={'progress' + (complete ? ' done' : '')} aria-label="Analysis progress">
          <span>{complete ? `Analysed by Blizzard ${E.VERSION || ''}` : `Analysing move ${Math.max(0, done - 1)} of ${N}`}</span>
          <i style={{ width: (100 * done / (N + 1)).toFixed(1) + '%' }} />
        </div>
        <Coach k={view - 1} moves={moves} entries={entries} c={c} result={game.result} reason={game.reason} total={N} />
        {tab === 'review' ? (
          <>
            <EvalGraph entries={entries} cls={cls} view={view} onView={onView} />
            <Summary game={game} acc={acc} moves={moves} cls={cls} complete={complete} ratings={complete ? gameRatings(moves, entries) : null} />
          </>
        ) : (
          <MoveList moves={moves} view={view} onView={onView} classes={cls.map((x) => (x ? x.cls : null))}
            startFullmove={newPos(game.startFen).fullmove} startSide={firstColor} />
        )}
        <NavButtons view={view} total={N} onView={onView} onFlip={() => setOrient((orient ^ 1) as 0 | 1)} />
        <div className="actions">
          <button className="btn" aria-pressed={showBest} onClick={() => setShowBest(!showBest)}><Icon.bulb />Best move</button>
          <button className="btn" onClick={() => (analyseUrl ? window.open(analyseUrl(fens[view]), '_blank') : go('/analysis?fen=' + encodeURIComponent(fens[view])))}><Icon.analysis />Analyse</button>
          <button className="btn" onClick={copyPgn}><Icon.copy />{copied ? 'Copied' : 'PGN'}</button>
        </div>
        {complete && mistakes.length > 0 && <button className="btn primary wide" onClick={() => setRetry(true)}>Retry your mistakes ({mistakes.length})</button>}
      </aside>
    </div>
  );
}

function ClsIcon({ cls }: { cls: string }) {
  return <ClsSvg cls={cls} size={34} className="cls-icon" />;
}

function Coach({ k, moves, entries, c, result, reason, total }: { k: number; moves: ReturnType<typeof buildMoves>['moves']; entries: (Entry | null)[]; c: Cls | null; result: string; reason: string; total: number }) {
  if (k < 0) {
    return (
      <div className="coach">
        <span className="coach-av"><img src="logo.svg" alt="" /></span>
        <div><b>Let’s look at this game</b><p>Step through it with the arrow keys or click a move. Each move gets a rating.</p></div>
      </div>
    );
  }
  const mv = moves[k];
  const cc = coachComment(k, moves, entries, c);
  const end = k === total - 1 && result !== '*' ? `${REASONS[reason] || 'Game over'}, ${result === '1/2-1/2' ? '½–½' : result.replace('-', '–')}.` : '';
  return (
    <div className={'coach' + (c ? ' cls-' + c.cls : '')}>
      {c ? <ClsIcon cls={c.cls} /> : <span className="coach-av"><img src="logo.svg" alt="" /></span>}
      <div>
        <b>{moveNumber(mv.fenBefore)} {mv.san}{c ? <em> {VERDICT[c.cls]}</em> : null}</b>
        <p>{cc.text.join(' ')}{cc.better && <> Better was <strong>{cc.better}</strong>.</>} {end && <strong>{end}</strong>}</p>
        {mv.opening && <p className="opening">{mv.opening}</p>}
      </div>
    </div>
  );
}

function EvalGraph({ entries, cls, view, onView }: { entries: (Entry | null)[]; cls: (Cls | null)[]; view: number; onView: (i: number) => void }) {
  const n = entries.length, W = 300, H = 72;
  if (n < 2) return null;
  const x = (i: number) => (i / (n - 1)) * W;
  const y = (i: number) => { const w = winPct(entries[i]); return H - ((w === null ? 50 : w) / 100) * H; };
  let d = `M0,${H}`;
  for (let i = 0; i < n; i++) d += ` L${x(i).toFixed(1)},${y(i).toFixed(1)}`;
  d += ` L${W},${H} Z`;
  const dots = cls.map((c, k) => (c && ['blunder', 'mistake', 'miss', 'brilliant'].includes(c.cls) ? <circle key={k} cx={x(k + 1)} cy={y(k + 1)} r={3.2} className={'dot cls-' + c.cls} /> : null));
  return (
    <svg className="graph" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Evaluation graph"
      onClick={(ev) => { const r = (ev.currentTarget as SVGSVGElement).getBoundingClientRect(); onView(Math.round(((ev.clientX - r.left) / r.width) * (n - 1))); }}>
      <rect width={W} height={H} className="bg" />
      <path d={d} className="area" />
      <line x1={0} x2={W} y1={H / 2} y2={H / 2} className="mid" />
      <line x1={x(view)} x2={x(view)} y1={0} y2={H} className="cur" />
      {dots}
    </svg>
  );
}

function Summary({ game, acc, moves, cls, complete, ratings }: { game: SavedGame; acc: { white: number | null; black: number | null }; moves: ReturnType<typeof buildMoves>['moves']; cls: (Cls | null)[]; complete: boolean; ratings: { white: number | null; black: number | null } | null }) {
  const cw = counts(moves, cls, 0), cb = counts(moves, cls, 1);
  const fmt = (a: number | null) => (a === null ? '–' : a.toFixed(1));
  return (
    <div className="summary">
      <div className="acc-row">
        <div className="acc white"><span>{game.white}</span><b>{fmt(acc.white)}</b></div>
        <span className="acc-label">Accuracy</span>
        <div className="acc black"><span>{game.black}</span><b>{fmt(acc.black)}</b></div>
      </div>
      {complete && ratings && (ratings.white !== null || ratings.black !== null) && (
        <div className="acc-row perf">
          <b>{ratings.white ?? '–'}</b><span className="acc-label">Game rating</span><b>{ratings.black ?? '–'}</b>
        </div>
      )}
      <table className="counts">
        <tbody>
          {ORDER.map((k) => (
            <tr key={k} className={'cls-' + k}>
              <td className="n">{cw[k] || 0}</td>
              <th scope="row"><ClsIcon cls={k} />{MOVE_CLASS_LABELS[k]}</th>
              <td className="n">{cb[k] || 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// работа над ошибками: позиция перед своей ошибкой — найти ход лучше
function RetryMistakes({ game, moves, entries, list, onExit }: { game: SavedGame; moves: ReturnType<typeof buildMoves>['moves']; entries: (Entry | null)[]; list: number[]; onExit: () => void }) {
  const s = useSettings();
  const [i, setI] = useState(0);
  const [state, setState] = useState<'play' | 'checking' | 'right' | 'wrong' | 'answer' | 'shown'>('play');
  const [tried, setTried] = useState<string | null>(null);
  const [found, setFound] = useState(0);
  const k = list[i];
  const mv = moves[k];
  const before = entries[k]!;
  const color = mv.color;
  const [fen, setFen] = useState(mv.fenBefore);
  useEffect(() => { setFen(moves[list[i]].fenBefore); setState('play'); setTried(null); }, [i]); // eslint-disable-line react-hooks/exhaustive-deps
  const winOf = (e: Entry) => { const w = winPct(e) ?? 50; return color === 0 ? w : 100 - w; };
  async function onMove(uci: string) {
    if (state !== 'play' && state !== 'wrong') return;
    const p = newPos(mv.fenBefore); const m = p.uciToMove(uci); if (!m) return;
    const san = p.moveToSan(m); p.make(m);
    setFen(p.fen()); setTried(san);
    playSound(soundFor({ check: p.inCheck(), castle: false, capture: false }));
    if (uci === before.best) { setState('right'); setFound((x) => x + 1); return; }
    if (uci === mv.uci) { setState('wrong'); return; }
    setState('checking');
    const info = await analyst().go(game.startFen, [...game.moves.slice(0, k), uci], { movetime: 600 });
    const after = entryFromInfo(info, (color ^ 1) as 0 | 1);
    const loss = after ? winOf(before) - winOf(after) : 100;
    if (loss < 5) { setState('right'); setFound((x) => x + 1); } else setState('wrong');
  }
  const bestSan = before.best ? (() => { const p = newPos(mv.fenBefore); const m = p.uciToMove(before.best); return m ? p.moveToSan(m) : before.best; })() : '';
  const last = i === list.length - 1;
  const next = () => { if (last) setState('shown'); else setI(i + 1); };
  const arrows = state === 'answer' && before.best ? [{ from: before.best.slice(0, 2), to: before.best.slice(2, 4), color: '#4fae5a' }] : [];
  return (
    <div className="game-layout review fixed-panel">
      <div className="board-col">
        <div className="pbar puzzle-bar"><span className={'turn ' + (color ? 'black' : 'white')} /><b>Find a better move for {color ? 'Black' : 'White'}</b></div>
        <Board resizable fen={fen} orientation={color} movable={state === 'play' || state === 'wrong' ? color : null} lastMove={null} animate onMove={(u) => { if (state === 'wrong') { setFen(mv.fenBefore); setState('play'); setTimeout(() => onMove(u), 0); } else onMove(u); }}
          theme={s.theme} coords={s.showCoords} autoQueen={s.autoQueen} arrows={arrows}
          badge={null} />
        <div className="pbar" />
      </div>
      <aside className="side-panel">
        <div className="puzzle-rating"><span>Mistake {i + 1} of {list.length}</span><b>{found} found</b></div>
        <div className={'puzzle-msg ' + (state === 'right' ? 'solved' : state === 'wrong' ? 'wrong' : '')}>
          <p>In the game you played <b>{moveNumber(mv.fenBefore)} {mv.san}</b>. Find something better.</p>
          {state === 'checking' && <p className="muted">Checking {tried}…</p>}
          {state === 'right' && <p><b>Yes!</b> {tried} is {tried === bestSan ? 'the best move' : 'a good move too'}{tried !== bestSan ? `. The engine’s choice was ${bestSan}.` : '.'}</p>}
          {state === 'wrong' && <p><b>{tried === mv.san ? 'That’s the move from the game.' : `${tried} isn’t better.`}</b> Try again or see the answer.</p>}
          {state === 'answer' && <p>The best move here was <b>{bestSan}</b>.</p>}
        </div>
        <div className="actions">
          {state === 'right' || state === 'answer' ? <button className="btn primary" onClick={next}>{last ? 'Finish' : 'Next mistake'}</button> : (
            <>
              <button className="btn" onClick={() => { setFen(mv.fenBefore); setState('answer'); }} disabled={state === 'checking'}>Show answer</button>
              <button className="btn ghost" onClick={next}>{last ? 'Finish' : 'Skip'}</button>
            </>
          )}
        </div>
        {state === 'shown' && <p className="muted">Done: you found {found} of {list.length}.</p>}
        <button className="btn ghost push" onClick={onExit}>Back to the review</button>
      </aside>
    </div>
  );
}
