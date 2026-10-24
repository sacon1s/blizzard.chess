// Маршруты в адресе после # (GitHub Pages отдаёт одну страницу): #/bots, #/review/abc, #/analysis?fen=…
import { useSyncExternalStore } from 'react';

function current() { return location.hash.replace(/^#/, '') || '/'; }
const subscribe = (f: () => void) => { window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); };
export function useRoute(): { path: string; parts: string[]; query: URLSearchParams } {
  const h = useSyncExternalStore(subscribe, current);
  const [path, q] = h.split('?');
  return { path, parts: path.split('/').filter(Boolean), query: new URLSearchParams(q || '') };
}
export function go(path: string) { if (current() !== path) location.hash = path; window.scrollTo(0, 0); }
