// Игра онлайн через Realtime Database: поиск соперника, партия по ссылке, ходы, часы, ничья, сдача, рейтинг.
//   seeks/<контроль>/<uid>  — очередь ожидающих;  matches/<uid> — id партии для того, кого нашли;
//   games/<id> — партия;  userGames/<uid>/<id> — история игрока (пишет только он сам).
// Время считается по часам сервера (.info/serverTimeOffset); ходы записываются транзакцией.
import { ref, push, set, get, onValue, runTransaction, onDisconnect, remove, update, query, orderByChild, limitToLast, equalTo, serverTimestamp } from 'firebase/database';
import { db } from './firebase';
import { speedOf, DEFAULT_RATING, type Profile, type Speed } from './auth';
import { START_FEN, posAt, play, gameEnd, newPos } from './chess';

let offset = 0;
onValue(ref(db, '.info/serverTimeOffset'), (s) => { offset = s.val() || 0; }, () => {});
export const serverNow = () => Date.now() + offset;

export interface OGame {
  id: string;
  white?: string; black?: string; wName?: string; bName?: string; wRating?: number; bRating?: number;
  tc: string; base: number; inc: number; speed: Speed; rated: boolean; created: number; host?: string;
  moves?: string;
  clock: { w: number; b: number; last: number };
  status: 'open' | 'started' | 'over' | 'aborted'; invited?: string;
  fen?: string; daily?: boolean; arena?: string;
  rematch?: { gid: string; by: string };
  chat?: Record<string, { u: string; n: string; m: string; t: number }>;
  result?: '1-0' | '0-1' | '1/2-1/2'; reason?: string;
  drawOffer?: string | null;
  left?: Record<string, number>;
  settled?: Record<string, number>;
}
export interface UserGame { opp: string; oppName: string; color: 0 | 1; tc: string; speed: Speed; rated: boolean; date: number; pending?: boolean; result?: string; reason?: string; delta?: number; op?: string; daily?: boolean }

export const QUICK = ['1+0', '2+1', '3+0', '3+2', '5+0', '5+3', '10+0', '10+5', '15+10', '30+0'];
export function parseTcStr(tc: string) {
  if (tc.endsWith('d')) return { base: parseInt(tc, 10) * 86400000, inc: 0 }; // «ход в день»: на каждый ход N суток
  const [m, s] = tc.split('+').map(Number); return { base: m * 60000, inc: (s || 0) * 1000 };
}
export function tcName(tc: string) {
  if (tc.endsWith('d')) { const n = parseInt(tc, 10); return n === 1 ? '1 day' : `${n} days`; }
  const [m, s] = tc.split('+'); return s && s !== '0' ? `${m} + ${s}` : `${m} min`;
}
export const startOf = (g: { fen?: string }) => g.fen || START_FEN;
export const SPEED_LABEL: Record<Speed, string> = { bullet: 'Bullet', blitz: 'Blitz', rapid: 'Rapid', classical: 'Classical' };
export const ratingOf = (p: Profile | null | undefined, sp: Speed) => (p && p.ratings && p.ratings[sp]) || DEFAULT_RATING;
export const movesOf = (g: OGame) => (g.moves ? g.moves.split(' ') : []);

export function watchGame(id: string, cb: (g: OGame | null) => void) {
  return onValue(ref(db, 'games/' + id), (s) => cb(s.exists() ? ({ id, ...s.val() } as OGame) : null), () => cb(null));
}

export interface GameOpts { rated?: boolean; daily?: boolean; arena?: string }
function newGameData(tc: string, rated: boolean, o: GameOpts = {}) {
  const { base, inc } = parseTcStr(tc);
  const daily = tc.endsWith('d');
  const extra: Record<string, unknown> = {};
  if (daily) extra.daily = true;
  if (o.arena) extra.arena = o.arena;
  return { tc, base, inc, speed: daily ? 'classical' : speedOf(base, inc), rated, created: serverTimestamp(), moves: '', clock: { w: base, b: base, last: 0 }, ...extra };
}

