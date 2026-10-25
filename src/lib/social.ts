// Игроки: поиск по имени, друзья (запрос → принятие), вызовы друзей на партию.
//   friendRequests/<кому>/<от кого> = { name, t }
//   friends/<uid>/<друг> = { name, since }
//   challenges/<кому>/<id партии> = { from, name, tc, t }
import { useEffect, useState } from 'react';
import { ref, get, set, update, remove, onValue, query, orderByKey, startAt, endAt, limitToFirst, serverTimestamp } from 'firebase/database';
import { db } from './firebase';
import type { Profile } from './auth';
import { award } from './achievements';
import { notifyPlayer } from './push';

export async function searchPlayers(prefix: string): Promise<{ uid: string; name: string }[]> {
  const p = prefix.trim().toLowerCase();
  if (!p || !/^[a-z0-9_-]+$/.test(p)) return [];
  const s = await get(query(ref(db, 'names'), orderByKey(), startAt(p), endAt(p + ''), limitToFirst(8)));
  const uids: string[] = [];
  s.forEach((c) => { uids.push(c.val()); });
  const names = await Promise.all(uids.map((u) => get(ref(db, `users/${u}/name`)).then((x) => x.val() as string | null, () => null)));
  return uids.map((uid, i) => ({ uid, name: names[i] || '' })).filter((x) => x.name);
}

export type FriendState = 'none' | 'sent' | 'received' | 'friends';
export function useFriendState(me: string | null, other: string | null): FriendState | null {
  const [st, setSt] = useState<FriendState | null>(null);
  useEffect(() => {
    if (!me || !other || me === other) { setSt(null); return; }
    let f = false, sent = false, recv = false;
    const upd = () => setSt(f ? 'friends' : recv ? 'received' : sent ? 'sent' : 'none');
    const u1 = onValue(ref(db, `friends/${me}/${other}`), (s) => { f = s.exists(); upd(); }, () => {});
    const u2 = onValue(ref(db, `friendRequests/${other}/${me}`), (s) => { sent = s.exists(); upd(); }, () => {});
    const u3 = onValue(ref(db, `friendRequests/${me}/${other}`), (s) => { recv = s.exists(); upd(); }, () => {});
    return () => { u1(); u2(); u3(); };
  }, [me, other]);
  return st;
}
export const sendRequest = (me: Profile, to: string) => set(ref(db, `friendRequests/${to}/${me.uid}`), { name: me.name, t: serverTimestamp() }).then(() => notifyPlayer('friend', to));
export const cancelRequest = (me: string, to: string) => remove(ref(db, `friendRequests/${to}/${me}`));
export const declineRequest = (me: string, from: string) => remove(ref(db, `friendRequests/${me}/${from}`));
export function acceptRequest(me: Profile, from: string, fromName: string) {
  const now = Date.now();
  award('friend1');
  return update(ref(db), {
    [`friends/${from}/${me.uid}`]: { name: me.name, since: now },
    [`friends/${me.uid}/${from}`]: { name: fromName, since: now },
    [`friendRequests/${me.uid}/${from}`]: null,
  });
}
export const removeFriend = (me: string, other: string) => update(ref(db), { [`friends/${me}/${other}`]: null, [`friends/${other}/${me}`]: null });

export interface Friend { uid: string; name: string; since: number }
export function useFriends(uid: string | null): Friend[] | null {
  const [list, setList] = useState<Friend[] | null>(null);
  useEffect(() => {
    if (!uid) { setList(null); return; }
    return onValue(ref(db, `friends/${uid}`), (s) => {
      const v = s.val() || {};
      setList(Object.keys(v).map((k) => ({ uid: k, name: v[k].name, since: v[k].since })).sort((a, b) => a.name.localeCompare(b.name)));
    }, () => setList([]));
  }, [uid]);
  return list;
}
export interface Request { uid: string; name: string; t: number }
export function useRequests(uid: string | null): Request[] {
  const [list, setList] = useState<Request[]>([]);
  useEffect(() => {
    if (!uid) { setList([]); return; }
    return onValue(ref(db, `friendRequests/${uid}`), (s) => {
      const v = s.val() || {};
      setList(Object.keys(v).map((k) => ({ uid: k, name: v[k].name, t: v[k].t })));
    }, () => setList([]));
  }, [uid]);
  return list;
}
// кто из списка сейчас на сайте
export function useOnlineSet(): Set<string> {
  const [s, setS] = useState<Set<string>>(new Set());
  useEffect(() => onValue(ref(db, 'online'), (x) => setS(new Set(Object.keys(x.val() || {}))), () => {}), []);
  return s;
}

export interface Challenge { gid: string; from: string; name: string; tc: string; t: number }
export const sendChallenge = (to: string, gid: string, me: Profile, tc: string) => set(ref(db, `challenges/${to}/${gid}`), { from: me.uid, name: me.name, tc, t: serverTimestamp() }).then(() => notifyPlayer('challenge', to, gid));
export const dropChallenge = (to: string, gid: string) => remove(ref(db, `challenges/${to}/${gid}`));
export function useChallenges(uid: string | null): Challenge[] {
  const [list, setList] = useState<Challenge[]>([]);
  useEffect(() => {
    if (!uid) { setList([]); return; }
    return onValue(ref(db, `challenges/${uid}`), (s) => {
      const v = s.val() || {};
      setList(Object.keys(v).map((k) => ({ gid: k, ...v[k] })));
    }, () => setList([]));
  }, [uid]);
  return list;
}
