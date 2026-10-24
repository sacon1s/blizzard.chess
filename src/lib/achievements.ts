// Достижения: выдаются в браузере и сохраняются в профиле, если игрок вошёл.
import { ref, runTransaction } from 'firebase/database';
import { auth, db } from './firebase';
import { makeStore } from './store';

export const ACHIEVEMENTS: { id: string; name: string; text: string; glyph: string }[] = [
  { id: 'firstWin', name: 'First win', text: 'Win a game online', glyph: '★' },
  { id: 'games10', name: 'Regular', text: 'Play 10 games online', glyph: '10' },
  { id: 'games100', name: 'Veteran', text: 'Play 100 games online', glyph: '100' },
  { id: 'beat5', name: 'Club level', text: 'Beat the Club player bot', glyph: '5' },
  { id: 'beat8', name: 'Master slayer', text: 'Beat the Master bot', glyph: '8' },
  { id: 'beat10', name: 'Blizzard tamer', text: 'Beat Blizzard at full strength', glyph: '❄' },
  { id: 'brilliant', name: 'Brilliant', text: 'Play a brilliant move', glyph: '!!' },
  { id: 'puzzles50', name: 'Puzzler', text: 'Solve 50 puzzles', glyph: '50' },
  { id: 'puzzles500', name: 'Tactician', text: 'Solve 500 puzzles', glyph: '500' },
  { id: 'puzzle1500', name: 'Sharp eye', text: 'Reach a puzzle rating of 1500', glyph: '◎' },
  { id: 'rush15', name: 'Quick', text: 'Score 15 in Puzzle Rush', glyph: '15' },
  { id: 'rush30', name: 'Lightning', text: 'Score 30 in Puzzle Rush', glyph: '30' },
  { id: 'daily7', name: 'Habit', text: 'Solve the daily puzzle 7 days in a row', glyph: '7' },
  { id: 'friend1', name: 'Friendly', text: 'Add a friend', glyph: '♥' },
  { id: 'arena1', name: 'Contender', text: 'Play in an arena', glyph: '⚑' },
  { id: 'arenaWin', name: 'Champion', text: 'Win an arena', glyph: '♛' },
  { id: 'lessons', name: 'Student', text: 'Finish all lessons', glyph: '✎' },
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