// ---------------------------------------------------------------- поиск соперника
export function seek(tc: string, me: Profile, onMatched: (gid: string) => void, o: GameOpts = {}): () => void {
  const sp = speedOf(parseTcStr(tc).base, parseTcStr(tc).inc);
  const key = tc + (o.arena ? '~' + o.arena : '');
  const qref = ref(db, 'seeks/' + key), mine = ref(db, `seeks/${key}/${me.uid}`), mref = ref(db, 'matches/' + me.uid);
  let cancelled = false, unsub: (() => void) | null = null;
  let opp: { uid: string; name: string; rating: number } | null = null;
  remove(mref).catch(() => {}).then(() => runTransaction(qref, (cur: Record<string, { name: string; rating: number; t: number }> | null) => {
    opp = null;
    const q = cur || {};
    const others = Object.entries(q).filter(([k]) => k !== me.uid).sort((a, b) => a[1].t - b[1].t);
    if (others.length) {
      const [ouid, o] = others[0];
      opp = { uid: ouid, name: o.name, rating: o.rating };
      delete q[ouid];
      delete q[me.uid];
      return q;
    }
    q[me.uid] = { name: me.name, rating: ratingOf(me, sp), t: Date.now() };
    return q;
  })).then(async () => {
    if (opp) {
      const meWhite = Math.random() < 0.5;
      const w = meWhite ? { uid: me.uid, name: me.name, rating: ratingOf(me, sp) } : opp;
      const b = meWhite ? opp : { uid: me.uid, name: me.name, rating: ratingOf(me, sp) };
      const gref = push(ref(db, 'games'));
      await set(gref, { ...newGameData(tc, true, o), white: w.uid, black: b.uid, wName: w.name, bName: b.name, wRating: w.rating, bRating: b.rating, status: 'started' });
      await set(ref(db, 'matches/' + opp.uid), gref.key);
      if (!cancelled) onMatched(gref.key!);
      return;
    }
    if (cancelled) { remove(mine).catch(() => {}); return; }
    onDisconnect(mine).remove().catch(() => {});
    unsub = onValue(mref, (s) => {
      if (!s.exists()) return;
      const gid = s.val();
      unsub && unsub(); unsub = null;
      remove(mref).catch(() => {});
      onMatched(gid);
    }, () => {});
  }).catch(() => {});
  return () => {
    cancelled = true;
    if (unsub) { unsub(); unsub = null; }
    remove(mine).catch(() => {});
    onDisconnect(mine).cancel().catch(() => {});
  };
}

export function watchSeeks(cb: (counts: Record<string, number>) => void) {
  return onValue(ref(db, 'seeks'), (s) => {
    const v = s.val() || {}, out: Record<string, number> = {};
    for (const tc of Object.keys(v)) out[tc] = Object.keys(v[tc] || {}).length;
    cb(out);
  }, () => cb({}));
}

// ---------------------------------------------------------------- партия с другом по ссылке (без рейтинга)
export async function createFriendGame(tc: string, me: Profile, color: 'white' | 'black' | 'random', invited?: string, o: GameOpts = {}): Promise<string> {
  const white = color === 'white' || (color === 'random' && Math.random() < 0.5);
  const sp = speedOf(parseTcStr(tc).base, parseTcStr(tc).inc);
  const gref = push(ref(db, 'games'));
  const seat = white ? { white: me.uid, wName: me.name, wRating: ratingOf(me, sp) } : { black: me.uid, bName: me.name, bRating: ratingOf(me, sp) };
  await set(gref, { ...newGameData(tc, !!o.rated, o), ...seat, host: me.uid, status: 'open', ...(invited ? { invited } : {}) });
  return gref.key!;
}
export function joinGame(gid: string, me: Profile) {
  return runTransaction(ref(db, 'games/' + gid), (g: OGame | null) => {
    if (!g) return g;
    if (g.status !== 'open' || g.host === me.uid) return;
    const r = ratingOf(me, g.speed);
    if (!g.white) { g.white = me.uid; g.wName = me.name; g.wRating = r; } else if (!g.black) { g.black = me.uid; g.bName = me.name; g.bRating = r; } else return;
    g.status = 'started';
    return g;
  });
}

