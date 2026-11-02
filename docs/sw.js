// Сайт закрыт на переделку: этот service worker удаляет себя и кэш прежнего приложения,
// чтобы у тех, кто заходил раньше, открывалась эта страница, а не старая версия из кэша.
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) await caches.delete(k);
    await self.registration.unregister();
    for (const c of await self.clients.matchAll({ type: 'window' })) { try { c.navigate(c.url); } catch (_) { /* */ } }
  })());
});
