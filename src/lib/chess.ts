// Правила и нотация — из движка Blizzard (engine/engine.js, загружается обычным скриптом до приложения).
// Поля в кодировке 0x88: sq = горизонталь * 16 + вертикаль; фигуры: 1–6 белые (P N B R Q K), 9–14 чёрные.
/* eslint-disable @typescript-eslint/no-explicit-any */
export const E: any = (window as any).Blizzard;
export const START_FEN: string = E.START_FEN;

export type Color = 0 | 1;
export type Pos = any;

export interface MoveRec {
  uci: string;
  san: string;
  from: number;
  to: number;
  color: Color;
  capture: boolean;
  castle: boolean;
  check: boolean;
  fenBefore: string;
  fenAfter: string;
  opening: string | null;
}

export interface GameEnd { result: '1-0' | '0-1' | '1/2-1/2'; reason: string }

export const REASONS: Record<string, string> = {
  checkmate: 'Checkmate', stalemate: 'Stalemate', repetition: 'Threefold repetition', fifty: 'Fifty-move rule',
  material: 'Insufficient material', resign: 'Resignation', agreement: 'Draw by agreement', time: 'Time out',
  abandon: 'A player left the game', timevsmaterial: 'Time out vs insufficient material',
};

export function newPos(fen: string = START_FEN): Pos {
  const p = new E.Position();
  p.setFen(fen);
  return p;
}

export const sqName = (sq: number): string => E.sqName(sq);
export const parseSq = (s: string): number => E.parseSq(s);
export const pieceKey = (p: number): string => (p >> 3 ? 'b' : 'w') + ' PNBRQK'[p & 7];

// легальные ходы фигуры с поля from: поле → есть ли превращение
export function targetsFrom(pos: Pos, from: number): Map<number, { promo: boolean; capture: boolean }> {
  const out = new Map<number, { promo: boolean; capture: boolean }>();
  if (from < 0) return out;
  for (const m of pos.legalMoves() as number[]) {
    if ((m & 127) !== from) continue;
    const to = (m >> 7) & 127;
    out.set(to, { promo: ((m >> 14) & 7) > 0, capture: ((m >> 20) & 1) === 1 });
  }
  return out;
}

// сделать ход (uci) в позиции pos; возвращает запись хода или null, если ход нелегален
export function play(pos: Pos, uci: string): MoveRec | null {
  const m = pos.uciToMove(uci);
  if (!m) return null;
  const fenBefore = pos.fen();
  const rec: MoveRec = {
    uci: pos.moveToUci(m), san: pos.moveToSan(m), from: m & 127, to: (m >> 7) & 127, color: pos.side,
    capture: ((m >> 20) & 1) === 1, castle: ((m >> 17) & 7) === 3, check: false, fenBefore, fenAfter: '', opening: null,
  };
  pos.make(m);
  rec.check = pos.inCheck();
  rec.fenAfter = pos.fen();
  try { rec.opening = pos.openingName ? pos.openingName() : null; } catch { rec.opening = null; }
  return rec;
}

export function gameEnd(pos: Pos): GameEnd | null {
  const r = pos.gameResult();
  return r ? { result: r.result, reason: r.reason } : null;
}

// позиция после первых k ходов партии
export function posAt(startFen: string, moves: string[], k: number): Pos {
  const p = newPos(startFen);
  for (let i = 0; i < k && i < moves.length; i++) p.make(p.uciToMove(moves[i]));
  return p;
}

export function sanOf(fen: string, uci: string): string {
  const p = newPos(fen), m = p.uciToMove(uci);
  return m ? p.moveToSan(m) : uci;
}

export function moveNumber(fen: string): string {
  const parts = fen.split(' ');
  return parts[5] + (parts[1] === 'w' ? '.' : '…');
}

export function resultText(r: GameEnd | null): string {
  if (!r) return '';
  return `${REASONS[r.reason] || 'Game over'} · ${r.result === '1/2-1/2' ? '½–½' : r.result}`;
}

export function toPgn(o: { white: string; black: string; startFen: string; sans: string[]; result: string; date?: string; event?: string }): string {
  const h = [`[Event "${o.event || 'Casual game'}"]`, `[Site "Blizzard Chess"]`, `[Date "${(o.date || new Date().toISOString().slice(0, 10)).replace(/-/g, '.')}"]`,
    `[White "${o.white}"]`, `[Black "${o.black}"]`, `[Result "${o.result}"]`];
  if (o.startFen !== START_FEN) h.push(`[SetUp "1"]`, `[FEN "${o.startFen}"]`);
  const p = newPos(o.startFen);
  let num = p.fullmove, side = p.side, body = '';
  o.sans.forEach((san, i) => {
    if (side === 0) body += `${num}. `; else if (i === 0) body += `${num}... `;
    body += san + ' ';
    if (side === 1) num++;
    side ^= 1;
  });
  return h.join('\n') + '\n\n' + (body + o.result).trim() + '\n';
}