// ---------------------------------------------------------------- ходы и конец партии
export function sendMove(gid: string, uci: string, color: 0 | 1) {
  return runTransaction(ref(db, 'games/' + gid), (g: OGame | null) => {
    if (!g) return g;
    if (g.status !== 'started') return;
    const ms = g.moves ? g.moves.split(' ') : [];
    if ((ms.length & 1) !== color) return;
    const pos = posAt(startOf(g), ms, ms.length);
    if (pos.side !== color) return;
    const rec = play(pos, uci);
    if (!rec) return;
    const now = serverNow(), key = color === 0 ? 'w' : 'b';
    if (ms.length >= 2) {
      const left = g.clock[key] - (now - g.clock.last);
      if (left <= 0) return finishOnTime(g, ms, color);
      g.clock[key] = g.daily ? g.base : Math.round(left + g.inc); // «ход в день»: время на ход каждый раз заново
    }
    g.clock.last = now;
    ms.push(rec.uci);
    g.moves = ms.join(' ');
    g.drawOffer = null;
    const end = gameEnd(pos);
    if (end) { g.status = 'over'; g.result = end.result; g.reason = end.reason; }
    return g;
  });
}
function finishOnTime(g: OGame, ms: string[], loser: 0 | 1) {
  g.clock[loser === 0 ? 'w' : 'b'] = 0;
  g.status = 'over';
  // у победителя один король — ничья
  const pos = posAt(startOf(g), ms, ms.length);
  let material = false;
  for (let sq = 0; sq < 128; sq++) { if (sq & 0x88) continue; const p = pos.board[sq]; if (p && (p >> 3) === (loser ^ 1) && (p & 7) !== 6) material = true; }
  g.result = material ? (loser === 0 ? '0-1' : '1-0') : '1/2-1/2';
  g.reason = material ? 'time' : 'timevsmaterial';
  return g;
}
export function claimTimeout(gid: string) {
  return runTransaction(ref(db, 'games/' + gid), (g: OGame | null) => {
    if (!g || g.status !== 'started') return g === null ? g : undefined;
    const ms = g.moves ? g.moves.split(' ') : [];
    if (ms.length < 2) return;
    const side = (ms.length & 1) as 0 | 1;
    const left = g.clock[side === 0 ? 'w' : 'b'] - (serverNow() - g.clock.last);
    if (left > 0) return;
    return finishOnTime(g, ms, side);
  });
}
export function resign(gid: string, color: 0 | 1) {
  return runTransaction(ref(db, 'games/' + gid), (g: OGame | null) => {
    if (!g) return g;
    if (g.status !== 'started') return;
    g.status = 'over'; g.result = color === 0 ? '0-1' : '1-0'; g.reason = 'resign';
    return g;
  });
}
export function abort(gid: string) {
  return runTransaction(ref(db, 'games/' + gid), (g: OGame | null) => {
    if (!g) return g;
    if (g.status === 'open' || (g.status === 'started' && movesOf(g).length < 2)) { g.status = 'aborted'; return g; }
    return;
  });
}
export const offerDraw = (gid: string, uid: string) => update(ref(db, 'games/' + gid), { drawOffer: uid });
export function answerDraw(gid: string, uid: string, accept: boolean) {
  return runTransaction(ref(db, 'games/' + gid), (g: OGame | null) => {
    if (!g) return g;
    if (g.status !== 'started' || !g.drawOffer || g.drawOffer === uid) return;
    if (accept) { g.status = 'over'; g.result = '1/2-1/2'; g.reason = 'agreement'; }
    g.drawOffer = null;
    return g;
  });
}
export const LEAVE_MS = 30000;
// соперник ушёл больше 30 секунд назад: победа (или отмена, если партия толком не началась)
export function claimAbandon(gid: string, color: 0 | 1) {
  return runTransaction(ref(db, 'games/' + gid), (g: OGame | null) => {
    if (!g) return g;
    if (g.status !== 'started') return;
    const opp = color === 0 ? g.black : g.white;
    const t = opp && g.left && g.left[opp];
    if (!t || serverNow() - t < LEAVE_MS) return;
    if (movesOf(g).length < 2) { g.status = 'aborted'; return g; }
    g.status = 'over'; g.result = color === 0 ? '1-0' : '0-1'; g.reason = 'abandon';
    return g;
  });
}

