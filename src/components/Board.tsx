// Доска: ход перетаскиванием или двумя щелчками, выбор фигуры при превращении, анимация хода,
// стрелки движка и свои пометки правой кнопкой (поле — щелчок, стрелка — протянуть; Shift/Ctrl/Alt — другой цвет).
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { pieceImgs } from '../lib/pieces';
import { useSettings } from '../lib/store';
import { newPos, targetsFrom, premoveTargets, pieceKey, sqName, parseSq } from '../lib/chess';
import ClsIcon, { CLS_LABEL } from './ClsIcon';

export interface Arrow { from: string; to: string; color: string; opacity?: number }
export interface BoardProps {
  fen: string;
  orientation: 0 | 1;
  movable?: 0 | 1 | 'both' | null; // чья сторона может ходить
  lastMove?: { from: number; to: number } | null;
  animate?: boolean;
  onMove?: (uci: string) => void;
  arrows?: Arrow[];
  badge?: { sq: number; cls: string } | null;
  theme?: string;
  coords?: boolean;
  autoQueen?: boolean;
  highlight?: number | null; // поле-подсказка
  premovable?: 0 | 1 | null; // чья сторона может делать предход, пока ходит соперник
  premoves?: string[]; // очередь предходов (как на chess.com — несколько подряд)
  onPremove?: (uci: string | null) => void; // добавить предход или (null) отменить все
}

const MARK_COLORS: Record<string, string> = { o: '#f0a33a', g: '#5fbf6a', r: '#e2534b', b: '#4aa3df' };

function rc(sq: number, o: 0 | 1) {
  const rank = sq >> 4, file = sq & 7;
  return o === 0 ? { row: 7 - rank, col: file } : { row: rank, col: 7 - file };
}
function sqAt(row: number, col: number, o: 0 | 1) {
  return o === 0 ? (7 - row) * 16 + col : row * 16 + (7 - col);
}

function arrowPoly(f: number, t: number, o: 0 | 1, color: string, opacity: number, key: string) {
  const a = rc(f, o), b = rc(t, o);
  const dr = Math.abs(a.row - b.row), dc = Math.abs(a.col - b.col);
  const knight = (dr === 1 && dc === 2) || (dr === 2 && dc === 1);
  const w = 0.15, hl = 0.42, hw = 0.26, h = w / 2;
  const fmt = (p: number[][]) => p.map((q) => q[0].toFixed(3) + ',' + q[1].toFixed(3)).join(' ');
  const x1 = a.col + 0.5, y1 = a.row + 0.5, x2 = b.col + 0.5, y2 = b.row + 0.5;
  if (!knight) {
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
    if (!len) return null;
    const ux = dx / len, uy = dy / len, px = -uy, py = ux;
    const sx = x1 + ux * 0.22, sy = y1 + uy * 0.22, bx = x2 - ux * hl, by = y2 - uy * hl;
    const pts = [[sx + px * h, sy + py * h], [bx + px * h, by + py * h], [bx + px * hw, by + py * hw], [x2, y2],
      [bx - px * hw, by - py * hw], [bx - px * h, by - py * h], [sx - px * h, sy - py * h]];
    return <polygon key={key} points={fmt(pts)} fill={color} opacity={opacity} />;
  }
  // ход коня — уголком: сначала по длинной стороне
  const cx = (Math.abs(b.row - a.row) > Math.abs(b.col - a.col) ? a.col : b.col) + 0.5;
  const cy = (Math.abs(b.row - a.row) > Math.abs(b.col - a.col) ? b.row : a.row) + 0.5;
  const u1x = Math.sign(cx - x1), u1y = Math.sign(cy - y1), u2x = Math.sign(x2 - cx), u2y = Math.sign(y2 - cy);
  const sx = x1 + u1x * 0.22, sy = y1 + u1y * 0.22, bx = x2 - u2x * hl, by = y2 - u2y * hl;
  const p1x = -u1y, p1y = u1x, p2x = -u2y, p2y = u2x;
  const turn = Math.sign(u1x * u2y - u1y * u2x);
  const oc = [cx - (p1x + p2x) * h * turn, cy - (p1y + p2y) * h * turn], ic = [cx + (p1x + p2x) * h * turn, cy + (p1y + p2y) * h * turn];
  const L = turn > 0 ? [ic, oc] : [oc, ic];
  const pts = [[sx + p1x * h, sy + p1y * h], L[0], [bx + p2x * h, by + p2y * h], [bx + p2x * hw, by + p2y * hw], [x2, y2],
    [bx - p2x * hw, by - p2y * hw], [bx - p2x * h, by - p2y * h], L[1], [sx - p1x * h, sy - p1y * h]];
  return <polygon key={key} points={fmt(pts)} fill={color} opacity={opacity} />;
}

