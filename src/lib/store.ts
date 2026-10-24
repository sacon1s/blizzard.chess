// Настройки и сохранённые партии в браузере (localStorage); если хранилище недоступно — живём без него.
import { useSyncExternalStore } from 'react';

function read<T>(k: string, d: T): T {
  try { const v = localStorage.getItem('bc.' + k); return v === null ? d : (JSON.parse(v) as T); } catch { return d; }
}
function write(k: string, v: unknown) {
  try { localStorage.setItem('bc.' + k, JSON.stringify(v)); } catch { /* недоступно */ }
}

function makeStore<T extends object>(key: string, def: T) {
  let value: T = Object.assign({}, def, read<Partial<T>>(key, {}));
  const subs = new Set<() => void>();
  return {
    get: () => value,
    set(patch: Partial<T>) { value = Object.assign({}, value, patch); write(key, value); subs.forEach((f) => f()); },
    subscribe(f: () => void) { subs.add(f); return () => subs.delete(f); },
  };
}

export interface Settings { skin: string; pieces: string; theme: string; sound: boolean; showCoords: boolean; autoQueen: boolean; botLevel: number; botColor: 'white' | 'black' | 'random'; botClock: string }
export const settings = makeStore<Settings>('settings', {
  skin: 'dark', pieces: 'maestro', theme: 'brown', sound: true, showCoords: true, autoQueen: false, botLevel: 5, botColor: 'random', botClock: 'none',
});
export function useSettings(): Settings {
  return useSyncExternalStore(settings.subscribe, settings.get);
}

// партии для разбора (последние 50)
export interface SavedGame {
  id: string; date: string; white: string; black: string; startFen: string; moves: string[]; sans: string[];
  result: string; reason: string; source: 'bot' | 'online' | 'import'; playerColor?: 0 | 1; event?: string;
}
export function savedGames(): SavedGame[] { return read<SavedGame[]>('games', []); }
export function saveGame(g: SavedGame) {
  const list = savedGames().filter((x) => x.id !== g.id);
  list.unshift(g);
  write('games', list.slice(0, 50));
}
export function getGame(id: string): SavedGame | null { return savedGames().find((g) => g.id === id) || null; }
export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const THEMES = [
  { v: 'brown', label: 'Brown', a: '#f0d9b5', b: '#b58863' },
  { v: 'green', label: 'Green', a: '#eeeed2', b: '#769656' },
  { v: 'blue', label: 'Blue', a: '#dee3e6', b: '#8ca2ad' },
  { v: 'ice', label: 'Ice', a: '#e6eef4', b: '#7d98ad' },
  { v: 'dusk', label: 'Dusk', a: '#ebe6f3', b: '#8b7db6' },
  { v: 'marble', label: 'Marble', a: '#e2e2de', b: '#84898f' },
  { v: 'snow', label: 'Grey', a: '#dedede', b: '#8f8f8f' },
];
export const SKINS = [
  { v: 'dark', label: 'Dark' },
  { v: 'light', label: 'Light' },
];

// кэш разборов: оценки позиций по id партии (последние 30)
export function cacheGet<T>(k: string): T | null { return read<T | null>('c.' + k, null); }
export function cacheSet(k: string, v: unknown) {
  const idx = read<string[]>('cidx', []).filter((x) => x !== k);
  idx.unshift(k);
  for (const old of idx.slice(30)) { try { localStorage.removeItem('bc.c.' + old); } catch { /* */ } }
  write('cidx', idx.slice(0, 30));
  write('c.' + k, v);
}
