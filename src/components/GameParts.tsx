// Общие части экрана партии: плашка игрока с часами, список ходов, кнопки перехода по ходам, шкала оценки.
import { useEffect, useRef } from 'react';
import { Icon, MOVE_CLASS_ICONS } from './icons';
import type { MoveRec } from '../lib/chess';

export function fmtClock(ms: number): string {
  if (ms < 0) ms = 0;
  if (ms < 10000) return (ms / 1000).toFixed(1);
  const s = Math.ceil(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60);
  return h ? `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function PlayerBar(p: { name: string; sub?: string; avatar?: React.ReactNode; clock?: number | null; running?: boolean; color: 0 | 1; thinking?: boolean; captured?: string }) {
  return (
    <div className={'pbar' + (p.running ? ' on' : '')}>
      <div className={'avatar ' + (p.color ? 'black' : 'white')}>{p.avatar}</div>
      <div className="pname">
        <b>{p.name}</b>
        {p.sub && <span>{p.sub}</span>}
      </div>
      {p.thinking && <span className="thinking" aria-label="Thinking"><i /><i /><i /></span>}
      {p.clock !== null && p.clock !== undefined && <div className={'clock' + (p.running ? ' run' : '') + (p.clock < 20000 ? ' low' : '')}>{fmtClock(p.clock)}</div>}
    </div>
  );
}

export function MoveList(p: { moves: MoveRec[]; view: number; onView: (i: number) => void; classes?: (string | null)[]; startFullmove?: number; startSide?: 0 | 1 }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current && box.current.querySelector('.mv.cur') as HTMLElement | null;
    if (el && box.current) {
      const b = box.current.getBoundingClientRect(), r = el.getBoundingClientRect();
      if (r.top < b.top || r.bottom > b.bottom) box.current.scrollTop += r.top - b.top - b.height / 2;
    }
  }, [p.view, p.moves.length]);
  const rows: { n: number; w?: number; b?: number }[] = [];
  const startSide = p.startSide || 0;
  let n = p.startFullmove || 1;
  p.moves.forEach((m, i) => {
    const side = (startSide + i) & 1;
    if (side === 0 || rows.length === 0) rows.push({ n });
    const r = rows[rows.length - 1];
    if (side === 0) r.w = i; else { r.b = i; n++; }
  });
  const cell = (i?: number) => {
    if (i === undefined) return <span className="mv empty">…</span>;
    const c = p.classes ? p.classes[i] : null;
    return (
      <button className={'mv' + (p.view === i + 1 ? ' cur' : '') + (c ? ' cls-' + c : '')} onClick={() => p.onView(i + 1)}>
        {c && ['brilliant', 'best', 'inaccuracy', 'miss', 'mistake', 'blunder', 'book'].includes(c) && <i className={'mini cls-' + c}>{MOVE_CLASS_ICONS[c]}</i>}
        {p.moves[i].san}
      </button>
    );
  };
  return (
    <div className="moves" ref={box}>
      {rows.length === 0 && <p className="empty-moves">No moves yet.</p>}
      {rows.map((r) => (
        <div className="mrow" key={r.n}>
          <span className="mnum">{r.n}.</span>
          {cell(r.w)}
          {r.b !== undefined ? cell(r.b) : r.w === undefined ? cell(undefined) : <span className="mv empty" />}
        </div>
      ))}
    </div>
  );
}

export function NavButtons(p: { view: number; total: number; onView: (i: number) => void; onFlip?: () => void }) {
  return (
    <div className="navbtns">
      <button aria-label="First move" onClick={() => p.onView(0)} disabled={p.view === 0}><Icon.first /></button>
      <button aria-label="Previous move" onClick={() => p.onView(p.view - 1)} disabled={p.view === 0}><Icon.prev /></button>
      <button aria-label="Next move" onClick={() => p.onView(p.view + 1)} disabled={p.view >= p.total}><Icon.next /></button>
      <button aria-label="Last move" onClick={() => p.onView(p.total)} disabled={p.view >= p.total}><Icon.last /></button>
      {p.onFlip && <button aria-label="Flip board" onClick={p.onFlip}><Icon.flip /></button>}
    </div>
  );
}

// стрелки ← → для ходов
export function useArrowKeys(view: number, total: number, onView: (i: number) => void) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return;
      if (e.key === 'ArrowLeft') { onView(Math.max(0, view - 1)); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { onView(Math.min(total, view + 1)); e.preventDefault(); }
      else if (e.key === 'Home') onView(0);
      else if (e.key === 'End') onView(total);
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [view, total, onView]);
}

// шкала оценки: доля белых 0..100
export function EvalBar(p: { white: number; label: string; flipped: boolean }) {
  const w = Math.max(3, Math.min(97, p.white));
  return (
    <div className={'evalbar' + (p.flipped ? ' flipped' : '')} aria-label={'Evaluation ' + p.label}>
      <div className="fill" style={{ height: w + '%' }} />
      <span className={'elabel ' + (p.white >= 50 ? 'low' : 'high')}>{p.label}</span>
    </div>
  );
}
