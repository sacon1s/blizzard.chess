// Отдельная страница разбора партий для сайта движка Blizzard (sacon1s.github.io/blizzard/review/).
import { createRoot } from 'react-dom/client';
import ReviewApp from './review-app/ReviewApp';
import './styles.css';
import { settings } from './lib/store';

document.documentElement.dataset.skin = settings.get().skin;
createRoot(document.getElementById('root')!).render(<ReviewApp />);
