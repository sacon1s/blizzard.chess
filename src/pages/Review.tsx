// Разбор партии: движок оценивает каждую позицию, ходы получают оценки, тренер объясняет ошибки.
import { useCallback, useEffect, useMemo, useState } from 'react';
import Board from '../components/Board';
import { MoveList, NavButtons, useArrowKeys, EvalBar, PlayerBar } from '../components/GameParts';
import { Icon } from '../components/icons';
import ClsSvg, { CLS_LABEL as MOVE_CLASS_LABELS } from '../components/ClsIcon';
import { newPos, moveNumber, toPgn, REASONS } from '../lib/chess';
import { analyst } from '../lib/engine';
import { buildMoves, entryFromInfo, terminalEntry, classifyAll, accuracy, counts, fmtEval, winPct, coachComment, parseInput, perfRating, type Entry, type Cls } from '../lib/review';
import { useSettings, savedGames, getGame, saveGame, newId, cacheGet, cacheSet, type SavedGame } from '../lib/store';
import { playSound, soundFor } from '../lib/sound';
import { go } from '../lib/router';

export default function Review({ id }: { id?: string }) {
  if (!id) return <ReviewHome />;
  const g = getGame(id);
  if (!g) {
    return (
      <div className="page narrow">
        <h1>Game not found</h1>
        <p className="muted">Reviews are kept in this browser. This game isn’t here, so paste its PGN instead.</p>
        <button className="btn primary" onClick={() => go('/review')}>Review a game</button>
      </div>
    );
  }
  return <ReviewGame key={id} game={g} />;
}