export default function Board(p: BoardProps) {
  const o = p.orientation;
  const PIECE_IMG = pieceImgs(useSettings().pieces);
  const pos = useMemo(() => newPos(p.fen), [p.fen]);
  const [sel, setSel] = useState(-1);
  const [marks, setMarks] = useState<Map<string, string>>(new Map());
  const [markDrag, setMarkDrag] = useState<{ from: number; to: number; col: string } | null>(null);
  const [promo, setPromo] = useState<{ from: number; to: number } | null>(null);
  const [drag, setDrag] = useState<{ from: number; x: number; y: number; hover: number } | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ from: number; x: number; y: number; wasSel: boolean; moved: boolean; id: number } | null>(null);

  const side = pos.side as 0 | 1;
  const canMove = p.movable === 'both' || p.movable === side;
  const canPre = !canMove && p.premovable !== undefined && p.premovable !== null && p.premovable !== side;
  const mover = canMove ? side : canPre ? p.premovable : -1;
  const pre = p.premoves || [];
  // доска с уже поставленными предходами: фигуры показаны на новых местах
  const vb = useMemo(() => {
    const b: number[] = Array.from(pos.board as ArrayLike<number>);
    for (const u of pre) {
      const f = parseSq(u.slice(0, 2)), t = parseSq(u.slice(2, 4));
      let pc = b[f];
      if (!pc) continue;
      if ((pc & 7) === 6 && Math.abs((t & 7) - (f & 7)) === 2) { // рокировка: и ладья
        const rf = (t & 7) === 6 ? f + 3 : f - 4, rt = (t & 7) === 6 ? f + 1 : f - 1;
        b[rt] = b[rf]; b[rf] = 0;
      }
      if ((pc & 7) === 1 && ((t >> 4) === 7 || (t >> 4) === 0)) pc = (pc & 8) | 5;
      b[f] = 0; b[t] = pc;
    }
    return b;
  }, [pos, pre.join(' ')]); // eslint-disable-line react-hooks/exhaustive-deps
  const vpos = useMemo(() => ({ board: vb, castle: pos.castle }), [vb, pos]);
  const targets = useMemo(() => (sel < 0 ? new Map() : canMove ? targetsFrom(pos, sel) : canPre ? premoveTargets(vpos, sel) : new Map()), [pos, vpos, sel, canMove, canPre]);
  // новая позиция — снять пометки; выбранную фигуру оставить, если ею можно ходить и сейчас (например, предход прервал ответ соперника)
  useEffect(() => {
    setPromo(null); setMarks(new Map());
    setSel((v) => (v >= 0 && vb[v] && (vb[v] >> 3) === mover ? v : -1));
  }, [p.fen]); // eslint-disable-line react-hooks/exhaustive-deps

  // новая позиция — снять выделение и пометки

  // анимация хода: фигура «едет» с поля from на поле to
  useLayoutEffect(() => {
    if (!p.animate || !p.lastMove || !boardRef.current) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const el = boardRef.current.querySelector(`[data-sq="${p.lastMove.to}"] .pc`) as HTMLElement | null;
    if (!el) return;
    const a = rc(p.lastMove.from, o), b = rc(p.lastMove.to, o);
    el.style.transition = 'none';
    el.style.transform = `translate(${(a.col - b.col) * 100}%, ${(a.row - b.row) * 100}%)`;
    el.style.zIndex = '5';
    void el.offsetWidth;
    el.style.transition = 'transform 180ms cubic-bezier(.3,.7,.3,1)';
    el.style.transform = '';
    const t = setTimeout(() => { el.style.zIndex = ''; el.style.transition = ''; }, 200);
    return () => clearTimeout(t);
  }, [p.fen]); // eslint-disable-line react-hooks/exhaustive-deps

  function sqFromPoint(x: number, y: number) {
    const r = boardRef.current!.getBoundingClientRect();
    if (x < r.left || y < r.top || x >= r.right || y >= r.bottom) return -1;
    const s = r.width / 8;
    return sqAt(Math.floor((y - r.top) / s), Math.floor((x - r.left) / s), o);
  }
  function tryMove(from: number, to: number) {
    const t = targets.get(to) || (canMove ? targetsFrom(pos, from).get(to) : canPre ? premoveTargets(vpos, from).get(to) : undefined);
    if (!t) return false;
    if (canPre) { p.onPremove && p.onPremove(sqName(from) + sqName(to) + (t.promo ? 'q' : '')); setSel(-1); return true; }
    if (t.promo) {
      if (p.autoQueen) { p.onMove && p.onMove(sqName(from) + sqName(to) + 'q'); setSel(-1); return true; }
      setPromo({ from, to }); return true;
    }
    setSel(-1);
    p.onMove && p.onMove(sqName(from) + sqName(to));
    return true;
  }

  function onPointerDown(e: React.PointerEvent) {
    const sq = sqFromPoint(e.clientX, e.clientY);
    if (sq < 0) return;
    if (e.button === 2) {
      if (pre.length && p.onPremove) p.onPremove(null);
      e.preventDefault();
      const col = e.shiftKey ? 'g' : (e.ctrlKey || e.metaKey) ? 'r' : e.altKey ? 'b' : 'o';
      setMarkDrag({ from: sq, to: sq, col });
      try { boardRef.current!.setPointerCapture(e.pointerId); } catch { /* */ }
      return;
    }
    if (e.button !== 0) return;
    if (marks.size) setMarks(new Map());
    setPromo(null);
    if (!canMove && !canPre) return;
    const piece = canPre ? vb[sq] : pos.board[sq];
    if (sel >= 0 && sq !== sel && targets.has(sq)) { e.preventDefault(); tryMove(sel, sq); return; }
    if (piece && (piece >> 3) === mover) {
      e.preventDefault();
      const wasSel = sel === sq;
      if (!wasSel) setSel(sq);
      dragStart.current = { from: sq, x: e.clientX, y: e.clientY, wasSel, moved: false, id: e.pointerId };
      try { boardRef.current!.setPointerCapture(e.pointerId); } catch { /* */ }
    } else { setSel(-1); if (canPre && pre.length && p.onPremove) p.onPremove(null); }
  }
  function onPointerMove(e: React.PointerEvent) {
    if (markDrag) {
      const sq = sqFromPoint(e.clientX, e.clientY);
      if (sq !== markDrag.to) setMarkDrag({ ...markDrag, to: sq });
      return;
    }
    const d = dragStart.current;
    if (!d || e.pointerId !== d.id) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) d.moved = true;
    if (d.moved) setDrag({ from: d.from, x: e.clientX, y: e.clientY, hover: sqFromPoint(e.clientX, e.clientY) });
  }
  function onPointerUp(e: React.PointerEvent) {
    if (markDrag && e.button === 2) {
      const sq = sqFromPoint(e.clientX, e.clientY);
      const key = sq < 0 || sq === markDrag.from ? String(markDrag.from) : markDrag.from + '-' + sq;
      const m = new Map(marks);
      if (m.get(key) === markDrag.col) m.delete(key); else m.set(key, markDrag.col);
      setMarks(m); setMarkDrag(null);
      return;
    }
    const d = dragStart.current;
    if (!d || e.pointerId !== d.id) return;
    dragStart.current = null;
    setDrag(null);
    const sq = sqFromPoint(e.clientX, e.clientY);
    if (d.moved) { if (sq >= 0 && sq !== d.from) tryMove(d.from, sq); }
    else if (d.wasSel && sq === d.from) setSel(-1);
  }

  const checkSq = pos.inCheck() ? pos.kingSq[side] : -1;
  const squares = [];
  for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
    const sq = sqAt(row, col, o), piece = pre.length ? vb[sq] : pos.board[sq];
    const light = ((sq >> 4) + (sq & 7)) & 1;
    const t = targets.get(sq);
    const cls = ['sq', light ? 'l' : 'd'];
    if (p.lastMove && (sq === p.lastMove.from || sq === p.lastMove.to)) cls.push('last');
    if (sq === sel) cls.push('sel');
    if (pre.length && pre.some((u) => sqName(sq) === u.slice(0, 2) || sqName(sq) === u.slice(2, 4))) cls.push('pre');
    if (sq === checkSq) cls.push('check');
    if (p.highlight === sq) cls.push('hint');
    if (t) cls.push(t.capture || piece ? 'cap' : 'target');
    if (drag && drag.hover === sq && t) cls.push('hover');
    const mark = marks.get(String(sq));
    squares.push(
      <div key={sq} className={cls.join(' ')} data-sq={sq}>
        {mark && <i className="mark" style={{ background: MARK_COLORS[mark] }} />}
        {p.coords !== false && col === 0 && <span className="coord r">{(sq >> 4) + 1}</span>}
        {p.coords !== false && row === 7 && <span className="coord f">{'abcdefgh'[sq & 7]}</span>}
        {piece ? <div className={'pc' + (drag && drag.from === sq ? ' dragging' : '')} style={{ backgroundImage: `url("${PIECE_IMG[pieceKey(piece)]}")` }} /> : null}
        {p.badge && p.badge.sq === sq && <span className="badge" title={CLS_LABEL[p.badge.cls]}><ClsIcon cls={p.badge.cls} size="100%" ring /></span>}
      </div>,
    );
  }

  const arrowEls = [];
  for (const [k, col] of marks) if (k.includes('-')) { const [f, t] = k.split('-').map(Number); arrowEls.push(arrowPoly(f, t, o, MARK_COLORS[col], 0.82, 'm' + k)); }
  if (markDrag && markDrag.to >= 0 && markDrag.to !== markDrag.from) arrowEls.push(arrowPoly(markDrag.from, markDrag.to, o, MARK_COLORS[markDrag.col], 0.6, 'md'));
  (p.arrows || []).forEach((a, i) => arrowEls.push(arrowPoly(parseSq(a.from), parseSq(a.to), o, a.color, a.opacity ?? 0.85, 'a' + i)));

  const promoSide = promo ? side : 0;
  const promoEl = promo && (() => {
    const { row, col } = rc(promo.to, o);
    const down = row === 0;
    const order = ['q', 'n', 'r', 'b'];
    return (
      <div className="promo" style={{ left: `${col * 12.5}%`, top: down ? 0 : `${(row - 3) * 12.5}%` }}>
        {(down ? order : order.slice().reverse()).map((t) => (
          <button key={t} aria-label={{ q: 'Queen', n: 'Knight', r: 'Rook', b: 'Bishop' }[t]}
            style={{ backgroundImage: `url("${PIECE_IMG[(promoSide ? 'b' : 'w') + t.toUpperCase()]}")` }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); const pr = promo; setPromo(null); setSel(-1); p.onMove && p.onMove(sqName(pr.from) + sqName(pr.to) + t); }} />
        ))}
      </div>
    );
  })();

  const ghostSize = boardRef.current ? boardRef.current.getBoundingClientRect().width / 8 : 0;
  const dragPiece = drag ? (pre.length ? vb[drag.from] : pos.board[drag.from]) : 0;
  return (
    <div className="board" data-theme={p.theme || 'snow'} ref={boardRef}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
      onPointerCancel={() => { dragStart.current = null; setDrag(null); setMarkDrag(null); }}
      onContextMenu={(e) => e.preventDefault()}>
      {squares}
      <svg className="arrows" viewBox="0 0 8 8" aria-hidden="true">{arrowEls}</svg>
      {promoEl}
      {drag && dragPiece ? <div className="drag-ghost" style={{ width: ghostSize, height: ghostSize, left: drag.x, top: drag.y, backgroundImage: `url("${PIECE_IMG[pieceKey(dragPiece)]}")` }} /> : null}
    </div>
  );
}
