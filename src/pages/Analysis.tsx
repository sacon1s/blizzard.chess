// Анализ: свободная доска, ходы за обе стороны, движок показывает три лучших продолжения.
import { useCallback, useEffect, useMemo, useState } from 'react';
import Board from '../components/Board';
import { MoveList, NavButtons, useArrowKeys, EvalBar } from '../components/GameParts';
import { Icon } from '../components/icons';
import { E, START_FEN, newPos, play, type MoveRec } from '../lib/chess';
import { analyst, fmtScore, type Info } from '../lib/engine';
import { winPct, parseInput } from '../lib/review';
import { useSettings } from '../lib/store';
import { playSound, soundFor } from '../lib/sound';

function pvSan(fen: string, pv: string[], max = 10): string[] {
  const p = newPos(fen), out: string[] = [];
  for (const u of pv.slice(0, max)) {
    const m = p.uciToMove(u);
    if (!m) break;
    out.push((p.side === 0 ? p.fullmove + '. ' : out.length === 0 ? p.fullmove + '… ' : '') + p.moveToSan(m));
    p.make(m);
  }
  return out;
}

export default function Analysis({ query }: { query: URLSearchParams }) {
  const s = useSettings();
  const init = query.get('fen') || START_FEN;
  const [startFen, setStartFen] = useState(() => { try { return newPos(init).fen(); } catch { return START_FEN; } });
  const [moves, setMoves] = useState<MoveRec[]>([]);
  const [view, setView] = useState(0);
  const [orient, setOrient] = useState<0 | 1>(() => (newPos(init).side as 0 | 1));
  const [info, setInfo] = useState<Info | null>(null);
  const [on, setOn] = useState(true);
  const [load, setLoad] = useState('');
  const [err, setErr] = useState('');
  const [panel, setPanel] = useState<'engine' | 'book'>('engine');

  const fen = view === 0 ? startFen : moves[view - 1].fenAfter;
  const pos = useMemo(() => newPos(fen), [fen]);
  const side = pos.side as 0 | 1;
  const over = !!pos.gameResult();

  useEffect(() => {
    setInfo(null);
    if (!on || over) return;
    let alive = true;
    const eng = analyst();
    eng.go(startFen, moves.slice(0, view).map((m) => m.uci), { movetime: 20000, multipv: 3 }, (i) => { if (alive) setInfo(i); })
      .then((i) => { if (alive && i.lines.length) setInfo(i); });
    return () => { alive = false; eng.stop(); };
  }, [fen, on, over]); // eslint-disable-line react-hooks/exhaustive-deps

  const onMove = (uci: string) => {
    const p = newPos(fen);
    const rec = play(p, uci);
    if (!rec) return;
    const next = [...moves.slice(0, view), rec];
    setMoves(next); setView(next.length);
    playSound(soundFor(rec));
  };
  const onView = useCallback((i: number) => setView(Math.max(0, Math.min(moves.length, i))), [moves.length]);
  useArrowKeys(view, moves.length, onView);

  function loadInput() {
    const r = parseInput(load);
    if (r.error) { setErr(r.error); return; }
    const p = newPos(r.startFen), recs: MoveRec[] = [];
    for (const u of r.moves) { const x = play(p, u); if (!x) break; recs.push(x); }
    setStartFen(r.startFen); setMoves(recs); setView(recs.length); setErr(''); setLoad('');
  }

  const best = info && info.lines[0];
  const evalWp = best ? winPct({ cp: best.cp === null ? null : best.cp * (side === 0 ? 1 : -1), mate: best.mate === null ? null : best.mate * (side === 0 ? 1 : -1), best: null, pv: [], depth: 0 }) : 50;
  const arrows = (info ? info.lines : []).slice(0, 3).map((l, i) => ({ from: l.move.slice(0, 2), to: l.move.slice(2, 4), color: '#4aa3df', opacity: i === 0 ? 0.8 : 0.35 }));
  const res = pos.gameResult();

  return (
    <div className="game-layout analysis">
      <div className="board-col with-eval">
        <EvalBar white={over ? (res.result === '1-0' ? 100 : res.result === '0-1' ? 0 : 50) : (evalWp ?? 50)} label={over ? res.result : best ? fmtScore(best, side) : '…'} flipped={orient === 1} />
        <div className="board-stack">
          <Board resizable fen={fen} orientation={orient} movable="both" lastMove={view > 0 ? moves[view - 1] : null} animate
            onMove={onMove} theme={s.theme} coords={s.showCoords} autoQueen={s.autoQueen} arrows={on ? arrows : []} />
        </div>
      </div>
      <aside className="side-panel">
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={panel === 'engine'} onClick={() => setPanel('engine')}>Engine</button>
          <button role="tab" aria-selected={panel === 'book'} onClick={() => setPanel('book')}>Openings</button>
        </div>
        {panel === 'book' ? <OpeningBook pos={pos} fen={fen} onMove={onMove} /> : <>
        <div className="engine-head">
          <label className="switch">
            <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} />
            <span />Blizzard {E.VERSION}
          </label>
          <span className="muted">{info ? `depth ${info.depth}` : on && !over ? 'starting…' : ''}</span>
        </div>
        <div className="lines" aria-live="polite">
          {over && <p className="muted">Game over: {res.result}.</p>}
          {on && !over && (info ? info.lines : []).map((l, i) => (
            <button key={i} className="line" onClick={() => onMove(l.move)}>
              <b>{fmtScore(l, side)}</b>
              <span>{pvSan(fen, l.pv).join(' ')}</span>
            </button>
          ))}
        </div>
        </>}
        <MoveList moves={moves} view={view} onView={onView} startFullmove={newPos(startFen).fullmove} startSide={newPos(startFen).side} />
        <NavButtons view={view} total={moves.length} onView={onView} onFlip={() => setOrient((orient ^ 1) as 0 | 1)} />
        <div className="field">
          <label className="label" htmlFor="fen">FEN</label>
          <input id="fen" className="mono" readOnly value={fen} onFocus={(e) => e.target.select()} />
        </div>
        <div className="field">
          <label className="label" htmlFor="load">Load a PGN or FEN</label>
          <textarea id="load" rows={3} value={load} onChange={(e) => { setLoad(e.target.value); setErr(''); }} spellCheck={false} />
          {err && <p className="error" role="alert">{err}</p>}
          <div className="row">
            <button className="btn" onClick={loadInput} disabled={!load.trim()}>Load</button>
            <button className="btn ghost" onClick={() => { setStartFen(START_FEN); setMoves([]); setView(0); }}><Icon.plus />New board</button>
          </div>
        </div>
      </aside>
    </div>
  );
}

