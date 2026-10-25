// Каркас сайта: меню сверху (на телефоне — снизу), поиск игроков, уведомления о вызовах и заявках в друзья.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRoute, go } from './lib/router';
import { useAuth } from './lib/auth';
import { settlePending, joinGame, tcName } from './lib/online';
import { searchPlayers, useChallenges, useRequests, dropChallenge, acceptRequest, declineRequest } from './lib/social';
import { useSettings, settings } from './lib/store';
import { onAward, mergeRemote, ACHIEVEMENTS } from './lib/achievements';
import { Icon } from './components/icons';
import { AvatarImg } from './components/Avatar';
import { AchBadge } from './components/AchIcon';
import Play from './pages/Play';
import BotGame from './pages/BotGame';
import Review from './pages/Review';
import Analysis from './pages/Analysis';
import Puzzles from './pages/Puzzles';
import OnlineGame from './pages/OnlineGame';
import Login from './pages/Login';
import Profile from './pages/Profile';
import SettingsPage from './pages/Settings';
import Learn from './pages/Learn';
import Arena from './pages/Arena';

const NAV: { path: string; label: string; icon: () => ReactNode; match: string[] }[] = [
  { path: '/', label: 'Play', icon: Icon.online, match: ['', 'online', 'game', 'bots', 'play', 'review', 'arena'] },
  { path: '/puzzles', label: 'Puzzles', icon: Icon.puzzle, match: ['puzzles'] },
  { path: '/learn', label: 'Learn', icon: Icon.bulb, match: ['learn'] },
  { path: '/analysis', label: 'Analysis', icon: Icon.analysis, match: ['analysis'] },
];

function Search() {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<{ uid: string; name: string }[] | null>(null);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!q.trim()) { setRes(null); return; }
    const t = setTimeout(() => searchPlayers(q).then(setRes, () => setRes([])), 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    const f = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', f);
    return () => document.removeEventListener('pointerdown', f);
  }, []);
  const pick = (name: string) => { setQ(''); setOpen(false); go('/profile/' + name); };
  return (
    <div className="top-search" ref={box}>
      <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder="Search players" aria-label="Search players"
        onKeyDown={(e) => { if (e.key === 'Enter' && res && res[0]) pick(res[0].name); if (e.key === 'Escape') setOpen(false); }} />
      {open && res && (
        <div className="search-results drop">
          {res.length === 0 ? <p className="muted small">No players found.</p> : res.map((r) => <button key={r.uid} onClick={() => pick(r.name)}>{r.name}</button>)}
        </div>
      )}
    </div>
  );
}

function Rail({ section }: { section: string }) {
  const { user, profile } = useAuth();
  const requests = useRequests(profile ? profile.uid : null);
  const me = profile ? '/profile/' + profile.name : '/login';
  return (
    <nav className="rail" aria-label="Main">
      <a className="rail-brand" href="#/" aria-label="Blizzard Chess">
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
        {profile && <Search />}
        <a href="#/settings" className={'rail-item icon-only' + (section === 'settings' ? ' on' : '')} aria-label="Settings" title="Settings"><Icon.gear /></a>
        <a href={'#' + me} className={'rail-item' + (section === 'profile' || section === 'login' ? ' on' : '')}>
          {profile ? <AvatarImg avatar={profile.avatar} photo={profile.photo} size={22} /> : <Icon.user />}<span>{profile ? profile.name : user ? 'Account' : 'Sign in'}</span>
          {requests.length > 0 && <i className="badge-dot" aria-label={`${requests.length} friend requests`} />}
        </a>
      </div>
    </nav>
  );
}

