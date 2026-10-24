// Задачи: позиция после ошибки соперника, найти лучший ход (и следующие). Рейтинг задач у игрока свой.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Board from '../components/Board';
import { Icon } from '../components/icons';
import { newPos, play, parseSq, type MoveRec } from '../lib/chess';
import { useSettings } from '../lib/store';
import { playSound, soundFor } from '../lib/sound';
import { useAuth } from '../lib/auth';
import { go } from '../lib/router';
import { puzzleStats, usePuzzleStats, recordPuzzle, adoptRemote, type Puzzle } from '../lib/puzzles';

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

export default function Puzzles() {
  const [list, setList] = useState<Puzzle[] | null>(null);
  const [err, setErr] = useState('');
  const [pz, setPz] = useState<Puzzle | null>(null);
  const stats = usePuzzleStats();
  const { profile } = useAuth();
  useEffect(() => { adoptRemote(profile ? profile.puzzle : undefined); }, [profile]);
  useEffect(() => { loadPuzzles().then(setList, () => setErr('Couldn’t load puzzles. Check your connection and reload the page.')); }, []);
  const next = useCallback(() => {
    if (!list) return;
    const st = puzzleStats.get();
    setPz(pick(list, st.rating, new Set(st.seen)));
  }, [list]);
  useEffect(() => { if (list && !pz) next(); }, [list]); // eslint-disable-line react-hooks/exhaustive-deps
  if (err) return <div className="page narrow"><h1>Puzzles</h1><p className="error">{err}</p></div>;
  if (!list || !pz) return <div className="page narrow"><p className="muted">Loading puzzles…</p></div>;
  return <PuzzleBoard key={pz.id} pz={pz} rating={stats.rating} onNext={next} total={list.length} />;
}

type State = 'intro' | 'play' | 'wrong' | 'solved' | 'failed' | 'shown';

