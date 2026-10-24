// Разбор партии: оценки позиций движком, классы ходов (лучший, ошибка, зевок…), точность, комментарий тренера.
import { E, newPos, sanOf, play, gameEnd, type MoveRec, type GameEnd } from './chess';
import type { Info } from './engine';

// оценка позиции с точки зрения белых
export interface Entry { cp: number | null; mate: number | null; best: string | null; pv: string[]; depth: number; terminal?: boolean }
export interface RMove extends MoveRec { sac: boolean; book: boolean }
export interface Cls { cls: string; loss: number; accuracy: number; before: { cp: number | null; mate: number | null }; after: { cp: number | null; mate: number | null } }

export function entryFromInfo(info: Info, side: 0 | 1): Entry | null {
  const l = info.lines && info.lines[0];
  if (!l) return null;
  const s = side === 0 ? 1 : -1;
  return {
    cp: l.cp === null || l.cp === undefined ? null : l.cp * s,
    mate: l.mate === null || l.mate === undefined ? null : l.mate * s,
    best: l.move && l.move !== '0000' ? l.move : null, pv: l.pv || [], depth: info.depth || l.depth || 0,
  };
}
export function terminalEntry(r: GameEnd): Entry {
  return { terminal: true, depth: 99, best: null, pv: [], cp: r.result === '1/2-1/2' ? 0 : null, mate: r.result === '1-0' ? 1 : r.result === '0-1' ? -1 : null };
}

// ходы партии с пометками «из книги» и «жертва»
export function buildMoves(startFen: string, ucis: string[]): { moves: RMove[]; end: GameEnd | null; error: string | null } {
  const pos = newPos(startFen), moves: RMove[] = [];
  for (const u of ucis) {
    const m = pos.uciToMove(u);
    if (!m) return { moves, end: null, error: `Illegal move ${u}` };
    const bm = pos.bookMoves();
    const book = !!(bm && bm.some((x: any) => x.m === m && x.n >= 3));
    const sac = E.isSacrifice(pos, m);
    const rec = play(pos, u)!;
    moves.push({ ...rec, sac, book });
  }
  return { moves, end: gameEnd(pos), error: null };
}

export function winPct(e: Entry | null | undefined): number | null {
  if (!e) return null;
  return E.winPercent(e.cp, e.mate);
}

// классы всех ходов по готовым оценкам (entries[i] — позиция перед ходом i)
export function classifyAll(moves: RMove[], entries: (Entry | null)[]): (Cls | null)[] {
  const out: (Cls | null)[] = [];
  for (let k = 0; k < moves.length; k++) {
    const a = entries[k], b = entries[k + 1];
    if (!a || !b) { out.push(null); continue; }
    const prev = out[k - 1];
    const prevErr = !!(prev && ['mistake', 'blunder', 'miss'].includes(prev.cls));
    const mover = moves[k].color;
    const pov = (e: Entry) => (mover === 0 ? { cp: e.cp, mate: e.mate } : { cp: e.cp === null ? null : -e.cp, mate: e.mate === null ? null : -e.mate });
    const before = pov(a), after = pov(b);
    const matedNow = !!b.terminal && after.mate !== null && after.mate > 0;
    const r = E.classifyMove({ before, after, isBest: moves[k].uci === a.best || matedNow, sacrifice: moves[k].sac, book: moves[k].book, prevErr });
    out.push({ cls: r.cls, loss: r.loss, accuracy: r.accuracy, before, after });
  }
  return out;
}

export function accuracy(entries: (Entry | null)[], firstColor: 0 | 1): { white: number | null; black: number | null } {
  const wp = entries.map(winPct);
  if (wp.length < 2 || wp.some((v) => v === null)) return { white: null, black: null };
  return E.gameAccuracy(wp, firstColor);
}

export function counts(moves: RMove[], cls: (Cls | null)[], color: 0 | 1): Record<string, number> {
  const o: Record<string, number> = {};
  moves.forEach((m, k) => { if (m.color === color && cls[k]) o[cls[k]!.cls] = (o[cls[k]!.cls] || 0) + 1; });
  return o;
}

