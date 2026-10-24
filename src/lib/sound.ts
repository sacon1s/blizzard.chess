// Звуки ходов через Web Audio: небольшой разброс высоты и громкости, чтобы одинаковые ходы не звучали одинаково.
// Контекст создаётся после первого касания страницы (так требуют браузеры).
import SOUND_DATA from './sound-data';
import { settings } from './store';

let ctx: AudioContext | null = null;
const buf: Record<string, AudioBuffer[]> = {};

function ensure() {
  if (ctx) return;
  const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AC) return;
  try { ctx = new AC(); } catch { ctx = null; return; }
  const c = ctx!;
  const dec = (u: string) => fetch(u).then((r) => r.arrayBuffer()).then((a) => new Promise<AudioBuffer>((res, rej) => c.decodeAudioData(a, res, rej)));
  for (const [k, v] of Object.entries(SOUND_DATA)) Promise.all(([] as string[]).concat(v).map(dec)).then((bs) => { buf[k] = bs; }).catch(() => {});
}
for (const ev of ['pointerdown', 'keydown']) document.addEventListener(ev, ensure, { once: true, capture: true });

export type SoundKind = 'move' | 'capture' | 'castle' | 'check';
export function playSound(kind: SoundKind) {
  if (!settings.get().sound || !ctx) return;
  if (ctx.state === 'suspended') ctx.resume();
  const list = buf[kind] || buf.move;
  if (!list || !list.length) return;
  const node = ctx.createBufferSource();
  node.buffer = list[Math.floor(Math.random() * list.length)];
  node.playbackRate.value = 0.96 + Math.random() * 0.08;
  const g = ctx.createGain();
  g.gain.value = 0.75 + Math.random() * 0.2;
  node.connect(g); g.connect(ctx.destination); node.start();
}
export function soundFor(m: { check: boolean; castle: boolean; capture: boolean }): SoundKind {
  return m.check ? 'check' : m.castle ? 'castle' : m.capture ? 'capture' : 'move';
}