function PuzzleBoard({ pz, rating, onNext, total }: { pz: Puzzle; rating: number; onNext: () => void; total: number }) {
  const s = useSettings();
  const { user } = useAuth();
  const stats = usePuzzleStats();
  const player = (newPos(pz.fen).side ^ 1) as 0 | 1; // ходит игрок после ошибки соперника
  const [recs, setRecs] = useState<MoveRec[]>([]);
  const [state, setState] = useState<State>('intro');
  const [failed, setFailed] = useState(false);
  const [hint, setHint] = useState(false);
  const [delta, setDelta] = useState<number | null>(null);
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
    timer.current = window.setTimeout(() => { push(pz.moves[0]); setState('play'); }, 700);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const uid = user ? user.uid : null;
  const markFail = () => { if (failedRef.current) return; failedRef.current = true; setFailed(true); setDelta(recordPuzzle(pz, 'fail', uid)); };
  const solved = () => { if (!failedRef.current) setDelta(recordPuzzle(pz, hint ? 'hint' : 'win', uid)); setState('solved'); };

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
      if (isLast) { solved(); return; }
      setState('play');
      timer.current = window.setTimeout(() => {
        push(pz.moves[recsRef.current.length]);
      }, 450);
      return;
    }
    // ошибка: показать ход и вернуть
    const from = m & 127, to = (m >> 7) & 127;
    setWrongMove({ from, to });
    markFail();
    setState('wrong');
    playSound('capture');
  };

  function showSolution() {
    setState('shown');
    const step = () => {
      const k = recsRef.current.length;
      if (k >= pz.moves.length) { setState('failed'); return; }
      push(pz.moves[k]);
      timer.current = window.setTimeout(step, 650);
    };
    markFail();
    setWrongMove(null);
    // вернуть позицию к началу хода игрока, если там стоял неверный ход
    step();
  }

  const fen = fenAt(recs);
  const last = recs.length ? recs[recs.length - 1] : null;
  const k = recs.length;
  const hintSq = hint && k < pz.moves.length && k % 2 === 1 ? pz.moves[k].slice(0, 2) : null;
  const done = state === 'solved' || state === 'failed';
  const shownDelta = delta;
  const playerMoves = Math.ceil((pz.moves.length - 1) / 2);
  const solvedSteps = Math.floor(k / 2);

  return (
    <div className="game-layout puzzle">
      <div className="board-col">
        <div className="pbar puzzle-bar">
          <span className={'turn ' + (player ? 'black' : 'white')} />
          <b>{done ? (state === 'solved' ? 'Solved' : 'Puzzle failed') : state === 'intro' ? 'Your opponent moves…' : `Find the best move for ${player ? 'Black' : 'White'}`}</b>
        </div>
        <Board fen={fen} orientation={player} movable={(state === 'play' || state === 'wrong') && k % 2 === 1 ? player : null} lastMove={wrongMove || last}
          animate onMove={onMove} theme={s.theme} coords={s.showCoords} autoQueen={s.autoQueen}
          badge={state === 'wrong' && wrongMove ? { sq: wrongMove.to, cls: 'blunder' } : done && last && state === 'solved' ? { sq: last.to, cls: 'best' } : null} highlight={hintSq && !done ? parseSq(hintSq) : null} />
      </div>
      <aside className="side-panel">
        <div className="puzzle-rating">
          <span>Puzzle rating</span>
          <b>{Math.round(rating)}</b>
          {shownDelta !== null && shownDelta !== undefined && done ? <em className={shownDelta >= 0 ? 'up' : 'down'}>{shownDelta >= 0 ? '+' : '−'}{Math.abs(shownDelta)}</em> : null}
        </div>
        <div className={'puzzle-msg ' + state}>
          {state === 'intro' && <p>Watch your opponent’s move.</p>}
          {state === 'play' && <p>{k <= 1 ? 'Your turn. Find the strongest move.' : 'Correct. Keep going.'} <span className="muted">Move {Math.min(playerMoves, solvedSteps + 1)} of {playerMoves}</span></p>}
          {state === 'wrong' && <p><b>That’s not it.</b> Try another move, or see the solution.</p>}
          {state === 'shown' && <p>Here’s the solution.</p>}
          {state === 'solved' && <p><b>{failed ? 'Solved, but not on the first try.' : 'Well done!'}</b> {failed ? 'The rating counts the first attempt.' : hint ? 'Solved with a hint, so your rating doesn’t change.' : 'Solved on the first try.'}</p>}
          {state === 'failed' && <p><b>Puzzle failed.</b> Step through the solution, then try the next one.</p>}
        </div>
        {done && (
          <div className="puzzle-meta">
            <span>Puzzle rating <b>{pz.rating}</b></span>
            <span>{pz.themes.map((t) => THEME_LABEL[t] || t).join(', ')}</span>
          </div>
        )}
        <div className="actions">
          {done ? (
            <>
              <button className="btn primary big" onClick={onNext}>Next puzzle</button>
              <button className="btn" onClick={() => go('/analysis?fen=' + encodeURIComponent(pz.fen))}><Icon.analysis />Analyse</button>
            </>
          ) : (
            <>
              <button className="btn" onClick={() => setHint(true)} disabled={hint || state === 'intro' || state === 'shown'}><Icon.bulb />Hint</button>
              <button className="btn" onClick={showSolution} disabled={state === 'intro' || state === 'shown'}>Solution</button>
              <button className="btn ghost" onClick={onNext}>Skip</button>
            </>
          )}
        </div>
        <div className="history" aria-label="Recent puzzles">
          {stats.history.slice(-24).map((h, i) => <i key={i} className={h.ok ? 'ok' : 'bad'} title={`${h.rating}`} />)}
        </div>
        <p className="muted small">{stats.solved} solved, {stats.failed} failed. {total} puzzles in the set, made by Blizzard from real games between its bots.</p>
      </aside>
    </div>
  );
}

