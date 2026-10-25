// Задачи: позиция после ошибки соперника, найти лучший ход (и следующие).
// Три режима: обычные (свой рейтинг задач), задача дня, на скорость (3 минуты, три ошибки — конец).
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Board from '../components/Board';
import { Icon } from '../components/icons';
import { newPos, play, parseSq, type MoveRec } from '../lib/chess';
import { useSettings, settings, makeStore } from '../lib/store';
import { playSound, soundFor } from '../lib/sound';
import { useAuth } from '../lib/auth';
import { go, useRoute } from '../lib/router';
import { puzzleStats, usePuzzleStats, recordPuzzle, adoptRemote, type Puzzle } from '../lib/puzzles';
import { award } from '../lib/achievements';
import { ref, runTransaction } from 'firebase/database';
import { db } from '../lib/firebase';
import { useSyncExternalStore } from 'react';

const THEME_LABEL: Record<string, string> = {
  mateIn1: 'Mate in 1', mateIn2: 'Mate in 2', mateIn3: 'Mate in 3', mateIn4: 'Mate in 4', advantage: 'Win an advantage', crushing: 'Win decisively',
  endgame: 'Endgame', oneMove: 'One move', short: 'Short', long: 'Long',
};

let all: Puzzle[] | null = null;
async function loadPuzzles(): Promise<Puzzle[]> {
  if (all) return all;
  const r = await fetch('puzzles.json');
  const data = await r.json();
  all = (data.puzzles as [string, string, string, number, string][]).map(([id, fen, moves, rating, themes]) => ({ id, fen, moves: moves.split(' '), rating, themes: themes ? themes.split(' ') : [] }));
  return all;
}
function pick(list: Puzzle[], rating: number, seen: Set<string>): Puzzle {
  for (const w of [120, 250, 450, 900, 5000]) {
    const c = list.filter((p) => !seen.has(p.id) && Math.abs(p.rating - rating) <= w);
    if (c.length) return c[Math.floor(Math.random() * c.length)];
  }
  return list[Math.floor(Math.random() * list.length)];
}
const today = () => new Date().toISOString().slice(0, 10);
function dailyPuzzle(list: Puzzle[]): Puzzle {
  const pool = list.filter((p) => p.rating >= 700 && p.rating <= 1400);
  const src = pool.length ? pool : list;
  let h = 0;
  for (const c of today()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return src[h % src.length];
}

// задача дня и лучший результат в задачах на скорость — в браузере
const extra = makeStore<{ daily: Record<string, boolean>; rushBest: number }>('puzzleExtra', { daily: {}, rushBest: 0 });
const useExtra = () => useSyncExternalStore(extra.subscribe, extra.get);
function dailyStreak(d: Record<string, boolean>): number {
  let n = 0;
  const t = new Date();
  for (;;) { const k = t.toISOString().slice(0, 10); if (!d[k]) break; n++; t.setDate(t.getDate() - 1); }
  return n;
}

type Mode = 'rated' | 'daily' | 'rush';
export default function Puzzles() {
  const { query } = useRoute();
  const [mode, setMode] = useState<Mode>(() => (query.get('mode') as Mode) || 'rated');
  const [list, setList] = useState<Puzzle[] | null>(null);
  const [err, setErr] = useState('');
  const { profile } = useAuth();
  useEffect(() => { adoptRemote(profile ? profile.puzzle : undefined); }, [profile]);
  useEffect(() => { loadPuzzles().then(setList, () => setErr('Couldn’t load puzzles. Check your connection and reload the page.')); }, []);
  if (err) return <div className="page narrow"><h1>Puzzles</h1><p className="error">{err}</p></div>;
  if (!list) return <div className="page narrow"><p className="muted">Loading puzzles…</p></div>;
  const tabs = (
    <div className="tabs three" role="tablist">
      {(['rated', 'daily', 'rush'] as Mode[]).map((m) => (
        <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)}>{m === 'rated' ? 'Puzzles' : m === 'daily' ? 'Daily' : 'Rush'}</button>
      ))}
    </div>
  );
  if (mode === 'daily') return <Daily list={list} tabs={tabs} />;
  if (mode === 'rush') return <Rush key="rush" list={list} tabs={tabs} />;
  return <Rated list={list} tabs={tabs} />;
}