// присутствие в партии: пока страница открыта — «на месте»
export function presence(gid: string, uid: string) {
  const r = ref(db, `games/${gid}/left/${uid}`);
  remove(r).catch(() => {});
  onDisconnect(r).set(serverTimestamp()).catch(() => {});
  return () => { set(r, serverNow()).catch(() => {}); onDisconnect(r).cancel().catch(() => {}); };
}

// ---------------------------------------------------------------- история и рейтинг
export async function recordStart(g: OGame, uid: string) {
  const color = g.white === uid ? 0 : g.black === uid ? 1 : -1;
  if (color < 0) return;
  const r = ref(db, `userGames/${uid}/${g.id}`);
  const s = await get(r);
  if (s.exists()) return;
  const ug: UserGame = { opp: (color === 0 ? g.black : g.white) || '', oppName: (color === 0 ? g.bName : g.wName) || '', color: color as 0 | 1, tc: g.tc, speed: g.speed, rated: g.rated, date: Date.now(), pending: true };
  if (g.daily) ug.daily = true;
  await set(r, ug);
}

const expected = (my: number, opp: number) => 1 / (1 + Math.pow(10, (opp - my) / 400));
// учесть итог партии в своём профиле (один раз); возвращает изменение рейтинга
export async function settle(g: OGame, uid: string): Promise<number | null> {
  const color = g.white === uid ? 0 : g.black === uid ? 1 : -1;
  if (color < 0) return null;
  const ugRef = ref(db, `userGames/${uid}/${g.id}`);
  if (g.status === 'aborted') { await remove(ugRef).catch(() => {}); return null; }
  if (g.status !== 'over' || !g.result) return null;
  const op = openingOf(g);
  if (g.settled && g.settled[uid] !== undefined) {
    update(ugRef, { pending: null, result: g.result, reason: g.reason || '', delta: g.settled[uid], ...(op ? { op } : {}) }).catch(() => {});
    return g.settled[uid];
  }
  const score = g.result === '1/2-1/2' ? 0.5 : (g.result === '1-0') === (color === 0) ? 1 : 0;
  const us = await get(ref(db, 'users/' + uid));
  if (!us.exists()) return null;
  const u = us.val();
  const n = (u.games && u.games[g.speed]) || 0;
  const my = (color === 0 ? g.wRating : g.bRating) || DEFAULT_RATING, opp = (color === 0 ? g.bRating : g.wRating) || DEFAULT_RATING;
  const delta = g.rated ? Math.round((n < 20 ? 40 : 20) * (score - expected(my, opp))) : 0;
  const t = await runTransaction(ref(db, `games/${g.id}/settled/${uid}`), (cur) => (cur === null ? delta : undefined));
  if (!t.committed) return t.snapshot.val();
  let newRating = 0;
  await runTransaction(ref(db, 'users/' + uid), (cur) => {
    if (!cur) return cur;
    if (g.rated) {
      cur.ratings = cur.ratings || {};
      cur.ratings[g.speed] = Math.max(100, (cur.ratings[g.speed] || DEFAULT_RATING) + delta);
      newRating = cur.ratings[g.speed];
      cur.games = cur.games || {};
      cur.games[g.speed] = (cur.games[g.speed] || 0) + 1;
    }
    if (score === 1) cur.wins = (cur.wins || 0) + 1; else if (score === 0) cur.losses = (cur.losses || 0) + 1; else cur.draws = (cur.draws || 0) + 1;
    return cur;
  });
  await update(ugRef, { pending: null, result: g.result, reason: g.reason || '', delta, ...(op ? { op } : {}) }).catch(() => {});
  // история рейтинга для графика
  if (g.rated && newRating) push(ref(db, `users/${uid}/hist/${g.speed}`), { r: newRating, t: Date.now() }).catch(() => {});
  return delta;
}
// партии, закончившиеся без нас (закрыли вкладку), учитываются при следующем входе
export async function settlePending(uid: string) {
  try {
    const s = await get(query(ref(db, 'userGames/' + uid), limitToLast(30)));
    const v = s.val() || {};
    for (const gid of Object.keys(v)) {
      if (!v[gid].pending) continue;
      const gs = await get(ref(db, 'games/' + gid));
      if (!gs.exists()) { await remove(ref(db, `userGames/${uid}/${gid}`)); continue; }
      await settle({ id: gid, ...gs.val() }, uid);
    }
  } catch { /* нет сети — попробуем в следующий раз */ }
}

