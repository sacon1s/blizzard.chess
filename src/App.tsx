// Каркас сайта: боковая панель (на телефоне — нижняя), маршруты по адресу после #.
import { useEffect, type ReactNode } from 'react';
import { useRoute, go } from './lib/router';
import { useAuth } from './lib/auth';
import { settlePending } from './lib/online';
import { useSettings } from './lib/store';
import { Icon } from './components/icons';
import Bots from './pages/Bots';
import BotGame from './pages/BotGame';
import Review from './pages/Review';
import Analysis from './pages/Analysis';
import Puzzles from './pages/Puzzles';
import Online from './pages/Online';
import OnlineGame from './pages/OnlineGame';
import Login from './pages/Login';
import Profile from './pages/Profile';
import SettingsPage from './pages/Settings';

const NAV: { path: string; label: string; icon: () => ReactNode; match: string[] }[] = [
  { path: '/', label: 'Play', icon: Icon.online, match: ['', 'online', 'game'] },
  { path: '/bots', label: 'Bots', icon: Icon.bot, match: ['bots', 'play'] },
  { path: '/puzzles', label: 'Puzzles', icon: Icon.puzzle, match: ['puzzles'] },
  { path: '/review', label: 'Review', icon: Icon.review, match: ['review'] },
  { path: '/analysis', label: 'Analysis', icon: Icon.analysis, match: ['analysis'] },
];

function Rail({ section }: { section: string }) {
  const { user, profile } = useAuth();
  const me = profile ? '/profile/' + profile.name : user ? '/login' : '/login';
  return (
    <nav className="rail" aria-label="Main">
      <a className="rail-brand" href="#/" aria-label="Blizzard Chess home">
        <img src="logo.svg" alt="" className="logo logo-light" />
        <img src="logo-dark.svg" alt="" className="logo logo-dark" />
        <span className="wordmark">Blizzard</span>
      </a>
      <div className="rail-items">
        {NAV.map((n) => (
          <a key={n.path} href={'#' + n.path} className={'rail-item' + (n.match.includes(section) ? ' on' : '')} aria-current={n.match.includes(section) ? 'page' : undefined}>
            {n.icon()}<span>{n.label}</span>
          </a>
        ))}
      </div>
      <div className="rail-foot">
        <a href="#/settings" className={'rail-item' + (section === 'settings' ? ' on' : '')}><Icon.gear /><span>Settings</span></a>
        <a href={'#' + me} className={'rail-item' + (section === 'profile' || section === 'login' ? ' on' : '')}>
          <Icon.user /><span>{profile ? profile.name : 'Sign in'}</span>
        </a>
      </div>
    </nav>
  );
}

export default function App() {
  const { parts, query } = useRoute();
  const section = parts[0] || '';
  const { user } = useAuth();
  const { skin } = useSettings();
  useEffect(() => { document.documentElement.dataset.skin = skin; }, [skin]);
  const uid = user ? user.uid : '';
  useEffect(() => { if (uid) settlePending(uid); }, [uid]);
  useEffect(() => {
    const titles: Record<string, string> = { '': 'Play online', online: 'Play online', game: 'Online game', bots: 'Play a bot', play: 'Bot game', puzzles: 'Puzzles', review: 'Game review', analysis: 'Analysis', login: 'Sign in', profile: 'Profile', settings: 'Settings' };
    document.title = titles[section] ? `${titles[section]} | Blizzard Chess` : 'Blizzard Chess';
  }, [section]);
  let page: ReactNode;
  switch (section) {
    case '': page = <Online />; break;
    case 'bots': page = <Bots />; break;
    case 'play': page = <BotGame query={query} />; break;
    case 'review': page = <Review id={parts[1]} />; break;
    case 'analysis': page = <Analysis query={query} />; break;
    case 'puzzles': page = <Puzzles />; break;
    case 'online': page = <Online />; break;
    case 'game': page = <OnlineGame id={parts[1]} />; break;
    case 'login': page = <Login />; break;
    case 'profile': page = <Profile name={parts[1]} />; break;
    case 'settings': page = <SettingsPage />; break;
    default: page = <NotFound />;
  }
  return (
    <div className="app">
      <Rail section={section} />
      <main className="main">{page}</main>
    </div>
  );
}

function NotFound() {
  return (
    <div className="page narrow">
      <h1>Page not found</h1>
      <p className="muted">This address doesn’t lead anywhere.</p>
      <button className="btn primary" onClick={() => go('/')}>Go to Play</button>
    </div>
  );
}