// всплывающие вызовы и заявки в друзья
function Notifications() {
  const { profile } = useAuth();
  const uid = profile ? profile.uid : null;
  const challenges = useChallenges(uid);
  const requests = useRequests(uid);
  // заявку в друзья показываем всплывающей один раз; дальше она ждёт в профиле
  const [later, setLater] = useState<Set<string>>(() => { try { return new Set(JSON.parse(localStorage.getItem('bc.reqSeen') || '[]')); } catch { return new Set(); } });
  const hide = (id: string) => { const n = new Set(later).add(id); setLater(n); try { localStorage.setItem('bc.reqSeen', JSON.stringify([...n].slice(-200))); } catch { /* */ } };
  const [err, setErr] = useState('');
  const [achs, setAchs] = useState<string[]>([]);
  useEffect(() => onAward((id) => { setAchs((l) => [...l, id]); setTimeout(() => setAchs((l) => l.filter((x) => x !== id)), 6000); }), []);
  useEffect(() => { if (profile) mergeRemote(profile.ach); }, [profile && profile.uid]); // eslint-disable-line react-hooks/exhaustive-deps
  // уведомления браузера, когда вкладка свёрнута
  const seen = useRef(new Set<string>());
  useEffect(() => {
    const items = [...challenges.map((c) => ['c' + c.gid, `${c.name} challenges you to a ${tcName(c.tc)} game`]), ...requests.map((r) => ['r' + r.uid, `${r.name} wants to be your friend`])];
    for (const [id, text] of items) {
      if (seen.current.has(id)) continue;
      seen.current.add(id);
      if (settings.get().notify && document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        try { const n = new Notification('Blizzard Chess', { body: text, icon: 'icon-192.png', tag: id }); n.onclick = () => { window.focus(); n.close(); }; } catch { /* */ }
      }
    }
  }, [challenges, requests]);
  const achToasts = achs.map((id) => {
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    return a ? <div key={'a' + id} className="toast ach-toast"><AchBadge id={a.id} size={44} /><div><p><b>Achievement unlocked: {a.name}</b></p><p className="muted small">{a.text}</p></div></div> : null;
  });
  if (!profile) return achToasts.length ? <div className="toasts">{achToasts}</div> : null;
  const items = [
    ...challenges.map((c) => (
      <div key={'c' + c.gid} className="toast">
        <p><b>{c.name}</b> challenges you to a {tcName(c.tc)} game.</p>
        <div className="row">
          <button className="btn primary small-btn" onClick={() => joinGame(c.gid, profile).then((r) => {
            dropChallenge(profile.uid, c.gid).catch(() => {});
            if (r.committed) go('/game/' + c.gid); else setErr('This challenge is no longer open.');
          }, () => setErr('Couldn’t join. Check your connection.'))}>Accept</button>
          <button className="btn ghost small-btn" onClick={() => dropChallenge(profile.uid, c.gid).catch(() => {})}>Decline</button>
        </div>
      </div>
    )),
    ...requests.filter((r) => !later.has(r.uid)).map((r) => (
      <div key={'r' + r.uid} className="toast">
        <p><a href={'#/profile/' + r.name}>{r.name}</a> wants to be your friend.</p>
        <div className="row">
          <button className="btn primary small-btn" onClick={() => acceptRequest(profile, r.uid, r.name).catch(() => {})}>Accept</button>
          <button className="btn ghost small-btn" onClick={() => declineRequest(profile.uid, r.uid).catch(() => {})}>Decline</button>
          <button className="btn ghost small-btn" onClick={() => hide(r.uid)}>Later</button>
        </div>
      </div>
    )),
  ];
  if (!items.length && !err && !achToasts.length) return null;
  return (
    <div className="toasts" aria-live="polite">
      {achToasts}
      {err && <div className="toast"><p>{err}</p><button className="btn ghost small-btn" onClick={() => setErr('')}>OK</button></div>}
      {items}
    </div>
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
    const titles: Record<string, string> = { '': 'Play', online: 'Play', bots: 'Play a bot', game: 'Online game', play: 'Bot game', puzzles: 'Puzzles', learn: 'Learn', arena: 'Arena', review: 'Game review', analysis: 'Analysis', login: 'Sign in', profile: 'Profile', settings: 'Settings' };
    document.title = titles[section] ? `${titles[section]} | Blizzard Chess` : 'Blizzard Chess';
  }, [section]);
  let page: ReactNode;
  switch (section) {
    case '': case 'online': page = <Play />; break;
    case 'bots': page = <Play initialTab="bots" />; break;
    case 'play': page = <BotGame query={query} />; break;
    case 'review': page = <Review id={parts[1]} />; break;
    case 'analysis': page = <Analysis query={query} />; break;
    case 'puzzles': page = <Puzzles />; break;
    case 'game': page = <OnlineGame id={parts[1]} />; break;
    case 'login': page = <Login />; break;
    case 'profile': page = <Profile name={parts[1]} />; break;
    case 'settings': page = <SettingsPage />; break;
    case 'learn': page = <Learn />; break;
    case 'arena': page = <Arena id={parts[1]} />; break;
    default: page = <NotFound />;
  }
  return (
    <div className="app">
      <Rail section={section} />
      <main className="main">{page}</main>
      <Notifications />
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
