// Движок Blizzard в отдельном потоке (public/engine/worker.js). Один поток — одна задача за раз:
// новая задача останавливает предыдущую.
export interface Line { move: string; cp: number | null; mate: number | null; pv: string[]; depth: number; score: number }
export interface Info { depth: number; nodes: number; nps: number; time: number; lines: Line[]; book?: { n: number; score: number } | null; stopped?: boolean }
export interface Limits { movetime?: number; depth?: number; nodes?: number; multipv?: number; book?: boolean; infinite?: boolean }

interface Job { id: number; onInfo?: (i: Info) => void; resolve: (i: Info) => void }

export class Engine {
  private w: Worker;
  private seq = 0;
  private job: Job | null = null;
  ready: Promise<void>;
  constructor() {
    this.w = new Worker('engine/worker.js');
    let ok: () => void = () => {};
    this.ready = new Promise((r) => { ok = r; });
    this.w.onmessage = (ev: MessageEvent) => {
      const d = ev.data || {};
      if (d.type === 'ready') { ok(); return; }
      const j = this.job;
      if (!j || d.id !== j.id) return;
      if (d.type === 'info') j.onInfo && j.onInfo(d);
      else if (d.type === 'done' || d.type === 'error') {
        this.job = null;
        j.resolve(d.type === 'error' ? { depth: 0, nodes: 0, nps: 0, time: 0, lines: [] } : d);
      }
    };
  }
  go(fen: string, moves: string[], limits: Limits, onInfo?: (i: Info) => void): Promise<Info> {
    this.stop();
    const id = ++this.seq;
    return new Promise((resolve) => {
      this.job = { id, onInfo, resolve };
      this.w.postMessage({ type: 'go', id, fen, moves, limits });
    });
  }
  stop() {
    if (this.job) this.w.postMessage({ type: 'stop' });
  }
  newGame() { this.stop(); this.w.postMessage({ type: 'newgame' }); }
  get busy() { return !!this.job; }
}

let botEngine: Engine | null = null, anaEngine: Engine | null = null;
export const bot = () => (botEngine ||= new Engine());
export const analyst = () => (anaEngine ||= new Engine());

// оценка линии для показа: «+1.25», «−0.40», «M3», «−M2» — с точки зрения белых
export function fmtScore(l: { cp: number | null; mate: number | null } | null | undefined, sideToMove: 0 | 1): string {
  if (!l) return '';
  const sgn = sideToMove === 0 ? 1 : -1;
  if (l.mate !== null && l.mate !== undefined) { const m = l.mate * sgn; return (m > 0 ? 'M' : '−M') + Math.abs(m); }
  const v = (l.cp || 0) * sgn / 100;
  return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(2);
}
