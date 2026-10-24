// Задачи: статистика игрока (рейтинг задач, решённые, история) — в браузере и в профиле, если игрок вошёл.
import { useSyncExternalStore } from 'react';
import { ref, update } from 'firebase/database';
import { db } from './firebase';
import { makeStore } from './store';

export interface Puzzle { id: string; fen: string; moves: string[]; rating: number; themes: string[] }
export interface PuzzleStats {
  rating: number; solved: number; failed: number; seen: string[]; history: { id: string; ok: boolean; rating: number }[];
}
export const puzzleStats = makeStore<PuzzleStats>('puzzles', { rating: 1000, solved: 0, failed: 0, seen: [], history: [] });
export function usePuzzleStats(): PuzzleStats { return useSyncExternalStore(puzzleStats.subscribe, puzzleStats.get); }

// win — решена с первой попытки, fail — ошибка или показано решение, hint — решена с подсказкой (рейтинг не меняется)
export function recordPuzzle(pz: Puzzle, kind: 'win' | 'fail' | 'hint', uid: string | null): number {
  const st = puzzleStats.get();
  const n = st.solved + st.failed;
  const K = n < 30 ? 40 : 20;
  const expected = 1 / (1 + Math.pow(10, (pz.rating - st.rating) / 400));
  const d = kind === 'hint' ? 0 : Math.round(K * ((kind === 'win' ? 1 : 0) - expected));
  const rating = Math.max(400, Math.round(st.rating + d));
  const next: PuzzleStats = {
    rating,
    solved: st.solved + (kind === 'fail' ? 0 : 1),
    failed: st.failed + (kind === 'fail' ? 1 : 0),
    seen: [...st.seen.filter((x) => x !== pz.id), pz.id].slice(-3000),
    history: [...st.history, { id: pz.id, ok: kind !== 'fail', rating: pz.rating }].slice(-60),
  };
  puzzleStats.set(next);
  if (uid) update(ref(db, 'users/' + uid), { puzzle: { rating, solved: next.solved, failed: next.failed } }).catch(() => {});
  return d;
}
// на новом устройстве взять рейтинг задач из профиля
export function adoptRemote(remote: { rating: number; solved: number; failed: number } | undefined) {
  const st = puzzleStats.get();
  if (remote && st.solved + st.failed === 0 && remote.solved + remote.failed > 0) puzzleStats.set({ ...st, ...remote });
}
