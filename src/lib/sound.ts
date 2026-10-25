// Звуки ходов через Web Audio: небольшой разброс высоты и громкости, чтобы одинаковые ходы не звучали одинаково.
// Контекст создаётся после первого касания страницы (так требуют браузеры). Наборов два, выбор в настройках.
import SET1 from './sound-data';
import SET2 from './sound-data-2';
import { settings } from './store';

export const SOUND_SETS: { v: string; label: string; data: Record<string, string | string[]> }[] = [
  { v: 'board2', label: 'Board 2', data: SET2 },
  { v: 'board1', label: 'Board 1', data: SET1 },
];
let ctx: AudioContext | null = null;
const buf: Record<string, Record<string, AudioBuffer[]>> = {};
const loading: Partial<Record<string, Promise<void>>> = {};

const setOf = (v?: string) => (SOUND_SETS.find((x) => x.v === v) || SOUND_SETS[0]).v;
function load(v: string): Promise<void> {
  if (!ctx) return Promise.resolve();
  if (loading[v]) return loading[v];
  const c = ctx, data = SOUND_SETS.find((x) => x.v === v)!.data, out: Record<string, AudioBuffer[]> = {};
  const dec = (u: string) => fetch(u).then((r) => r.arrayBuffer()).then((a) => new Promise<AudioBuffer>((res, rej) => c.decodeAudioData(a, res, rej)));
  const p = Promise.all(Object.entries(data).map(([k, d]) => Promise.all(([] as string[]).concat(d).map(dec)).then((bs) => { out[k] = bs; }).catch(() => {})))
    .then(() => { buf[v] = out; });
  loading[v] = p;
  return p;
}
function ensure() {
  if (ctx) return;
  const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AC) return;
  try { ctx = new AC(); } catch { ctx = null; return; }
  load(setOf(settings.get().soundSet));
}
for (const ev of ['pointerdown', 'keydown']) document.addEventListener(ev, ensure, { once: true, capture: true });

export type SoundKind = 'move' | 'capture' | 'castle' | 'check';
function playFrom(v: string, kind: SoundKind) {
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();
  const b = buf[v];
  const list = b && (b[kind] || b.move);
  if (!list || !list.length) return;
  const node = ctx.createBufferSource();
  node.buffer = list[Math.floor(Math.random() * list.length)];
  node.playbackRate.value = 0.96 + Math.random() * 0.08;
  const g = ctx.createGain();
  g.gain.value = 0.75 + Math.random() * 0.2;
  node.connect(g); g.connect(ctx.destination); node.start();
}
export function playSound(kind: SoundKind) {
  if (!settings.get().sound || !ctx) return;
  const v = setOf(settings.get().soundSet);
  if (!buf[v]) { load(v); return; }
  playFrom(v, kind);
}
// послушать набор в настройках: ход, затем взятие
export function previewSet(v: string) {
  ensure();
  load(v).then(() => { playFrom(v, 'move'); setTimeout(() => playFrom(v, 'capture'), 420); });
}
export function soundFor(m: { check: boolean; castle: boolean; capture: boolean }): SoundKind {
  return m.check ? 'check' : m.castle ? 'castle' : m.capture ? 'capture' : 'move';
}
