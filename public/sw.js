// Service worker: сайт открывается без сети и ставится как приложение.
// Из кэша сразу отдаются только файлы сборки из assets/ — в их именах хэш, они не меняются.
// Всё остальное (страница, движок engine/*.js, данные, картинки) — сначала из сети, чтобы обновления
// приходили сразу; кэш — только когда сети нет. Новое имя кэша при смене правил стирает старый кэш.
const CACHE = 'blizzard-chess-v2';
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
const put = (req, r) => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then((x) => x.put(req, c)); } return r; };
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // Firebase и прочее — напрямую
  if (url.pathname.includes('/assets/')) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => put(req, r))));
  } else {
    e.respondWith(fetch(req).then((r) => put(req, r)).catch(() => caches.match(req)));
  }
});
