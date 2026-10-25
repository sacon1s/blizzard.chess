// Blizzard Chess: push-уведомления, когда сайт закрыт. Cloudflare Worker без зависимостей.
//
// Сайт после действия игрока (ход в партии по переписке, вызов, заявка в друзья) просит посредника
// отправить уведомление сопернику. Посредник проверяет вход игрока (токен Firebase), проверяет по базе,
// что событие настоящее, и шлёт Web Push на все устройства получателя.
//
// Хранилище — Cloudflare KV, привязка с именем PUSH:
//   vapid      — ключи VAPID (создаются сами при первом запросе)
//   s:<uid>    — подписки устройств игрока (до 5)
//
//   GET  /key           → { key }                     публичный ключ VAPID для подписки
//   POST /subscribe     { token, sub }                 добавить устройство
//   POST /unsubscribe   { token, endpoint }            убрать устройство
//   POST /notify        { token, kind, to, gid? }      kind: move | end | challenge | friend

const PROJECT = 'golden-shine-484213-f9';
const DB = 'https://golden-shine-484213-f9-default-rtdb.europe-west1.firebasedatabase.app';
const SITE = 'https://sacon1s.github.io/blizzard.chess/';
const ORIGINS = ['https://sacon1s.github.io', 'http://localhost:5173', 'http://localhost:4173', 'http://127.0.0.1:8765'];
const MAX_SUBS = 5;

// ---------------------------------------------------------------- base64url и байты
const enc = new TextEncoder();
const b64u = (buf) => { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = (s) => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const r = atob(s), b = new Uint8Array(r.length); for (let i = 0; i < r.length; i++) b[i] = r.charCodeAt(i); return b; };
const concat = (...xs) => { const n = xs.reduce((a, x) => a + x.length, 0), out = new Uint8Array(n); let o = 0; for (const x of xs) { out.set(x, o); o += x.length; } return out; };

// ---------------------------------------------------------------- Web Push: шифрование aes128gcm (RFC 8291)
async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}
const expand = async (prk, info, len) => (await hmac(prk, concat(info, new Uint8Array([1])))).slice(0, len);

// test: { asKeys: CryptoKeyPair, salt } — только для проверки по примеру из RFC
export async function encryptPayload(payload, p256dh, authSecret, test) {
  const ua = unb64u(p256dh), auth = unb64u(authSecret);
  const as = test ? test.asKeys : await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', ua, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));
  const prkKey = await hmac(auth, shared);
  const ikm = await expand(prkKey, concat(enc.encode('WebPush: info\0'), ua, asPub), 32);
  const salt = test ? test.salt : crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = await expand(prk, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await expand(prk, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(enc.encode(payload), new Uint8Array([2]))));
  const head = new Uint8Array(21); head.set(salt, 0); new DataView(head.buffer).setUint32(16, 4096); head[20] = asPub.length;
  return concat(head, asPub, ct);
}

// ---------------------------------------------------------------- VAPID (RFC 8292)
let vapidCache = null;
async function vapid(env) {
  if (vapidCache) return vapidCache;
  let v = await env.PUSH.get('vapid', 'json');
  if (!v) {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    v = { priv: await crypto.subtle.exportKey('jwk', kp.privateKey), pub: b64u(await crypto.subtle.exportKey('raw', kp.publicKey)) };
    await env.PUSH.put('vapid', JSON.stringify(v));
  }
  const key = await crypto.subtle.importKey('jwk', v.priv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  vapidCache = { key, pub: v.pub };
  return vapidCache;
}
async function vapidHeader(env, endpoint) {
  const { key, pub } = await vapid(env);
  const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: SITE })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(head + '.' + body));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${pub}`;
}

// отправить одно уведомление; false — подписка больше не действует
async function sendPush(env, sub, payload) {
  const body = await encryptPayload(JSON.stringify(payload), sub.keys.p256dh, sub.keys.auth);
  const r = await fetch(sub.endpoint, {
    method: 'POST',
    headers: { Authorization: await vapidHeader(env, sub.endpoint), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: 'normal' },
    body,
  });
  return !(r.status === 404 || r.status === 410);
}

// ---------------------------------------------------------------- вход: токен Firebase
let jwks = null, jwksUntil = 0;
async function googleKeys() {
  if (jwks && Date.now() < jwksUntil) return jwks;
  const r = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
  const m = /max-age=(\d+)/.exec(r.headers.get('cache-control') || '');
  jwks = (await r.json()).keys;
  jwksUntil = Date.now() + (m ? +m[1] : 3600) * 1000;
  return jwks;
}
// uid игрока или null
export async function verifyToken(token, keys) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  let head, body;
  try { head = JSON.parse(new TextDecoder().decode(unb64u(parts[0]))); body = JSON.parse(new TextDecoder().decode(unb64u(parts[1]))); } catch { return null; }
  if (head.alg !== 'RS256') return null;
  const jwk = (keys || await googleKeys()).find((k) => k.kid === head.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, unb64u(parts[2]), enc.encode(parts[0] + '.' + parts[1]));
  const now = Math.floor(Date.now() / 1000);
  if (!ok || body.aud !== PROJECT || body.iss !== 'https://securetoken.google.com/' + PROJECT || !(body.exp > now) || !(body.iat <= now + 60) || !body.sub) return null;
  return body.sub;
}

// ---------------------------------------------------------------- база (чтение от имени игрока)
async function dbGet(path, token) {
  const r = await fetch(`${DB}/${path}.json?auth=${encodeURIComponent(token)}`);
  return r.ok ? r.json() : null;
}
const tcText = (tc) => { if (/d$/.test(tc)) { const n = parseInt(tc, 10); return n === 1 ? '1 day' : `${n} days`; } const [m, s] = String(tc).split('+'); return s && s !== '0' ? `${m} + ${s}` : `${m} min`; };
const validId = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(s);

// проверить событие; вернуть уведомление или null
async function eventFor(kind, from, to, gid, token) {
  if (kind === 'move' || kind === 'end') {
    if (!validId(gid)) return null;
    const g = await dbGet('games/' + gid, token);
    if (!g || !g.daily || (g.white !== from && g.black !== from) || (g.white !== to && g.black !== to) || from === to) return null;
    const n = g.moves ? g.moves.split(' ').length : 0;
    const name = from === g.white ? g.wName : g.bName;
    if (kind === 'move') {
      if (g.status !== 'started' || (n % 2 === 0 ? g.white : g.black) !== to) return null;
      return { title: `${name || 'Your opponent'} moved`, body: 'Your move in your daily game.', url: `${SITE}#/game/${gid}`, tag: 'm' + gid };
    }
    if (g.status !== 'over' || !g.result) return null;
    const youWon = (g.result === '1-0') === (g.white === to) && g.result !== '1/2-1/2';
    const res = g.result === '1/2-1/2' ? 'Draw' : youWon ? 'You won' : 'You lost';
    return { title: `Game over: ${res}`, body: `Your daily game against ${name || 'your opponent'} has ended.`, url: `${SITE}#/game/${gid}`, tag: 'm' + gid };
  }
  if (kind === 'challenge') {
    if (!validId(gid)) return null;
    const c = await dbGet(`challenges/${to}/${gid}`, token);
    if (!c || c.from !== from) return null;
    return { title: `${c.name} challenges you`, body: `${tcText(c.tc)} game. Open Blizzard Chess to accept.`, url: SITE + '#/', tag: 'c' + gid };
  }
  if (kind === 'friend') {
    const q = await dbGet(`friendRequests/${to}/${from}`, token);
    if (!q) return null;
    return { title: 'Friend request', body: `${q.name} wants to be your friend.`, url: SITE + '#/', tag: 'r' + from };
  }
  return null;
}