function ReviewHome() {
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const games = savedGames();
  function start() {
    const r = parseInput(text);
    if (r.error) { setErr(r.error); return; }
    if (!r.moves.length) { setErr('No moves found. Paste a PGN with moves, or open a FEN in Analysis.'); return; }
    const b = buildMoves(r.startFen, r.moves);
    if (b.error) { setErr(b.error); return; }
    const h = r.headers;
    const g: SavedGame = {
      id: newId(), date: new Date().toISOString(), white: h.White || 'White', black: h.Black || 'Black', startFen: r.startFen,
      moves: r.moves, sans: b.moves.map((m) => m.san), result: (b.end && b.end.result) || r.result || '*', reason: b.end ? b.end.reason : '',
      source: 'import', event: h.Event,
    };
    saveGame(g);
    go('/review/' + g.id);
  }
  return (
    <div className="page">
      <header className="page-head">
        <h1>Game review</h1>
        <p>The engine rates every move, finds your mistakes and shows what was better.</p>
      </header>
      <div className="review-home">
        <section className="import">
          <label htmlFor="pgn" className="label">Paste a PGN</label>
          <textarea id="pgn" value={text} onChange={(e) => { setText(e.target.value); setErr(''); }} spellCheck={false}
            placeholder={'1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 …\n\nGames from chess.com and lichess work too.'} />
          {err && <p className="error" role="alert">{err}</p>}
          <button className="btn primary big" onClick={start} disabled={!text.trim()}><Icon.review />Start review</button>
        </section>
        <section className="recent">
          <h2 className="label">Your recent games</h2>
          {games.length === 0 ? (
            <div className="empty">
              <p>Games you finish here appear in this list.</p>
              <button className="btn" onClick={() => go('/bots')}><Icon.bot />Play a bot</button>
            </div>
          ) : (
            <ul className="game-list">
              {games.map((g) => <GameRow key={g.id} g={g} />)}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

export function GameRow({ g }: { g: SavedGame }) {
  const me = g.playerColor;
  const res = g.result === '1/2-1/2' ? 'draw' : me === undefined ? '' : (g.result === '1-0') === (me === 0) ? 'win' : g.result === '*' ? '' : 'loss';
  const d = new Date(g.date);
  return (
    <li>
      <a href={'#/review/' + g.id} className="game-row">
        <span className={'res ' + res}>{g.result === '1/2-1/2' ? '½' : g.result === '1-0' ? '1–0' : g.result === '0-1' ? '0–1' : '*'}</span>
        <span className="players"><b>{g.white}</b><span>{g.black}</span></span>
        <span className="meta">{Math.ceil(g.moves.length / 2)} moves<br />{d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
      </a>
    </li>
  );
}

const VERDICT: Record<string, string> = {
  brilliant: 'is brilliant', best: 'is best', excellent: 'is excellent', good: 'is good', book: 'is a book move',
  inaccuracy: 'is an inaccuracy', miss: 'is a miss', mistake: 'is a mistake', blunder: 'is a blunder',
};
const ORDER = ['brilliant', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'miss', 'mistake', 'blunder'];

function ReviewGame({ game }: { game: SavedGame }) {
  const s = useSettings();
  const built = useMemo(() => buildMoves(game.startFen, game.moves), [game]);
  const moves = built.moves, N = moves.length;
  const fens = useMemo(() => [game.startFen, ...moves.map((m) => m.fenAfter)], [moves, game.startFen]);
  const firstColor = newPos(game.startFen).side as 0 | 1;
  const cacheKey = 'rev.' + game.id + '.' + N;
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
  const accOf = (side: 0 | 1) => (side === 0 ? acc.white : acc.black);

  function copyPgn() {
    const pgn = toPgn({ white: game.white, black: game.black, startFen: game.startFen, sans: moves.map((m) => m.san), result: game.result, date: game.date.slice(0, 10), event: game.event });
    navigator.clipboard.writeText(pgn).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }, () => {});
  }

  return (
    <div className="game-layout review fixed-panel">
      <div className="board-col with-eval">
        <EvalBar white={wp === null ? 50 : wp} label={fmtEval(e)} flipped={orient === 1} />
        <div className="board-stack">
          <PlayerBar color={top} name={nameOf(top)} sub={accOf(top) !== null ? `Accuracy ${accOf(top)!.toFixed(1)}` : ''} avatar={<Icon.user />} />
          <Board fen={fens[view]} orientation={orient} movable={null} lastMove={last} animate theme={s.theme} coords={s.showCoords}
            arrows={arrows} badge={last && c ? { sq: last.to, cls: c.cls } : null} />
          <PlayerBar color={bottom} name={nameOf(bottom)} sub={accOf(bottom) !== null ? `Accuracy ${accOf(bottom)!.toFixed(1)}` : ''} avatar={<Icon.user />} />
        </div>
      </div>
      <aside className="side-panel">
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'review'} onClick={() => setTab('review')}>Review</button>
          <button role="tab" aria-selected={tab === 'moves'} onClick={() => setTab('moves')}>Moves</button>
        </div>
        <div className={'progress' + (complete ? ' done' : '')} aria-label="Analysis progress">
          <span>{complete ? 'Analysed by Blizzard 0.9' : `Analysing move ${Math.max(0, done - 1)} of ${N}`}</span>
          <i style={{ width: (100 * done / (N + 1)).toFixed(1) + '%' }} />
        </div>
        <Coach k={view - 1} moves={moves} entries={entries} c={c} result={game.result} reason={game.reason} total={N} />
        {tab === 'review' ? (
          <>
            <EvalGraph entries={entries} cls={cls} view={view} onView={onView} />
            <Summary game={game} acc={acc} moves={moves} cls={cls} complete={complete} />
          </>
        ) : (
          <MoveList moves={moves} view={view} onView={onView} classes={cls.map((x) => (x ? x.cls : null))}
            startFullmove={newPos(game.startFen).fullmove} startSide={firstColor} />
        )}
        <NavButtons view={view} total={N} onView={onView} onFlip={() => setOrient((orient ^ 1) as 0 | 1)} />
        <div className="actions">
          <button className="btn" aria-pressed={showBest} onClick={() => setShowBest(!showBest)}><Icon.bulb />Best move</button>
          <button className="btn" onClick={() => go('/analysis?fen=' + encodeURIComponent(fens[view]))}><Icon.analysis />Analyse</button>
          <button className="btn" onClick={copyPgn}><Icon.copy />{copied ? 'Copied' : 'PGN'}</button>
        </div>
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

function Summary({ game, acc, moves, cls, complete }: { game: SavedGame; acc: { white: number | null; black: number | null }; moves: ReturnType<typeof buildMoves>['moves']; cls: (Cls | null)[]; complete: boolean }) {
  const cw = counts(moves, cls, 0), cb = counts(moves, cls, 1);
  const fmt = (a: number | null) => (a === null ? '–' : a.toFixed(1));
  return (
    <div className="summary">
      <div className="acc-row">
        <div className="acc white"><span>{game.white}</span><b>{fmt(acc.white)}</b></div>
        <span className="acc-label">Accuracy</span>
        <div className="acc black"><span>{game.black}</span><b>{fmt(acc.black)}</b></div>
      </div>
      {complete && moves.length >= 20 && (
        <div className="acc-row perf">
          <b>{perfRating(acc.white) ?? '–'}</b><span className="acc-label">Game rating</span><b>{perfRating(acc.black) ?? '–'}</b>
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
