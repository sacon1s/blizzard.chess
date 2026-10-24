// Аккаунт: вход, профиль (имя, рейтинги), присутствие на сайте.
import { useSyncExternalStore } from 'react';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile, type User } from 'firebase/auth';
import { ref, onValue, get, set, runTransaction, onDisconnect, serverTimestamp, update } from 'firebase/database';
import { auth, db } from './firebase';

export type Speed = 'bullet' | 'blitz' | 'rapid' | 'classical';
export interface Profile {
  uid: string; name: string; created: number; country?: string; bio?: string;
  ratings: Record<Speed, number>; games: Record<Speed, number>; wins: number; draws: number; losses: number;
  puzzle?: { rating: number; solved: number; failed: number };
}
export const DEFAULT_RATING = 1200;
export function speedOf(base: number, inc: number): Speed {
  const t = base / 1000 + 40 * inc / 1000;
  return t < 180 ? 'bullet' : t < 480 ? 'blitz' : t < 1500 ? 'rapid' : 'classical';
}

interface AuthState { user: User | null; profile: Profile | null; loading: boolean }
let state: AuthState = { user: null, profile: null, loading: true };
const subs = new Set<() => void>();
const emit = (patch: Partial<AuthState>) => { state = { ...state, ...patch }; subs.forEach((f) => f()); };
let unsubProfile: (() => void) | null = null;

onAuthStateChanged(auth, (user) => {
  if (unsubProfile) { unsubProfile(); unsubProfile = null; }
  emit({ user, profile: null, loading: !!user });
  if (!user) { emit({ loading: false }); return; }
  unsubProfile = onValue(ref(db, 'users/' + user.uid), (snap) => {
    emit({ profile: snap.exists() ? ({ uid: user.uid, ...snap.val() } as Profile) : null, loading: false });
  }, () => emit({ loading: false }));
  // присутствие: пока вкладка открыта, пользователь «на сайте»
  const pres = ref(db, 'online/' + user.uid);
  set(pres, serverTimestamp()).catch(() => {});
  onDisconnect(pres).remove().catch(() => {});
});

export function useAuth(): AuthState {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state);
}

export const signInGoogle = () => signInWithPopup(auth, new GoogleAuthProvider());
export const signInEmail = (email: string, pass: string) => signInWithEmailAndPassword(auth, email, pass);
export const signUpEmail = (email: string, pass: string) => createUserWithEmailAndPassword(auth, email, pass);
export const logOut = () => signOut(auth);

export function nameError(name: string): string | null {
  if (!/^[A-Za-z0-9_-]{3,20}$/.test(name)) return 'Use 3–20 letters, digits, - or _.';
  return null;
}
// имя закрепляется за аккаунтом через names/<имя в нижнем регистре>
export async function createProfile(name: string): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return 'Sign in first.';
  const err = nameError(name);
  if (err) return err;
  const key = name.toLowerCase();
  const res = await runTransaction(ref(db, 'names/' + key), (cur) => (cur === null || cur === user.uid ? user.uid : undefined));
  if (!res.committed) return 'This name is taken.';
  const zero = { bullet: 0, blitz: 0, rapid: 0, classical: 0 };
  const r = DEFAULT_RATING;
  await set(ref(db, 'users/' + user.uid), {
    name, created: Date.now(), ratings: { bullet: r, blitz: r, rapid: r, classical: r }, games: zero, wins: 0, draws: 0, losses: 0,
  });
  updateProfile(user, { displayName: name }).catch(() => {});
  return null;
}
export async function updateBio(patch: { bio?: string; country?: string }) {
  const user = auth.currentUser;
  if (!user) return;
  await update(ref(db, 'users/' + user.uid), patch);
}
export async function getProfile(uid: string): Promise<Profile | null> {
  const s = await get(ref(db, 'users/' + uid));
  return s.exists() ? ({ uid, ...s.val() } as Profile) : null;
}
export async function uidByName(name: string): Promise<string | null> {
  const s = await get(ref(db, 'names/' + name.toLowerCase()));
  return s.exists() ? s.val() : null;
}

// число игроков на сайте
export function useOnlineCount(): number | null {
  return useSyncExternalStore(onlineSub, () => onlineCount);
}
let onlineCount: number | null = null;
const onlineSubs = new Set<() => void>();
let onlineUnsub: (() => void) | null = null;
function onlineSub(f: () => void) {
  onlineSubs.add(f);
  if (!onlineUnsub) onlineUnsub = onValue(ref(db, 'online'), (s) => { onlineCount = s.exists() ? Object.keys(s.val()).length : 0; onlineSubs.forEach((g) => g()); }, () => {});
  return () => { onlineSubs.delete(f); };
}