// ---------------------------------------------------------------- решение одной задачи
type State = 'intro' | 'play' | 'wrong' | 'solved' | 'failed' | 'shown';
interface Solver { state: State; failed: boolean; hint: boolean; k: number; showSolution: () => void; useHint: () => void }

function PuzzleView({ pz, strict, idle, onSolved, onFailed, panel, header }: {
  pz: Puzzle; strict?: boolean; idle?: boolean; onSolved: (firstTry: boolean, hint: boolean) => void; onFailed?: () => void;
  panel: (s: Solver) => ReactNode; header?: ReactNode;
}) {
  const s = useSettings();
  const player = (newPos(pz.fen).side ^ 1) as 0 | 1; // ходит игрок после ошибки соперника
  const [recs, setRecs] = useState<MoveRec[]>([]);
  const [state, setState] = useState<State>('intro');
  const [failed, setFailed] = useState(false);
  const [hint, setHint] = useState(false);
  const [wrongMove, setWrongMove] = useState<{ from: number; to: number } | null>(null);
  const failedRef = useRef(false);
  const recsRef = useRef<MoveRec[]>([]);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const fenAt = (r: MoveRec[]) => (r.length ? r[r.length - 1].fenAfter : pz.fen);
  const push = (uci: string) => {
    const p = newPos(fenAt(recsRef.current));
    const rec = play(p, uci);
    if (!rec) return null;
    recsRef.current = [...recsRef.current, rec];
    setRecs(recsRef.current);
    playSound(soundFor(rec));
    return rec;
  };
  // ход соперника, с которого начинается задача
  useEffect(() => {
    if (idle) return;
    timer.current = window.setTimeout(() => { push(pz.moves[0]); setState('play'); }, strict ? 350 : 700);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const markFail = () => { if (failedRef.current) return; failedRef.current = true; setFailed(true); onFailed && onFailed(); };

  const onMove = (uci: string) => {
    if (state !== 'play' && state !== 'wrong') return;
    const k = recsRef.current.length;
    const expected = pz.moves[k];
    const p = newPos(fenAt(recsRef.current));
    const m = p.uciToMove(uci);
    if (!m) return;
    const isLast = k === pz.moves.length - 1;
    // альтернативный мат последним ходом тоже засчитывается
    let mates = false;
    if (isLast && uci !== expected) { p.make(m); mates = p.inCheck() && p.legalMoves().length === 0; }
    if (uci === expected || mates) {
      setWrongMove(null);
      push(uci);
      if (isLast) { setState('solved'); onSolved(!failedRef.current, hint); return; }
      setState('play');
      timer.current = window.setTimeout(() => { push(pz.moves[recsRef.current.length]); }, strict ? 250 : 450);
      return;
    }
    const from = m & 127, to = (m >> 7) & 127;
    setWrongMove({ from, to });
    playSound('capture');
    markFail();
    setState(strict ? 'failed' : 'wrong');
  };

  function showSolution() {
    setState('shown');
    markFail();
    setWrongMove(null);
    const step = () => {
      const k = recsRef.current.length;
      if (k >= pz.moves.length) { setState('failed'); return; }
      push(pz.moves[k]);
      timer.current = window.setTimeout(step, 650);
    };
    step();
  }

  const fen = fenAt(recs);
  const last = recs.length ? recs[recs.length - 1] : null;
  const k = recs.length;
  const hintSq = hint && k < pz.moves.length && k % 2 === 1 ? pz.moves[k].slice(0, 2) : null;
  const done = state === 'solved' || state === 'failed';

  return (
    <div className="game-layout puzzle fixed-panel">
      <div className="board-col">
        <div className="pbar puzzle-bar">
          <span className={'turn ' + (player ? 'black' : 'white')} />
          <b>{idle ? 'Puzzle Rush' : done ? (state === 'solved' ? 'Solved' : 'Puzzle failed') : state === 'intro' ? 'Your opponent moves…' : `Find the best move for ${player ? 'Black' : 'White'}`}</b>
          {header}
        </div>
        <Board resizable fen={fen} orientation={player} movable={(state === 'play' || state === 'wrong') && k % 2 === 1 ? player : null} lastMove={wrongMove || last}
          animate onMove={onMove} theme={s.theme} coords={s.showCoords} autoQueen={s.autoQueen}
          badge={(state === 'wrong' || (strict && state === 'failed')) && wrongMove ? { sq: wrongMove.to, cls: 'blunder' } : done && last && state === 'solved' ? { sq: last.to, cls: 'best' } : null}
          highlight={hintSq && !done ? parseSq(hintSq) : null} />
        <div className="pbar" />
      </div>
      <aside className="side-panel">{panel({ state, failed, hint, k, showSolution, useHint: () => setHint(true) })}</aside>
    </div>
  );
}

function SolverMsg({ st, pz }: { st: Solver; pz: Puzzle }) {
  const playerMoves = Math.ceil((pz.moves.length - 1) / 2);
  return (
    <div className={'puzzle-msg ' + st.state}>
      {st.state === 'intro' && <p>Watch your opponent’s move.</p>}
      {st.state === 'play' && <p>{st.k <= 1 ? 'Your turn. Find the strongest move.' : 'Correct. Keep going.'} <span className="muted">Move {Math.min(playerMoves, Math.floor(st.k / 2) + 1)} of {playerMoves}</span></p>}
      {st.state === 'wrong' && <p><b>That’s not it.</b> Try another move, or see the solution.</p>}
      {st.state === 'shown' && <p>Here’s the solution.</p>}
      {st.state === 'solved' && <p><b>{st.failed ? 'Solved, but not on the first try.' : 'Well done!'}</b> {st.failed ? 'The rating counts the first attempt.' : st.hint ? 'Solved with a hint.' : 'Solved on the first try.'}</p>}
      {st.state === 'failed' && <p><b>Puzzle failed.</b> Step through the solution, then try the next one.</p>}
    </div>
  );
}

// ---------------------------------------------------------------- обычные задачи с рейтингом
function Rated({ list, tabs }: { list: Puzzle[]; tabs: ReactNode }) {
  const s = useSettings();
  const stats = usePuzzleStats();
  const { user } = useAuth();
  const uid = user ? user.uid : null;
  const [pz, setPz] = useState<Puzzle | null>(null);
  const [delta, setDelta] = useState<number | null>(null);
  const next = useCallback(() => {
    const st = puzzleStats.get();
    const off = { easier: -300, normal: -100, harder: 200 }[settings.get().puzzleLevel] ?? -300;
    setDelta(null);
    setPz(pick(list, st.rating + off, new Set(st.seen)));
  }, [list]);
  useEffect(() => { if (!pz) next(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!pz) return null;
  const onSolved = (first: boolean, hint: boolean) => {
    if (first) setDelta(recordPuzzle(pz, hint ? 'hint' : 'win', uid));
    const st = puzzleStats.get();
    if (st.solved >= 50) award('puzzles50'); if (st.solved >= 500) award('puzzles500'); if (st.rating >= 1500) award('puzzle1500');
  };
  return (
    <PuzzleView key={pz.id} pz={pz} onSolved={onSolved} onFailed={() => setDelta(recordPuzzle(pz, 'fail', uid))} panel={(st) => {
      const done = st.state === 'solved' || st.state === 'failed';
      return (
        <>
          {tabs}
          <div className="seg small" role="group" aria-label="Puzzle difficulty">
            {(['easier', 'normal', 'harder'] as const).map((l) => (
              <button key={l} aria-pressed={s.puzzleLevel === l} onClick={() => settings.set({ puzzleLevel: l })}>{l === 'easier' ? 'Easier' : l === 'normal' ? 'Normal' : 'Harder'}</button>
            ))}
          </div>
          <div className="puzzle-rating">
            <span>Puzzle rating</span>
            <b>{Math.round(stats.rating)}</b>
            {delta !== null && done ? <em className={delta >= 0 ? 'up' : 'down'}>{delta >= 0 ? '+' : '−'}{Math.abs(delta)}</em> : null}
          </div>
          <SolverMsg st={st} pz={pz} />
          {done && (
            <div className="puzzle-meta">
              <span>Puzzle rating <b>{pz.rating}</b></span>
              <span>{pz.themes.map((t) => THEME_LABEL[t] || t).join(', ')}</span>
            </div>
          )}
          <div className="actions">
            {done ? (
              <>
                <button className="btn primary big" onClick={next}>Next puzzle</button>
                <button className="btn" onClick={() => go('/analysis?fen=' + encodeURIComponent(pz.fen))}><Icon.analysis />Analyse</button>
              </>
            ) : (
              <>
                <button className="btn" onClick={st.useHint} disabled={st.hint || st.state === 'intro' || st.state === 'shown'}><Icon.bulb />Hint</button>
                <button className="btn" onClick={st.showSolution} disabled={st.state === 'intro' || st.state === 'shown'}>Solution</button>
                <button className="btn ghost" onClick={next}>Skip</button>
              </>
            )}
          </div>
          <div className="history" aria-label="Recent puzzles">
            {stats.history.slice(-24).map((h, i) => <i key={i} className={h.ok ? 'ok' : 'bad'} title={`${h.rating}`} />)}
          </div>
          <p className="muted small tab-foot">{stats.solved} solved, {stats.failed} failed. {list.length} puzzles in the set, made by Blizzard from games between its bots.</p>
        </>
      );
    }} />
  );
}

// ---------------------------------------------------------------- задача дня
function Daily({ list, tabs }: { list: Puzzle[]; tabs: ReactNode }) {
  const ex = useExtra();
  const pz = useMemo(() => dailyPuzzle(list), [list]);
  const solvedToday = ex.daily[today()];
  const [run, setRun] = useState(0);
  return (
    <PuzzleView key={pz.id + run} pz={pz} onSolved={() => { extra.set({ daily: { ...extra.get().daily, [today()]: true } }); if (dailyStreak(extra.get().daily) >= 7) award('daily7'); }} panel={(st) => {
      const done = st.state === 'solved' || st.state === 'failed';
      return (
        <>
          {tabs}
          <div className="daily-head">
            <b>Puzzle of the day</b>
            <span className="muted small">{new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}. A new one every day.</span>
          </div>
          <div className="puzzle-rating"><span>Days in a row</span><b>{dailyStreak(ex.daily)}</b></div>
          <SolverMsg st={st} pz={pz} />
          {solvedToday && !done && <p className="muted small">You already solved today’s puzzle. Come back tomorrow for a new one.</p>}
          <div className="actions">
            {done ? (
              <>
                <button className="btn" onClick={() => setRun(run + 1)}>Try again</button>
                <button className="btn primary" onClick={() => go('/puzzles')}>More puzzles</button>
              </>
            ) : (
              <>
                <button className="btn" onClick={st.useHint} disabled={st.hint || st.state === 'intro' || st.state === 'shown'}><Icon.bulb />Hint</button>
                <button className="btn" onClick={st.showSolution} disabled={st.state === 'intro' || st.state === 'shown'}>Solution</button>
              </>
            )}
          </div>
        </>
      );
    }} />
  );
}

// ---------------------------------------------------------------- на скорость: 3 минуты, 3 ошибки
const RUSH_MS = 180000;
function Rush({ list, tabs }: { list: Puzzle[]; tabs: ReactNode }) {
  const ex = useExtra();
  const { profile } = useAuth();
  const [phase, setPhase] = useState<'ready' | 'run' | 'over'>('ready');
  const [score, setScore] = useState(0);
  const [strikes, setStrikes] = useState(0);
  const [pz, setPz] = useState<Puzzle | null>(null);
  const [end, setEnd] = useState(0);
  const [, setTick] = useState(0);
  const seen = useRef(new Set<string>());
  const results = useRef<boolean[]>([]);
  const nextPz = (solved: number) => {
    const target = 450 + solved * 70;
    const p = pick(list, target, seen.current);
    seen.current.add(p.id);
    setPz(p);
  };
  const start = () => {
    seen.current = new Set(); results.current = [];
    setScore(0); setStrikes(0); setEnd(Date.now() + RUSH_MS); setPhase('run'); nextPz(0);
  };
  const finish = useCallback((sc: number) => {
    setPhase('over');
    if (sc > extra.get().rushBest) extra.set({ rushBest: sc });
    if (sc >= 15) award('rush15'); if (sc >= 30) award('rush30');
    if (profile) runTransaction(ref(db, `users/${profile.uid}/rush`), (cur) => (cur === null || sc > cur ? sc : undefined)).catch(() => {});
  }, [profile]);
  useEffect(() => {
    if (phase !== 'run') return;
    const t = setInterval(() => { setTick((x) => x + 1); if (Date.now() >= end) finish(score); }, 200);
    return () => clearInterval(t);
  }, [phase, end, score, finish]);
  const left = Math.max(0, end - Date.now());
  const clock = `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`;
  const onSolved = () => {
    const sc = score + 1; results.current.push(true); setScore(sc);
    setTimeout(() => nextPz(sc), 250);
  };
  const onFailed = () => {
    const st = strikes + 1; results.current.push(false); setStrikes(st);
    if (st >= 3) { setTimeout(() => finish(score), 500); return; }
    setTimeout(() => nextPz(score), 700);
  };
  const panelTop = (
    <>
      {tabs}
      <div className="rush-head">
        <div><span>Score</span><b>{score}</b></div>
        <div><span>Time</span><b className={left < 20000 && phase === 'run' ? 'low' : ''}>{phase === 'run' ? clock : '3:00'}</b></div>
        <div><span>Mistakes</span><b className="strikes">{[0, 1, 2].map((i) => <i key={i} className={i < strikes ? 'x' : ''} />)}</b></div>
      </div>
      <div className="history">{results.current.map((r, i) => <i key={i} className={r ? 'ok' : 'bad'} />)}</div>
    </>
  );
  if (phase !== 'run' || !pz) {
    const sample = list.find((p) => p.rating < 600) || list[0];
    return (
      <PuzzleView key={'idle' + phase} pz={sample} idle onSolved={() => {}} panel={() => (
        <>
          {panelTop}
          <div className="puzzle-msg">
            {phase === 'over'
              ? <p><b>Time’s up!</b> You solved {score} {score === 1 ? 'puzzle' : 'puzzles'}.{score > 0 && score >= ex.rushBest ? ' A new personal best!' : ''}</p>
              : <p><b>Puzzle Rush.</b> Solve as many puzzles as you can in 3 minutes. They get harder as you go. Three mistakes and it’s over.</p>}
          </div>
          <div className="puzzle-rating"><span>Your best</span><b>{ex.rushBest}</b></div>
          <button className="btn primary big wide push" onClick={start}>{phase === 'over' ? 'Play again' : 'Start'}</button>
        </>
      )} />
    );
  }
  return (
    <PuzzleView key={pz.id + '-' + results.current.length} pz={pz} strict onSolved={onSolved} onFailed={onFailed} panel={(st) => (
      <>
        {panelTop}
        <SolverMsg st={st} pz={pz} />
        <button className="btn ghost" onClick={() => finish(score)}>End run</button>
      </>
    )} />
  );
}