// «+1.2», «−0.4», «M3», «−M2» — за белых
export function fmtEval(e: Entry | null | undefined, short = true): string {
  if (!e) return '…';
  if (e.mate !== null) {
    if (e.terminal) return e.mate > 0 ? '1-0' : '0-1';
    return (e.mate > 0 ? 'M' : '−M') + Math.abs(e.mate);
  }
  const v = (e.cp || 0) / 100;
  if (e.terminal && v === 0) return '½-½';
  return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(short && Math.abs(v) >= 10 ? 0 : short ? 1 : 2);
}

// примерный рейтинг игры по точности (грубая шкала, как ориентир)
export function perfRating(acc: number | null): number | null {
  if (acc === null) return null;
  const r = 400 + (acc - 40) * 45 + Math.max(0, acc - 85) * 50;
  return Math.max(250, Math.min(3000, Math.round(r / 50) * 50));
}

// комментарий тренера к ходу k
export function coachComment(k: number, moves: RMove[], entries: (Entry | null)[], c: Cls | null): { title: string; text: string[]; better: string | null } {
  const mv = moves[k];
  const text: string[] = [];
  let better: string | null = null;
  if (!c) return { title: '', text: ['Rating the move…'], better };
  const prev = entries[k], next = entries[k + 1];
  if (c.cls === 'brilliant') text.push('A sacrifice that works. The engine agrees the material is worth it.');
  else if (c.cls === 'book') text.push('A known opening move, played by strong players many times.');
  else if (c.cls === 'best') text.push(next && next.terminal && next.mate ? 'Checkmate.' : 'The move the engine would choose.');
  else if (c.cls === 'excellent') text.push('Nearly as good as the best move.');
  else if (c.cls === 'good') text.push('A reasonable move, but there was something stronger.');
  else if (c.cls === 'miss') text.push('Your opponent made a mistake, and this move doesn’t punish it.');
  else if (c.cls === 'inaccuracy') text.push('Not the most precise. It gives away part of your advantage.');
  else if (c.cls === 'mistake') text.push('This makes your position noticeably worse.');
  else if (c.cls === 'blunder') text.push('A serious error that can change the result of the game.');
  if (!['best', 'brilliant', 'book'].includes(c.cls) && prev && prev.best && prev.best !== mv.uci) {
    better = sanOf(mv.fenBefore, prev.best);
    const b = c.before, a = c.after;
    if (b.mate !== null && b.mate > 0 && !(a.mate !== null && a.mate > 0)) text.push(`There was a mate in ${b.mate}, starting with ${better}.`);
    else if (a.mate !== null && a.mate < 0 && !(b.mate !== null && b.mate < 0)) text.push(`Now the opponent has a mate in ${Math.abs(a.mate)}.`);
    else if ((c.cls === 'mistake' || c.cls === 'blunder' || c.cls === 'miss') && next && next.best) {
      const reply = next.best, rp = newPos(mv.fenAfter);
      const rs = sanOf(mv.fenAfter, reply);
      if (rp.board[E.parseSq(reply.slice(2, 4))]) text.push(`After this, ${rs} wins material.`);
      else text.push(`The strongest reply is ${rs}.`);
    }
  }
  return { title: c.cls, text, better };
}

// разобрать текст PGN или FEN, введённый игроком
export function parseInput(text: string): { startFen: string; moves: string[]; headers: Record<string, string>; result: string | null; error: string | null } {
  const t = text.trim();
  if (/^([pnbrqkPNBRQK1-8]+\/){7}[pnbrqkPNBRQK1-8]+\s+[wb]/.test(t)) {
    try { const p = newPos(t); return { startFen: p.fen(), moves: [], headers: {}, result: null, error: null }; } catch { return { startFen: '', moves: [], headers: {}, result: null, error: 'This FEN is not valid.' }; }
  }
  const r = E.parsePgn(t);
  if (r.error && !(r.moves && r.moves.length)) return { startFen: '', moves: [], headers: {}, result: null, error: r.error };
  return { startFen: r.startFen, moves: r.moves, headers: r.headers || {}, result: r.result || null, error: null };
}