// справочник дебютов: ходы сильных игроков из книги Blizzard (партии игроков 2500+)
function OpeningBook({ pos, fen, onMove }: { pos: any; fen: string; onMove: (u: string) => void }) {
  const list = useMemo(() => { try { return (pos.bookMoves() || []) as { m: number; uci: string; n: number; score: number }[]; } catch { return []; } }, [pos]);
  const name = useMemo(() => { try { return pos.openingName() as string | null; } catch { return null; } }, [pos]);
  const total = list.reduce((a, x) => a + x.n, 0);
  const rows = list.slice().sort((a, b) => b.n - a.n);
  return (
    <div className="book">
      <p className="book-name">{name || (fen.startsWith('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR') ? 'Starting position' : 'Opening not named')}</p>
      {rows.length === 0 ? <p className="muted small">No master games from this position. You’re out of the opening book.</p> : (
        <table className="book-table">
          <thead><tr><th>Move</th><th>Games</th><th>Score for the side to move</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.uci} onClick={() => onMove(r.uci)} title="Play this move">
                <td><b>{pos.moveToSan(r.m)}</b></td>
                <td className="n">{r.n.toLocaleString()} <span className="muted">{total ? Math.round((100 * r.n) / total) + '%' : ''}</span></td>
                <td><span className="score-bar"><i style={{ width: Math.round(r.score * 100) + '%' }} /><em>{Math.round(r.score * 100)}%</em></span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
