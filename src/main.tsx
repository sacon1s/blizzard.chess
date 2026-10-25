import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { settings } from './lib/store';

document.documentElement.dataset.skin = settings.get().skin;

createRoot(document.getElementById('root')!).render(<App />);

// установка как приложение и работа без сети
if ('serviceWorker' in navigator && location.hostname !== 'localhost') {
  // новая версия service worker взяла страницу: файлы (движок и др.) могли прийти из старого кэша —
  // один раз перезагрузить, если не идёт партия
  const had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!had) return;
    const sec = location.hash.replace(/^#\/?/, '').split('/')[0];
    if (['game', 'play', 'online', 'arena', 'bots'].includes(sec)) return;
    try { if (sessionStorage.getItem('sw-reload')) return; sessionStorage.setItem('sw-reload', '1'); } catch (e) { return; }
    location.reload();
  });
  // нажали на уведомление, а сайт уже открыт: перейти к партии
  navigator.serviceWorker.addEventListener('message', (e) => {
    const u = e.data && typeof e.data.open === 'string' ? e.data.open : '';
    if (u.startsWith(location.origin)) { const h = u.indexOf('#'); if (h >= 0) location.hash = u.slice(h); else location.href = u; }
  });
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