// ---------------------------------------------------------------- HTTP
function cors(req) {
  const o = req.headers.get('Origin') || '';
  return { 'Access-Control-Allow-Origin': ORIGINS.includes(o) ? o : ORIGINS[0], 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' };
}
const json = (req, x, status = 200) => new Response(JSON.stringify(x), { status, headers: { 'Content-Type': 'application/json', ...cors(req) } });

async function handle(req, env) {
  const url = new URL(req.url);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
  if (req.method === 'GET' && url.pathname === '/key') return json(req, { key: (await vapid(env)).pub });
  if (req.method === 'GET' && url.pathname === '/') return json(req, { ok: true, service: 'Blizzard Chess notifications' });
  if (req.method !== 'POST') return json(req, { error: 'not found' }, 404);
  let b;
  try { b = await req.json(); } catch { return json(req, { error: 'bad json' }, 400); }
  const uid = await verifyToken(b.token);
  if (!uid) return json(req, { error: 'sign in' }, 401);

  if (url.pathname === '/subscribe') {
    const s = b.sub;
    if (!s || typeof s.endpoint !== 'string' || !/^https:\/\//.test(s.endpoint) || s.endpoint.length > 1000 || !s.keys || typeof s.keys.p256dh !== 'string' || typeof s.keys.auth !== 'string') return json(req, { error: 'bad subscription' }, 400);
    const list = ((await env.PUSH.get('s:' + uid, 'json')) || []).filter((x) => x.endpoint !== s.endpoint);
    list.push({ endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } });
    await env.PUSH.put('s:' + uid, JSON.stringify(list.slice(-MAX_SUBS)));
    return json(req, { ok: true });
  }
  if (url.pathname === '/unsubscribe') {
    const list = (await env.PUSH.get('s:' + uid, 'json')) || [];
    const left = list.filter((x) => x.endpoint !== b.endpoint);
    if (left.length !== list.length) { if (left.length) await env.PUSH.put('s:' + uid, JSON.stringify(left)); else await env.PUSH.delete('s:' + uid); }
    return json(req, { ok: true });
  }
  if (url.pathname === '/notify') {
    if (!validId(b.to)) return json(req, { error: 'bad target' }, 400);
    const ev = await eventFor(b.kind, uid, b.to, b.gid, b.token);
    if (!ev) return json(req, { error: 'nothing to notify' }, 403);
    const list = (await env.PUSH.get('s:' + b.to, 'json')) || [];
    if (!list.length) return json(req, { ok: true, sent: 0 });
    const alive = [];
    for (const s of list) { try { if (await sendPush(env, s, ev)) alive.push(s); } catch { alive.push(s); } }
    if (alive.length !== list.length) { if (alive.length) await env.PUSH.put('s:' + b.to, JSON.stringify(alive)); else await env.PUSH.delete('s:' + b.to); }
    return json(req, { ok: true, sent: alive.length });
  }
  return json(req, { error: 'not found' }, 404);
}

export default {
  async fetch(req, env) {
    try { return await handle(req, env); } catch (e) { return json(req, { error: 'server error' }, 500); }
  },
};
