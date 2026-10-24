// Турниры-арены по расписанию: каждый час блиц 3+0 (:00–:30) и пуля 1+0 (:30–:55), время UTC.
// Пока арена идёт, участников сводит общая очередь; победа — 2 очка, ничья — 1,
// после двух побед подряд очки удваиваются («серия»). Каждый пишет только свою строку таблицы.
//   arenas/<id>/players/<uid> = { name, score, streak, games, rating, sheet, done/<gid> }
import { useEffect, useState } from 'react';
import { ref, onValue, runTransaction, update, remove } from 'firebase/database';
import { db } from './firebase';
import type { Profile } from './auth';
import type { OGame } from './online';

export interface ArenaInfo { id: string; name: string; tc: string; start: number; end: number }
export interface ArenaPlayer { uid: string; name: string; score: number; streak: number; games: number; rating: number; sheet: string }

const pad = (n: number) => String(n).padStart(2, '0');
function slot(hourStart: number, kind: 'blitz' | 'bullet'): ArenaInfo {
  const d = new Date(hourStart);
  const id = `${kind}-${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}`;
  if (kind === 'blitz') return { id, name: 'Hourly Blitz Arena', tc: '3+0', start: hourStart, end: hourStart + 30 * 60000 };
  return { id, name: 'Hourly Bullet Arena', tc: '1+0', start: hourStart + 30 * 60000, end: hourStart + 55 * 60000 };
}
// текущие и ближайшие арены
export function schedule(now = Date.now(), count = 4): ArenaInfo[] {
  const h0 = Math.floor(now / 3600000) * 3600000;
  const out: ArenaInfo[] = [];
  for (let h = h0; out.length < count + 2; h += 3600000) out.push(slot(h, 'blitz'), slot(h, 'bullet'));
  return out.filter((a) => a.end > now).slice(0, count);
}
export function arenaById(id: string): ArenaInfo | null {
  const m = /^(blitz|bullet)-(\d{4})(\d{2})(\d{2})(\d{2})$/.exec(id);
  if (!m) return null;
  const t = Date.UTC(+m[2], +m[3] - 1, +m[4], +m[5]);
  return slot(t, m[1] as 'blitz' | 'bullet');
}

export function useArenaPlayers(id: string): ArenaPlayer[] | null {
  const [list, setList] = useState<ArenaPlayer[] | null>(null);
  useEffect(() => onValue(ref(db, `arenas/${id}/players`), (s) => {
    const v = s.val() || {};
    setList(Object.keys(v).map((k) => ({ uid: k, name: v[k].name, score: v[k].score || 0, streak: v[k].streak || 0, games: v[k].games || 0, rating: v[k].rating || 1200, sheet: v[k].sheet || '' }))
      .sort((a, b) => b.score - a.score || b.rating - a.rating));
  }, () => setList([])), [id]);
  return list;
}
export const joinArena = (id: string, me: Profile, rating: number) =>
  runTransaction(ref(db, `arenas/${id}/players/${me.uid}`), (cur) => cur || { name: me.name, score: 0, streak: 0, games: 0, rating, sheet: '' });
export const leaveArena = (id: string, uid: string) => remove(ref(db, `arenas/${id}/players/${uid}`));

// учесть законченную партию арены в своей строке (один раз)
export function scoreArenaGame(g: OGame, uid: string) {
  if (!g.arena || g.status !== 'over' || !g.result) return Promise.resolve();
  const color = g.white === uid ? 0 : g.black === uid ? 1 : -1;
  if (color < 0) return Promise.resolve();
  const res = g.result === '1/2-1/2' ? 'd' : (g.result === '1-0') === (color === 0) ? 'w' : 'l';
  return runTransaction(ref(db, `arenas/${g.arena}/players/${uid}`), (cur) => {
    if (!cur) return cur;
    cur.done = cur.done || {};
    if (cur.done[g.id]) return;
    cur.done[g.id] = true;
    const fire = (cur.streak || 0) >= 2;
    const pts = res === 'w' ? (fire ? 4 : 2) : res === 'd' ? (fire ? 2 : 1) : 0;
    cur.score = (cur.score || 0) + pts;
    cur.streak = res === 'w' ? (cur.streak || 0) + 1 : 0;
    cur.games = (cur.games || 0) + 1;
    cur.sheet = ((cur.sheet || '') + pts).slice(-40);
    return cur;
  }).then(() => undefined);
}
export const setArenaRating = (id: string, uid: string, rating: number) => update(ref(db, `arenas/${id}/players/${uid}`), { rating }).catch(() => {});