export async function userGames(uid: string, n = 30): Promise<(UserGame & { id: string })[]> {
  const s = await get(query(ref(db, 'userGames/' + uid), orderByChild('date'), limitToLast(n)));
  const out: (UserGame & { id: string })[] = [];
  s.forEach((c) => { out.push({ id: c.key!, ...c.val() }); });
  return out.reverse();
}
export async function leaderboard(sp: Speed, n = 10): Promise<{ uid: string; name: string; rating: number; games: number }[]> {
  const s = await get(query(ref(db, 'users'), orderByChild('ratings/' + sp), limitToLast(60)));
  const out: { uid: string; name: string; rating: number; games: number }[] = [];
  s.forEach((c) => { const u = c.val(); if (u.games && u.games[sp] > 0) out.push({ uid: c.key!, name: u.name, rating: u.ratings[sp], games: u.games[sp] }); });
  return out.sort((a, b) => b.rating - a.rating).slice(0, n);
}

// название дебюта партии: последняя позиция из справочника дебютов
export function openingOf(g: { fen?: string; moves?: string }): string | null {
  if (g.fen) return null;
  const ms = g.moves ? g.moves.split(' ') : [];
  const p = newPos(START_FEN);
  let name: string | null = null;
  for (let i = 0; i < ms.length && i < 30; i++) {
    const m = p.uciToMove(ms[i]);
    if (!m) break;
    p.make(m);
    try { const n = p.openingName(); if (n) name = n; } catch { break; }
  }
  return name;
}

// ---------------------------------------------------------------- реванш и чат
// реванш: новая партия с теми же условиями и сменой цветов; если соперник уже предложил — принимаем его
export async function rematch(g: OGame, me: Profile): Promise<string | null> {
  const my: 0 | 1 = g.white === me.uid ? 0 : 1;
  const opp = my === 0 ? g.black : g.white;
  if (!opp) return null;
  if (g.rematch && g.rematch.by !== me.uid) {
    const r = await joinGame(g.rematch.gid, me);
    return r.committed ? g.rematch.gid : null;
  }
  if (g.rematch) return g.rematch.gid;
  const gid = await createFriendGame(g.tc, me, my === 0 ? 'black' : 'white', opp, { rated: g.rated, daily: g.daily });
  const t = await runTransaction(ref(db, `games/${g.id}/rematch`), (cur) => (cur ? undefined : { gid, by: me.uid }));
  if (!t.committed) { // соперник успел первым — принимаем его реванш
    await abort(gid);
    const other = t.snapshot.val() as { gid: string } | null;
    if (other) { const r = await joinGame(other.gid, me); return r.committed ? other.gid : null; }
    return null;
  }
  return gid;
}
export async function sendChat(gid: string, me: Profile, m: string) {
  await push(ref(db, `games/${gid}/chat`), { u: me.uid, n: me.name, m: m.slice(0, 200), t: Date.now() });
}

// идущие партии для наблюдения
export async function liveGames(n = 20): Promise<OGame[]> {
  const s = await get(query(ref(db, 'games'), orderByChild('status'), equalTo('started'), limitToLast(n)));
  const out: OGame[] = [];
  s.forEach((c) => { out.push({ id: c.key!, ...c.val() }); });
  return out.reverse();
}
