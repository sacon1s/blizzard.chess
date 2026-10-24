import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { settings } from './lib/store';

document.documentElement.dataset.skin = settings.get().skin;

createRoot(document.getElementById('root')!).render(<App />);

// установка как приложение и работа без сети
if ('serviceWorker' in navigator && location.hostname !== 'localhost') navigator.serviceWorker.register('sw.js').catch(() => {});
