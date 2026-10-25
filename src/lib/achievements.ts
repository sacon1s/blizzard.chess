// Достижения: выдаются в браузере и сохраняются в профиле, если игрок вошёл.
import { ref, runTransaction } from 'firebase/database';
import { auth, db } from './firebase';
import { makeStore } from './store';

export const ACHIEVEMENTS: { id: string; name: string; text: string }[] = [
  { id: 'firstWin', name: 'First win', text: 'Win a game online' },
  { id: 'games10', name: 'Regular', text: 'Play 10 games online' },
  { id: 'games100', name: 'Veteran', text: 'Play 100 games online' },
  { id: 'beat5', name: 'Club level', text: 'Beat the Club player bot' },
  { id: 'beat8', name: 'Master slayer', text: 'Beat the Master bot' },
  { id: 'beat10', name: 'Blizzard tamer', text: 'Beat Blizzard at full strength' },
  { id: 'brilliant', name: 'Brilliant', text: 'Play a brilliant move' },
  { id: 'puzzles50', name: 'Puzzler', text: 'Solve 50 puzzles' },
  { id: 'puzzles500', name: 'Tactician', text: 'Solve 500 puzzles' },
  { id: 'puzzle1500', name: 'Sharp eye', text: 'Reach a puzzle rating of 1500' },
  { id: 'rush15', name: 'Quick', text: 'Score 15 in Puzzle Rush' },
  { id: 'rush30', name: 'Lightning', text: 'Score 30 in Puzzle Rush' },
  { id: 'daily7', name: 'Habit', text: 'Solve the daily puzzle 7 days in a row' },
  { id: 'friend1', name: 'Friendly', text: 'Add a friend' },
  { id: 'arena1', name: 'Contender', text: 'Play in an arena' },
  { id: 'arenaWin', name: 'Champion', text: 'Win an arena' },
  { id: 'lessons', name: 'Student', text: 'Finish all lessons' },
];

export const achStore = makeStore<{ got: Record<string, number> }>('ach', { got: {} });
const listeners = new Set<(id: string) => void>();
export function onAward(f: (id: string) => void) { listeners.add(f); return () => { listeners.delete(f); }; }

export function award(id: string) {
  const got = achStore.get().got;
  const uid = auth.currentUser ? auth.currentUser.uid : null;
  if (uid) runTransaction(ref(db, `users/${uid}/ach/${id}`), (cur) => (cur ? undefined : Date.now())).catch(() => {});
  if (got[id]) return;
  achStore.set({ got: { ...got, [id]: Date.now() } });
  listeners.forEach((f) => f(id));
}
// на новом устройстве подтянуть достижения из профиля
export function mergeRemote(remote: Record<string, number> | undefined) {
  if (!remote) return;
  const got = achStore.get().got;
  const add = Object.keys(remote).filter((k) => !got[k]);
  if (add.length) achStore.set({ got: { ...got, ...Object.fromEntries(add.map((k) => [k, remote[k]])) } });
}
