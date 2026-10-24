// Уроки для новичков: как ходят фигуры (собери звёзды), мат в один ход, простые тактические приёмы.
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import Board from '../components/Board';
import { Icon } from '../components/icons';
import { newPos, play, sqName, parseSq, premoveTargets } from '../lib/chess';
import { useSettings, makeStore } from '../lib/store';
import { pieceImgs } from '../lib/pieces';
import { playSound } from '../lib/sound';
import { award } from '../lib/achievements';
import { go, useRoute } from '../lib/router';

type Lesson =
  | { id: string; kind: 'stars'; title: string; text: string; piece: string; from: string; stars: string[] }
  | { id: string; kind: 'mate'; title: string; text: string; fen: string }
  | { id: string; kind: 'tactic'; title: string; text: string; fen: string; answer: string[]; after: string };

const CHAPTERS: { title: string; about: string; lessons: Lesson[] }[] = [
  {
    title: 'The pieces', about: 'How each piece moves. Collect all the stars.',
    lessons: [
      { id: 'rook', kind: 'stars', title: 'The rook', text: 'The rook moves in straight lines: up, down, left and right, as far as it likes.', piece: 'R', from: 'a1', stars: ['a5', 'e5', 'e8', 'h8'] },
      { id: 'bishop', kind: 'stars', title: 'The bishop', text: 'The bishop moves diagonally and always stays on squares of one colour.', piece: 'B', from: 'c1', stars: ['e3', 'g5', 'd8', 'a5'] },
      { id: 'queen', kind: 'stars', title: 'The queen', text: 'The queen moves like a rook and a bishop together. It’s the strongest piece.', piece: 'Q', from: 'd1', stars: ['d5', 'a8', 'h1'] },
      { id: 'knight', kind: 'stars', title: 'The knight', text: 'The knight jumps in an L shape: two squares one way and one to the side. It can jump over pieces.', piece: 'N', from: 'b1', stars: ['c3', 'e4', 'f6', 'h7'] },
      { id: 'king', kind: 'stars', title: 'The king', text: 'The king moves one square in any direction. Keep it safe: if it can’t escape an attack, the game is lost.', piece: 'K', from: 'e1', stars: ['e2', 'f3', 'g4', 'h5'] },
      { id: 'pawn', kind: 'stars', title: 'The pawn', text: 'The pawn moves straight forward one square, or two on its first move. On the last row it becomes a queen.', piece: 'P', from: 'e2', stars: ['e4', 'e5', 'e6', 'e7', 'e8'] },
    ],
  },
  {
    title: 'Checkmate in one', about: 'Attack the king so it has no escape. Find the mating move.',
    lessons: [
      { id: 'm1', kind: 'mate', title: 'Back rank', text: 'The black king is stuck behind its own pawns.', fen: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1' },
      { id: 'm2', kind: 'mate', title: 'Queen and king', text: 'Your king guards the escape squares. The queen delivers mate.', fen: '7k/8/6K1/8/8/8/8/1Q6 w - - 0 1' },
      { id: 'm3', kind: 'mate', title: 'Two rooks', text: 'One rook cuts off a row, the other gives mate.', fen: 'k7/7R/8/8/8/8/8/K5R1 w - - 0 1' },
      { id: 'm4', kind: 'mate', title: 'Rook and king', text: 'Your king takes away the squares in front of the black king.', fen: 'k7/8/1K6/8/8/8/8/7R w - - 0 1' },
      { id: 'm5', kind: 'mate', title: 'Smothered mate', text: 'The black king is surrounded by its own pieces. Only a knight can reach it.', fen: '6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1' },
      { id: 'm6', kind: 'mate', title: 'The weak f7 square', text: 'Early in the game f7 is defended only by the king.', fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4' },
    ],
  },
  {
    title: 'Tactics', about: 'Short tricks that win material. Find the move.',
    lessons: [
      { id: 't1', kind: 'tactic', title: 'Knight fork', text: 'A fork attacks two pieces at once. Find a knight move that attacks the king and the rook.', fen: 'r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1', answer: ['d5c7'], after: 'Nc7+ attacks the king and the rook. The king has to move, and you take the rook.' },
      { id: 't2', kind: 'tactic', title: 'Pawn fork', text: 'Pawns can fork too. Attack both black pieces with one pawn move.', fen: '8/8/2n1b3/8/3P4/8/8/4K2k w - - 0 1', answer: ['d4d5'], after: 'd5 attacks the knight and the bishop. One of them will be lost.' },
      { id: 't3', kind: 'tactic', title: 'Pin', text: 'A pin attacks a piece that can’t move because a more valuable piece stands behind it.', fen: '4k3/8/2n5/8/8/8/8/4KB2 w - - 0 1', answer: ['f1b5'], after: 'Bb5 pins the knight: it can’t move, or the king would be in check.' },
      { id: 't4', kind: 'tactic', title: 'Skewer', text: 'A skewer attacks a valuable piece; when it moves away, the piece behind it falls.', fen: '3q4/8/8/3k4/8/8/8/R3K3 w - - 0 1', answer: ['a1d1'], after: 'Rd1+ checks the king. When it steps aside, Rxd8 takes the queen.' },
      { id: 't5', kind: 'tactic', title: 'Discovered check', text: 'Move one piece out of the way so another one gives check, and attack something at the same time.', fen: '4k3/8/8/1q6/8/8/4N3/4R1K1 w - - 0 1', answer: ['e2c3'], after: 'Nc3 uncovers check from the rook and attacks the queen. Black must deal with the check, and the queen is lost.' },
    ],
  },
];
const ALL = CHAPTERS.flatMap((c) => c.lessons);

const progress = makeStore<{ done: Record<string, number> }>('lessons', { done: {} });
const useProgress = () => useSyncExternalStore(progress.subscribe, progress.get);
function complete(id: string) {
  const done = { ...progress.get().done, [id]: Date.now() };
  progress.set({ done });
  if (ALL.every((l) => done[l.id])) award('lessons');
}

export default function Learn() {
  const { parts } = useRoute();
  const id = parts[1];
  const lesson = ALL.find((l) => l.id === id);
  if (lesson) return <LessonView key={lesson.id} lesson={lesson} />;
  return <LessonList />;
}

function LessonList() {
  const p = useProgress();
  return (
    <div className="page learn">
      <header className="page-head"><h1>Learn</h1><p>Short lessons for beginners: how the pieces move, how to checkmate and a few tricks that win games.</p></header>
      {CHAPTERS.map((c) => (
        <section key={c.title} className="chapter">
          <h2>{c.title}</h2>
          <p className="muted">{c.about}</p>
          <div className="lesson-grid">
            {c.lessons.map((l) => (
              <a key={l.id} href={'#/learn/' + l.id} className={'lesson-card' + (p.done[l.id] ? ' done' : '')}>
                <b>{l.title}</b>
                <span>{p.done[l.id] ? 'Done ✓' : 'Start'}</span>
              </a>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function nextLesson(id: string): Lesson | null {
  const i = ALL.findIndex((l) => l.id === id);
  return ALL[i + 1] || null;
}

function LessonView({ lesson }: { lesson: Lesson }) {
  const [done, setDone] = useState(false);
  const next = nextLesson(lesson.id);
  const finish = () => { setDone(true); complete(lesson.id); };
  const panel = (msg: React.ReactNode) => (
    <aside className="side-panel">
      <a href="#/learn" className="back-link">← All lessons</a>
      <h2 className="lesson-title">{lesson.title}</h2>
      <p>{lesson.text}</p>
      {msg}
      {done && (
        <div className="actions">
          {next ? <button className="btn primary big" onClick={() => go('/learn/' + next.id)}>Next: {next.title}</button> : <button className="btn primary big" onClick={() => go('/learn')}>All lessons done!</button>}
        </div>
      )}
    </aside>
  );
  if (lesson.kind === 'stars') return <StarsLesson lesson={lesson} done={done} onDone={finish} panel={panel} />;
  return <FenLesson lesson={lesson} done={done} onDone={finish} panel={panel} />;
}

// «собери звёзды»: одна фигура на пустой доске
function StarsLesson({ lesson, done, onDone, panel }: { lesson: Extract<Lesson, { kind: 'stars' }>; done: boolean; onDone: () => void; panel: (m: React.ReactNode) => React.ReactNode }) {
  const s = useSettings();
  const [at, setAt] = useState(parseSq(lesson.from));
  const [piece, setPiece] = useState(lesson.piece);
  const [stars, setStars] = useState<Set<number>>(() => new Set(lesson.stars.map(parseSq)));
  const [sel, setSel] = useState(false);
  const [movesMade, setMoves] = useState(0);
  const [first, setFirst] = useState(true);
  const fake = useMemo(() => {
    const b = Array(128).fill(0);
    const code = { P: 1, N: 2, B: 3, R: 4, Q: 5, K: 6 }[piece] || 1;
    b[at] = code;
    return { board: b, castle: 0 };
  }, [at, piece]);
  const targets = useMemo(() => {
    const t = premoveTargets(fake, at);
    if (piece === 'P') { // пешка без взятий: только вперёд; на два поля — только первым ходом
      const out = new Map<number, unknown>();
      if (!((at + 16) & 0x88)) out.set(at + 16, true);
      if (first && (at >> 4) === 1) out.set(at + 32, true);
      return out;
    }
    return t;
  }, [fake, at, piece, first]);
  const img = pieceImgs(s.pieces);
  const click = (sq: number) => {
    if (done) return;
    if (sq === at) { setSel(!sel); return; }
    if (!sel || !targets.has(sq)) return;
    setAt(sq); setSel(false); setMoves(movesMade + 1); setFirst(false);
    playSound('move');
    if (piece === 'P' && (sq >> 4) === 7) setPiece('Q');
    if (stars.has(sq)) {
      const n = new Set(stars); n.delete(sq); setStars(n);
      if (n.size === 0) onDone();
    }
  };
  const cells = [];
  for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
    const sq = (7 - row) * 16 + col;
    const light = ((sq >> 4) + (sq & 7)) & 1;
    const cls = ['sq', light ? 'l' : 'd'];
    if (sel && sq === at) cls.push('sel');
    if (sel && targets.has(sq)) cls.push('target');
    cells.push(
      <div key={sq} className={cls.join(' ')} onClick={() => click(sq)}>
        {stars.has(sq) && <span className="star">★</span>}
        {sq === at && <div className="pc" style={{ backgroundImage: `url("${img['w' + piece]}")` }} />}
        {col === 0 && s.showCoords && <span className="coord r">{(sq >> 4) + 1}</span>}
        {row === 7 && s.showCoords && <span className="coord f">{'abcdefgh'[sq & 7]}</span>}
      </div>,
    );
  }
  return (
    <div className="game-layout lesson">
      <div className="board-col">
        <div className="board" data-theme={s.theme}>{cells}</div>
      </div>
      {panel(<p className={'puzzle-msg ' + (done ? 'solved' : '')}>{done ? <><b>Well done!</b> All stars collected in {movesMade} moves.</> : <>Click the piece, then a highlighted square. Stars left: <b>{stars.size}</b>.</>}</p>)}
    </div>
  );
}

// мат в один ход и тактика: позиция и правильный ход
function FenLesson({ lesson, done, onDone, panel }: { lesson: Extract<Lesson, { kind: 'mate' | 'tactic' }>; done: boolean; onDone: () => void; panel: (m: React.ReactNode) => React.ReactNode }) {
  const s = useSettings();
  const [fen, setFen] = useState(lesson.fen);
  const [last, setLast] = useState<{ from: number; to: number } | null>(null);
  const [wrong, setWrong] = useState(false);
  useEffect(() => { setFen(lesson.fen); }, [lesson.fen]);
  const onMove = (uci: string) => {
    const p = newPos(lesson.fen);
    const rec = play(p, uci);
    if (!rec) return;
    const mate = p.inCheck() && p.legalMoves().length === 0;
    const ok = lesson.kind === 'mate' ? mate : lesson.answer.includes(rec.uci);
    if (ok) { setFen(rec.fenAfter); setLast(rec); setWrong(false); playSound(rec.check ? 'check' : rec.capture ? 'capture' : 'move'); onDone(); }
    else { setWrong(true); playSound('capture'); }
  };
  const side = newPos(lesson.fen).side as 0 | 1;
  const msg = done
    ? <p className="puzzle-msg solved"><b>{lesson.kind === 'mate' ? 'Checkmate!' : 'Correct!'}</b> {lesson.kind === 'tactic' ? lesson.after : ''}</p>
    : wrong ? <p className="puzzle-msg wrong"><b>Not this one.</b> Try again.</p>
      : <p className="puzzle-msg">{lesson.kind === 'mate' ? `${side ? 'Black' : 'White'} to move and checkmate.` : `${side ? 'Black' : 'White'} to move.`}</p>;
  return (
    <div className="game-layout lesson">
      <div className="board-col">
        <Board fen={fen} orientation={side} movable={done ? null : side} lastMove={last} animate onMove={onMove} theme={s.theme} coords={s.showCoords} autoQueen />
      </div>
      {panel(<>{msg}{!done && <button className="btn ghost" onClick={() => { setFen(lesson.fen); setWrong(false); }}><Icon.undo />Reset</button>}</>)}
    </div>
  );
}

export { sqName };
