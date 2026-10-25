// Уведомления, когда сайт закрыт: Web Push через посредника (push-worker/worker.js, Cloudflare Worker).
// Адрес посредника — в config.json рядом с сайтом ({ "pushUrl": "https://…workers.dev" }); пока он пуст,
// уведомления приходят только при открытой вкладке.
// После своего действия (ход в партии по переписке, вызов, заявка в друзья) сайт просит посредника
// уведомить соперника; посредник сам проверяет по базе, что событие настоящее.
import { auth } from './firebase';
import { settings } from './store';

let cfg: Promise<string> | null = null;
export function pushUrl(): Promise<string> {
  if (!cfg) {
    cfg = fetch('config.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : {}))
      .then((c: { pushUrl?: unknown }) => (typeof c.pushUrl === 'string' && /^https:\/\//.test(c.pushUrl) ? c.pushUrl.replace(/\/+$/, '') : ''), () => '');
  }
  return cfg;
}
export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const b64u = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function unb64u(s: string): Uint8Array {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const r = atob(s), out = new Uint8Array(r.length);
  for (let i = 0; i < r.length; i++) out[i] = r.charCodeAt(i);
  return out;
}

async function post(path: string, body: object): Promise<{ ok?: boolean } | null> {
  const url = await pushUrl(), u = auth.currentUser;
  if (!url || !u) return null;
  const token = await u.getIdToken();
  const r = await fetch(url + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, ...body }), keepalive: true });
  return r.ok ? r.json() : null;
}

const within = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
async function subscription(url: string): Promise<PushSubscription> {
  const reg = await within(navigator.serviceWorker.ready, 8000); // нет service worker (например, localhost) — не ждать вечно
  const { key } = await (await fetch(url + '/key')).json();
  let sub = await reg.pushManager.getSubscription();
  const old = sub && sub.options.applicationServerKey;
  if (sub && old && b64u(old) !== key) { await sub.unsubscribe().catch(() => {}); sub = null; }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: unb64u(key) as BufferSource });
  return sub;
}

// включить уведомления; вернуть текст ошибки или null
export async function enableNotifications(): Promise<string | null> {
  if (!('Notification' in window)) return 'This browser can’t show notifications.';
  const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (perm !== 'granted') return 'Notifications are blocked for this site. Allow them in the browser’s site settings.';
  settings.set({ notify: true });
  const url = await pushUrl();
  if (!url || !pushSupported() || !auth.currentUser) return null; // только при открытой вкладке
  try {
    const sub = await subscription(url);
    const r = await post('/subscribe', { sub: sub.toJSON() });
    if (!r) return 'Turned on while the site is open. The notification server didn’t answer, so nothing will arrive while it’s closed. Try again later.';
    settings.set({ push: true });
  } catch {
    return 'Turned on while the site is open. This browser didn’t allow notifications while it’s closed.';
  }
  return null;
}
export async function disableNotifications() {
  settings.set({ notify: false, push: false });
  await dropSubscription();
}
async function dropSubscription() {
  try {
    if (!pushSupported()) return;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && await reg.pushManager.getSubscription();
    if (!sub) return;
    await post('/unsubscribe', { endpoint: sub.endpoint }).catch(() => null);
    await sub.unsubscribe();
  } catch { /* */ }
}
// перед выходом из аккаунта: это устройство больше не получает уведомления этого игрока
export async function forgetDevice() { if (settings.get().push) await dropSubscription(); }
// после входа: подписка этого устройства закрепляется за вошедшим игроком (и обновляется, если сменился ключ)
export async function refreshSubscription() {
  if (!settings.get().push || !pushSupported() || Notification.permission !== 'granted') return;
  const url = await pushUrl();
  if (!url) return;
  try { const sub = await subscription(url); await post('/subscribe', { sub: sub.toJSON() }); } catch { /* */ }
}

// попросить посредника уведомить игрока to
export function notifyPlayer(kind: 'move' | 'end' | 'challenge' | 'friend', to: string | undefined, gid?: string) {
  if (!to) return;
  post('/notify', { kind, to, ...(gid ? { gid } : {}) }).catch(() => null);
}
