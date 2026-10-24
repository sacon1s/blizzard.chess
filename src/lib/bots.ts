// Боты — уровни движка Blizzard (LEVELS в engine.js): глубина, время на ход, случайность и зевки.
import { E } from './chess';

export interface Bot { level: number; name: string; elo: string; about: string }
const ABOUT: Record<number, string> = {
  1: 'Just learned how the pieces move. Often leaves them hanging.',
  2: 'Knows the rules, misses simple threats.',
  3: 'Sees one move ahead and likes to attack.',
  4: 'Plays sensible moves but drops a pawn now and then.',
  5: 'A solid club player: punishes loose pieces.',
  6: 'Calculates short tactics and rarely blunders.',
  7: 'A strong tournament player with good technique.',
  8: 'Master strength: precise in the middlegame and the endgame.',
  9: 'Grandmaster level. Expect a long, hard game.',
  10: 'Blizzard at full strength. Stronger than any human.',
};
export const BOTS: Bot[] = Array.from({ length: 10 }, (_, i) => {
  const L = E.LEVELS[i + 1];
  return { level: i + 1, name: L.name, elo: i === 9 ? 'Full strength' : `≈${L.elo}`, about: ABOUT[i + 1] };
});

export const TIME_CONTROLS = [
  { v: 'none', label: 'No clock' },
  { v: '3+2', label: '3 + 2' },
  { v: '5+0', label: '5 min' },
  { v: '10+0', label: '10 min' },
  { v: '15+10', label: '15 + 10' },
  { v: '30+0', label: '30 min' },
];
export function parseTc(tc: string): { base: number; inc: number } | null {
  if (!tc || tc === 'none') return null;
  const [m, s] = tc.split('+').map(Number);
  return { base: m * 60000, inc: (s || 0) * 1000 };
}
export function tcLabel(tc: string) { return (TIME_CONTROLS.find((t) => t.v === tc) || { label: tc }).label; }
