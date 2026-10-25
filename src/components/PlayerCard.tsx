// Карточка игрока во время партии (по щелчку на имя или аватар): аватар, ник, страна, рейтинги, итоги,
// «Open profile» — профиль в новой вкладке, чтобы не уходить из партии.
import { useEffect, useRef, useState } from 'react';
import { getProfile, useAuth, guestName, type Profile as P, type Speed } from '../lib/auth';
import { SPEED_LABEL } from '../lib/online';
import { useOnlineSet } from '../lib/social';
import { AvatarImg, Flag } from './Avatar';
import { Icon } from './icons';
import { countryName } from '../lib/countries';
import { FriendButton } from '../pages/Profile';

const cache = new Map<string, P>();
const ICON: Record<Speed, () => JSX.Element> = { bullet: Icon.bullet, blitz: Icon.bolt, rapid: Icon.clock, classical: Icon.hourglass };

export function PlayerCard({ uid, speed, place, onClose }: { uid: string; speed?: Speed; place: 'top' | 'bottom'; onClose: () => void }) {
  const [p, setP] = useState<P | null | undefined>(() => cache.get(uid));
  const { profile: me } = useAuth();
  const online = useOnlineSet().has(uid);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let alive = true;
    getProfile(uid).then((x) => { if (x) cache.set(uid, x); if (alive) setP(x); }, () => alive && setP((v) => v || null));
    return () => { alive = false; };
  }, [uid]);
  useEffect(() => {
    const down = (e: PointerEvent) => { const t = e.target as Node; if (box.current && !box.current.contains(t) && !(t as Element).closest?.('.pbar-who')) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key); };
  }, [onClose]);
  const speeds: Speed[] = ['bullet', 'blitz', 'rapid', 'classical'];
  const total = p ? (p.wins || 0) + (p.draws || 0) + (p.losses || 0) : 0;
  const base = (window as unknown as { BLZ_PROFILE_BASE?: string }).BLZ_PROFILE_BASE || location.pathname;
  const href = p ? `${base}#/profile/${encodeURIComponent(p.name)}` : '#';
  return (
    <div className={'player-card ' + place} ref={box} role="dialog" aria-label={p ? p.name : 'Player'}>
      {p === undefined ? <p className="muted small">Loading…</p> : p === null ? (
        <div className="pc-head">
          <span className="ava-wrap"><AvatarImg size={56} />{online && <i className="ava-online" />}</span>
          <div><b className="pc-name">{guestName(uid)}</b><span className="pc-meta">Guest, playing without an account</span></div>
        </div>
      ) : (
        <>
          <div className="pc-head">
            <span className="ava-wrap"><AvatarImg avatar={p.avatar} photo={p.photo} size={56} />{online && <i className="ava-online" />}</span>
            <div>
              <b className="pc-name">{p.name}<Flag country={p.country} size={18} /></b>
              <span className="pc-meta">{online ? <span className="online-tag">Online</span> : null}{p.country ? countryName(p.country) : ''}{!online && !p.country ? `Joined ${new Date(p.created).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}` : ''}</span>
            </div>
          </div>
          <div className="pc-ratings">
            {speeds.map((sp) => {
              const I = ICON[sp];
              return <span key={sp} className={sp === speed ? 'cur' : ''}><I /><em>{SPEED_LABEL[sp]}</em><b>{p.ratings ? p.ratings[sp] : 1200}</b></span>;
            })}
            <span><Icon.puzzle /><em>Puzzles</em><b>{p.puzzle ? Math.round(p.puzzle.rating) : 1200}</b></span>
          </div>
          <p className="pc-games">{total} {total === 1 ? 'game' : 'games'}: <span className="w">{p.wins || 0} won</span>, {p.draws || 0} drawn, <span className="l">{p.losses || 0} lost</span></p>
          <div className="pc-actions">
            <a className="btn primary" href={href} target="_blank" rel="noopener">Open profile<Icon.next /></a>
            {me && me.uid !== uid && <FriendButton me={me} other={p} compact />}
          </div>
        </>
      )}
    </div>
  );
}
