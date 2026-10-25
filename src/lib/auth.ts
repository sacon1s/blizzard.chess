// Аккаунт: вход, профиль (имя, рейтинги), присутствие на сайте.
import { useSyncExternalStore } from 'react';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile, signInAnonymously, linkWithPopup, linkWithCredential, signInWithCredential, EmailAuthProvider, type User } from 'firebase/auth';
import { ref, onValue, get, set, runTransaction, onDisconnect, serverTimestamp, update } from 'firebase/database';
import { auth, db } from './firebase';

export type Speed = 'bullet' | 'blitz' | 'rapid' | 'classical';
export interface Profile {
  uid: string; name: string; created: number; country?: string; bio?: string;
  ratings: Record<Speed, number>; games: Record<Speed, number>; wins: number; draws: number; losses: number;
  puzzle?: { rating: number; solved: number; failed: number };
  avatar?: string; photo?: string; about?: string; rush?: number; ach?: Record<string, number>;
  hist?: Partial<Record<Speed, Record<string, { r: number; t: number }>>>;
  guest?: boolean; // гость без аккаунта: только партии без рейтинга
}
export const DEFAULT_RATING = 1200;
export function speedOf(base: number, inc: number): Speed {
  const t = base / 1000 + 40 * inc / 1000;
  return t < 180 ? 'bullet' : t < 480 ? 'blitz' : t < 1500 ? 'rapid' : 'classical';
}

// user — вход Firebase (может быть гостевым); profile — профиль зарегистрированного игрока;
// me — кто играет: профиль или гость (для партий по ссылке, реванша, чата)
interface AuthState { user: User | null; profile: Profile | null; me: Profile | null; guest: boolean; loading: boolean }
let state: AuthState = { user: null, profile: null, me: null, guest: false, loading: true };
const subs = new Set<() => void>();
const emit = (patch: Partial<AuthState>) => { state = { ...state, ...patch }; subs.forEach((f) => f()); };
let unsubProfile: (() => void) | null = null;

// имя гостя: «Guest» и четыре цифры из uid (у одного гостя всегда одно и то же)
export function guestName(uid: string) { let h = 0; for (const ch of uid) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return 'Guest' + (1000 + (h % 9000)); }
const guestProfile = (uid: string): Profile => ({ uid, name: guestName(uid), created: 0, ratings: {} as Record<Speed, number>, games: {} as Record<Speed, number>, wins: 0, draws: 0, losses: 0, guest: true });

function handleUser(user: User | null) {
  if (unsubProfile) { unsubProfile(); unsubProfile = null; }
  emit({ user, profile: null, me: null, guest: !!user && user.isAnonymous, loading: !!user });
  if (!user) { emit({ loading: false }); return; }
  if (user.isAnonymous) emit({ me: guestProfile(user.uid), loading: false });
  else {
    unsubProfile = onValue(ref(db, 'users/' + user.uid), (snap) => {
      const p = snap.exists() ? ({ uid: user.uid, ...snap.val() } as Profile) : null;
      emit({ profile: p, me: p, loading: false });
    }, () => emit({ loading: false }));
  }
  // присутствие: пока вкладка открыта, пользователь «на сайте»
  const pres = ref(db, 'online/' + user.uid);
  set(pres, serverTimestamp()).catch(() => {});
  onDisconnect(pres).remove().catch(() => {});
}
onAuthStateChanged(auth, handleUser);

// играть без регистрации (анонимный вход Firebase); вернуть текст ошибки или null
export async function playAsGuest(): Promise<string | null> {
  if (auth.currentUser) return null;
  try { await signInAnonymously(auth); return null; } catch (e) {
    const code = String((e as { code?: string }).code || '');
    return code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation' ? 'Playing as a guest isn’t available yet. Sign in to play.' : 'Couldn’t start a guest session. Check your connection.';
  }
}
// гость создаёт аккаунт: тот же uid, партии гостя остаются за ним
async function afterLink(u: User) { await u.getIdToken(true); handleUser(u); }

export function waitForMe(ms = 10000): Promise<Profile | null> {
  if (state.me) return Promise.resolve(state.me);
  return new Promise((res) => {
    const f = () => { if (state.me) { subs.delete(f); clearTimeout(t); res(state.me); } };
    const t = setTimeout(() => { subs.delete(f); res(state.me); }, ms);
    subs.add(f);
  });
}
// играющий: свой профиль или, если не вошёл, гость (вход гостем по требованию)
export async function meOrGuest(): Promise<{ me: Profile | null; err: string | null }> {
  if (state.me) return { me: state.me, err: null };
  if (state.user && !state.user.isAnonymous) return { me: null, err: 'Choose a username first.' };
  const err = await playAsGuest();
  if (err) return { me: null, err };
  const me = await waitForMe();
  return { me, err: me ? null : 'Couldn’t start a guest session. Check your connection.' };
}

export function useAuth(): AuthState {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state);
}

export async function signInGoogle() {
  const cur = auth.currentUser;
  if (!cur || !cur.isAnonymous) return signInWithPopup(auth, new GoogleAuthProvider());
  try { const r = await linkWithPopup(cur, new GoogleAuthProvider()); await afterLink(r.user); return r; } catch (e) {
    // этот Google-аккаунт уже есть — просто войти в него (гостевые партии остаются у гостя)
    const cred = GoogleAuthProvider.credentialFromError(e as never);
    if ((e as { code?: string }).code === 'auth/credential-already-in-use' && cred) return signInWithCredential(auth, cred);
    throw e;
  }
}
export const signInEmail = (email: string, pass: string) => signInWithEmailAndPassword(auth, email, pass);
export async function signUpEmail(email: string, pass: string) {
  const cur = auth.currentUser;
  if (!cur || !cur.isAnonymous) return createUserWithEmailAndPassword(auth, email, pass);
  const r = await linkWithCredential(cur, EmailAuthProvider.credential(email, pass));
  await afterLink(r.user);
  return r;
}
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
