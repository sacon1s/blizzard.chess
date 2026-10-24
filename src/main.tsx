import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { settings } from './lib/store';

document.documentElement.dataset.skin = settings.get().skin;

createRoot(document.getElementById('root')!).render(<App />);
