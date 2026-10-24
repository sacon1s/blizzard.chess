// Профиль игрока (рейтинги и партии появятся вместе с игрой онлайн).
import { useAuth, logOut } from '../lib/auth';
import { go } from '../lib/router';

export default function Profile({ name }: { name?: string }) {
  const { profile } = useAuth();
  const mine = profile && name && profile.name.toLowerCase() === name.toLowerCase();
  return (
    <div className="page narrow">
      <header className="page-head"><h1>{name || 'Profile'}</h1></header>
      {mine && <button className="btn" onClick={() => { logOut(); go('/'); }}>Sign out</button>}
    </div>
  );
}
