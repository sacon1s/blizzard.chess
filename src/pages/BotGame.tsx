// Партия с ботом Blizzard: часы, подсказка, отмена хода, ничья, сдача; после партии — разбор.
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import Board from '../components/Board';
import { PlayerBar, MoveList, NavButtons, useArrowKeys } from '../components/GameParts';
import { Icon } from '../components/icons';
import { BotAvatar } from './Bots';
import { E, START_FEN, newPos, play, gameEnd, posAt, resultText, type MoveRec, type GameEnd } from '../lib/chess';
import { bot, analyst } from '../lib/engine';
import { playSound, soundFor } from '../lib/sound';
import { BOTS, parseTc, tcLabel } from '../lib/bots';
import { useSettings, saveGame, newId } from '../lib/store';
import { go } from '../lib/router';
import { useAuth } from '../lib/auth';
import { entryFromInfo, terminalEntry, classifyOne, richMove, coachComment, type Entry, type Cls } from '../lib/review';
import ClsIcon from '../components/ClsIcon';
import { settings } from '../lib/store';

const VALUE = [0, 1, 3, 3, 5, 9, 0];
const VERDICT: Record<string, string> = {
  brilliant: 'is brilliant', best: 'is best', excellent: 'is excellent', good: 'is good', book: 'is a book move',
  inaccuracy: 'is an inaccuracy', miss: 'is a miss', mistake: 'is a mistake', blunder: 'is a blunder',
};
// сколько бот «думает», чтобы ходить по-человечески: быстро — единственный ход и дебют по книге,
// дольше — обычные ходы; с часами — не больше разумной доли оставшегося времени
function thinkTime(pos: any, uci: string | null, book: boolean, ply: number, clockLeft: number | null, inc: number): number {
  const legal = pos.legalMoves().length;
  let t: number;
  if (legal <= 1) t = 300 + Math.random() * 300;
  else if (book || ply < 4) t = 600 + Math.random() * 1000;
  else {
    t = 1000 + Math.random() * 2400;
    const m = uci ? pos.uciToMove(uci) : 0;
    if (m && ((m >> 20) & 1)) t *= 0.65; // взятие обычно очевиднее
    if (pos.inCheck()) t *= 0.8;
  }
  if (clockLeft !== null) t = Math.min(t, Math.max(120, clockLeft / 35 + inc * 0.6));
  return t;
}

export function materialDiff(fen: string): number {
  const p = newPos(fen);
  let d = 0;
  for (let sq = 0; sq < 128; sq++) { if (sq & 0x88) continue; const x = p.board[sq]; if (x) d += (x >> 3 ? -1 : 1) * VALUE[x & 7]; }
  return d;
}

export default function BotGame({ query }: { query: URLSearchParams }) {
  const level = Math.max(1, Math.min(10, +(query.get('level') || 5)));
  return <BotGameInner key={query.get('t') || 'g'} level={level} colorParam={query.get('color') || 'random'} tc={query.get('tc') || 'none'} />;
}

function BotGameInner({ level, colorParam, tc }: { level: number; colorParam: string; tc: string }) {
  const s = useSettings();
  const { user, profile } = useAuth();
  const me = profile?.name || user?.displayName || 'You';
  const botInfo = BOTS[level - 1];
  const [playerColor] = useState<0 | 1>(() => (colorParam === 'white' ? 0 : colorParam === 'black' ? 1 : Math.random() < 0.5 ? 0 : 1));
  const botColor = (playerColor ^ 1) as 0 | 1;
  const [orient, setOrient] = useState<0 | 1>(playerColor);
  const pos = useRef(newPos());
  const [moves, setMoves] = useState<MoveRec[]>([]);
  const movesRef = useRef<MoveRec[]>([]);
  const [view, setView] = useState(0);
  const [result, setResult] = useState<GameEnd | null>(null);
  const resultRef = useRef<GameEnd | null>(null);
  const [thinking, setThinking] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  // предход: ход, сделанный, пока бот думает; играется сразу после ответа бота, если он легален
  const [premove, setPremoveState] = useState<string | null>(null);
  const premoveRef = useRef<string | null>(null);
  const setPremove = (u: string | null) => { premoveRef.current = u; setPremoveState(u); };
  const [toast, setToast] = useState('');
  const gameId = useRef(newId());
  const lastBotEval = useRef(0);
  const tcCfg = useMemo(() => parseTc(tc), [tc]);
  const clocks = useRef({ t: [tcCfg ? tcCfg.base : 0, tcCfg ? tcCfg.base : 0], running: null as 0 | 1 | null, since: 0 });
  const [, tick] = useReducer((x: number) => x + 1, 0);

  const live = moves.length;
  useEffect(() => { bot().newGame(); return () => { bot().stop(); analyst().stop(); }; }, []);

  const finish = useCallback((r: GameEnd) => {
    if (resultRef.current) return;
    const c = clocks.current;
    if (c.running !== null) { c.t[c.running] -= performance.now() - c.since; c.running = null; }
    resultRef.current = r; setResult(r); setThinking(false);
    bot().stop();
    const ms = movesRef.current;
    saveGame({
      id: gameId.current, date: new Date().toISOString(), white: playerColor === 0 ? me : `Blizzard ${botInfo.name}`,
      black: playerColor === 1 ? me : `Blizzard ${botInfo.name}`, startFen: START_FEN, moves: ms.map((m) => m.uci),
      sans: ms.map((m) => m.san), result: r.result, reason: r.reason, source: 'bot', playerColor, event: `vs bot, level ${level}`,
    });
  }, [playerColor, me, botInfo.name, level]);

  const apply = useCallback((uci: string) => {
    if (resultRef.current) return false;
    const rec = play(pos.current, uci);
    if (!rec) return false;
    const c = clocks.current, now = performance.now();
    if (tcCfg) {
      if (c.running === rec.color) c.t[rec.color] -= now - c.since;
      if (movesRef.current.length >= 1) c.t[rec.color] += tcCfg.inc;
      c.running = (rec.color ^ 1) as 0 | 1; c.since = now;
    }
    movesRef.current = [...movesRef.current, rec];
    setMoves(movesRef.current);
    setView(movesRef.current.length);
    setHint(null);
    playSound(soundFor(rec));
    const end = gameEnd(pos.current);
    if (end) finish(end);
    if (coachRef.current && rec.color === playerColor) runCoach(movesRef.current.length - 1);
    return true;
  }, [tcCfg, finish]); // eslint-disable-line react-hooks/exhaustive-deps

  // тренер: оценка каждого своего хода и совет, что было лучше
  const coachRef = useRef(s.coach);
  const [note, setNote] = useState<{ k: number; c: Cls; text: string[]; better: string | null; label: string } | null>(null);
  const evals = useRef(new Map<string, Entry>());
  const coachSeq = useRef(0);
  async function evalAt(ucis: string[], fen: string): Promise<Entry | null> {
    const key = ucis.join(' ');
    const hit = evals.current.get(key);
    if (hit) return hit;
    const p = newPos(fen), end = gameEnd(p);
    let e: Entry | null;
    if (end) e = terminalEntry(end);
    else {
      const info = await analyst().go(START_FEN, ucis, { movetime: 450 });
      if (info.stopped) return null;
      e = entryFromInfo(info, p.side as 0 | 1);
    }
    if (e) evals.current.set(key, e);
    return e;
  }
  async function runCoach(k: number) {
    const seq = ++coachSeq.current;
    const ms = movesRef.current.slice(0, k + 1), rec = ms[k], ucis = ms.map((m) => m.uci);
    setNote(null);
    const before = await evalAt(ucis.slice(0, k), rec.fenBefore);
    if (seq !== coachSeq.current || !before) return;
    const after = await evalAt(ucis, rec.fenAfter);
    if (seq !== coachSeq.current || !after) return;
    const rm = richMove(rec), c = classifyOne(rm, before, after);
    const mv = [] as ReturnType<typeof richMove>[], en = [] as (Entry | null)[];
    mv[k] = rm; en[k] = before; en[k + 1] = after;
    const cc = coachComment(k, mv, en, c);
    setNote({ k, c, text: cc.text, better: cc.better, label: rec.san });
  }
  function toggleCoach() {
    const v = !coachRef.current;
    coachRef.current = v; settings.set({ coach: v });
    if (!v) { coachSeq.current++; setNote(null); }
  }

  // ход бота
  useEffect(() => {
    if (result || pos.current.side !== botColor) return;
    let cancelled = false;
    setThinking(true);
    const ply = movesRef.current.length;
    const L = E.levelLimits(level, ply);
    const limits: any = { movetime: L.movetime, multipv: L.multipv, book: L.book };
    if (L.depth) limits.depth = L.depth;
    if (tcCfg) {
      const left = clocks.current.t[botColor];
      limits.movetime = Math.max(80, Math.min(L.movetime, left / 30 + tcCfg.inc * 0.7));
    }
    const t0 = performance.now();
    bot().go(START_FEN, movesRef.current.map((m) => m.uci), limits).then((info) => {
      if (cancelled || resultRef.current) return;
      const choice = (info.book ? info.lines[0] && info.lines[0].move : E.pickMove(info, level, ply)) || (info.lines[0] && info.lines[0].move);
      if (info.lines[0]) lastBotEval.current = info.lines[0].mate !== null ? (info.lines[0].mate > 0 ? 3000 : -3000) : info.lines[0].cp || 0;
      const left = tcCfg ? clocks.current.t[botColor] - (performance.now() - clocks.current.since) : null;
      const wait = Math.max(0, thinkTime(pos.current, choice, !!info.book, ply, left, tcCfg ? tcCfg.inc : 0) - (performance.now() - t0));
      setTimeout(() => {
        if (cancelled || resultRef.current) return;
        setThinking(false);
        if (choice) apply(choice);
        const pm = premoveRef.current;
        if (pm) {
          setPremove(null);
          setTimeout(() => { if (!resultRef.current && pos.current.side === playerColor) apply(pm); }, 40);
        }
      }, wait);
    });
    return () => { cancelled = true; };
  }, [moves.length, result, botColor, level, apply, tcCfg]);

  // часы
  useEffect(() => {
    if (!tcCfg || result) return;
    const id = setInterval(() => {
      const c = clocks.current;
      if (c.running === null) return;
      if (c.t[c.running] - (performance.now() - c.since) <= 0) {
        const loser = c.running;
        c.t[loser] = 0; c.running = null;
        finish({ result: loser === 0 ? '0-1' : '1-0', reason: 'time' });
      }
      tick();
    }, 100);
    return () => clearInterval(id);
  }, [tcCfg, result, finish]);
  const clockOf = (side: 0 | 1) => {
    if (!tcCfg) return null;
    const c = clocks.current;
    return c.t[side] - (c.running === side ? performance.now() - c.since : 0);
  };

  const onView = useCallback((i: number) => setView(Math.max(0, Math.min(movesRef.current.length, i))), []);
  useArrowKeys(view, live, onView);

  function takeback() {
    if (result || !movesRef.current.length) return;
    bot().stop(); setThinking(false);
    // убрать ответ бота (если он последний) и последний ход игрока
    let n = movesRef.current.length;
    if (n && movesRef.current[n - 1].color === botColor) n--;
    if (n && movesRef.current[n - 1].color === playerColor) n--;
    movesRef.current = movesRef.current.slice(0, n);
    pos.current = posAt(START_FEN, movesRef.current.map((m) => m.uci), n);
    setMoves(movesRef.current); setView(n); setHint(null); setPremove(null);
    coachSeq.current++; setNote(null);
  }
  async function askHint() {
    if (result || pos.current.side !== playerColor) return;
    setToast('Thinking about a hint…');
    const info = await analyst().go(START_FEN, movesRef.current.map((m) => m.uci), { movetime: 900 });
    setToast('');
    if (info.lines[0]) setHint(info.lines[0].move);
  }
  function offerDraw() {
    if (result) return;
    if (movesRef.current.length >= 40 && Math.abs(lastBotEval.current) <= 60) finish({ result: '1/2-1/2', reason: 'agreement' });
    else { setToast('Blizzard declines the draw.'); setTimeout(() => setToast(''), 2500); }
  }
  function resign() {
    if (result) return;
    finish({ result: playerColor === 0 ? '0-1' : '1-0', reason: 'resign' });
  }

  const fen = view === live ? pos.current.fen() : view === 0 ? START_FEN : moves[view - 1].fenAfter;
  const last = view > 0 ? moves[view - 1] : null;
  const diff = useMemo(() => materialDiff(fen), [fen]);
  const top = (orient ^ 1) as 0 | 1, bottom = orient;
  const nameOf = (side: 0 | 1) => (side === playerColor ? me : `${botInfo.name}`);
  const subOf = (side: 0 | 1) => {
    const d = side === 0 ? diff : -diff;
    const base = side === playerColor ? (profile ? `${Math.round(profile.ratings.rapid)}` : '') : botInfo.elo;
    return [base, d > 0 ? `+${d}` : ''].filter(Boolean).join('  ');
  };
  const avatarOf = (side: 0 | 1) => (side === playerColor ? <Icon.user /> : <BotAvatar level={level} size={36} />);
  const won = result && ((result.result === '1-0' && playerColor === 0) || (result.result === '0-1' && playerColor === 1));
  const drawn = result && result.result === '1/2-1/2';

  return (
    <div className="game-layout fixed-panel">
      <div className="board-col">
        <PlayerBar color={top} name={nameOf(top)} sub={subOf(top)} avatar={avatarOf(top)} clock={clockOf(top)} running={!result && clocks.current.running === top} thinking={thinking && top === botColor} />
        <Board fen={fen} orientation={orient} movable={!result && view === live && !thinking ? playerColor : null} lastMove={last}
          premovable={!result && view === live && s.premove ? playerColor : null} premove={premove} onPremove={setPremove}
          animate onMove={(u) => apply(u)} theme={s.theme} coords={s.showCoords} autoQueen={s.autoQueen}
          arrows={hint && view === live ? [{ from: hint.slice(0, 2), to: hint.slice(2, 4), color: '#5fbf6a' }] : []} />
        <PlayerBar color={bottom} name={nameOf(bottom)} sub={subOf(bottom)} avatar={avatarOf(bottom)} clock={clockOf(bottom)} running={!result && clocks.current.running === bottom} thinking={thinking && bottom === botColor} />
      </div>
      <aside className="side-panel">
        <div className="panel-head">
          <BotAvatar level={level} size={40} />
          <div><b>vs {botInfo.name}</b><span>{botInfo.elo} · {tcLabel(tc)}</span></div>
        </div>
        {result && (
          <div className={'result-card' + (won ? ' win' : drawn ? ' draw' : ' loss')}>
            <h2>{won ? 'You won' : drawn ? 'Draw' : 'You lost'}</h2>
            <p>{resultText(result)}</p>
            <div className="row">
              <button className="btn primary" onClick={() => go('/review/' + gameId.current)}><Icon.review />Game review</button>
              <button className="btn" onClick={() => go(`/play/bot?level=${level}&color=${colorParam}&tc=${encodeURIComponent(tc)}&t=${Date.now()}`)}>Rematch</button>
              <button className="btn ghost" onClick={() => go('/bots')}>Other bot</button>
            </div>
          </div>
        )}
        {!result && (
          <div className="coach-head">
            <label className="switch small-switch"><input type="checkbox" checked={s.coach} onChange={toggleCoach} /><span />Coach</label>
          </div>
        )}
        {!result && s.coach && (
          note ? (
            <div className={'coach cls-' + note.c.cls}>
              <ClsIcon cls={note.c.cls} size={34} className="cls-icon" />
              <div>
                <b>{note.label} <em>{VERDICT[note.c.cls]}</em></b>
                <p>{note.text.join(' ')}{note.better && <> Better was <strong>{note.better}</strong>.</>}</p>
                {['mistake', 'blunder', 'miss'].includes(note.c.cls) && note.k >= moves.length - 2 && (
                  <button className="btn small-btn" onClick={takeback}><Icon.undo />Take back and try again</button>
                )}
              </div>
            </div>
          ) : (
            <div className="coach">
              <span className="coach-av"><img src="logo.svg" alt="" /></span>
              <div><b>Coach</b><p>{moves.some((m) => m.color === playerColor) ? 'Looking at your move…' : 'Make a move and I’ll tell you how good it was.'}</p></div>
            </div>
          )
        )}
        <MoveList moves={moves} view={view} onView={onView} />
        <NavButtons view={view} total={live} onView={onView} onFlip={() => setOrient((orient ^ 1) as 0 | 1)} />
        {!result && (
          <div className="actions">
            <button className="btn" onClick={askHint} disabled={pos.current.side !== playerColor}><Icon.bulb />Hint</button>
            <button className="btn" onClick={takeback} disabled={!moves.length}><Icon.undo />Takeback</button>
            <button className="btn" onClick={offerDraw}><Icon.handshake />Draw</button>
            <button className="btn danger" onClick={resign}><Icon.flag />Resign</button>
          </div>
        )}
        {toast && <p className="toast-inline">{toast}</p>}
      </aside>
    </div>
  );
}
