// Аватар игрока: фигура на цветном фоне (выбирается в профиле) и флаг страны.
import { useEffect, useState } from 'react';
import { ref, onValue } from 'firebase/database';
import { db } from '../lib/firebase';
import { Icon } from './icons';
import { pieceImgs } from '../lib/pieces';
import { useSettings } from '../lib/store';
import { countryName } from '../lib/countries';

export const AVATAR_COLORS = ['#3d8ad6', '#4fae5a', '#e0463f', '#ec8130', '#8f84dc', '#2bc0d0', '#e0558c', '#6b6b6b'];
export const AVATAR_PIECES = ['K', 'Q', 'R', 'B', 'N', 'P'];

// avatar — строка вида «N3»: фигура и номер цвета
export function AvatarImg({ avatar, size = 36 }: { avatar?: string | null; size?: number }) {
  const s = useSettings();
  if (!avatar || !/^[KQRBNP][0-7]$/.test(avatar)) return <span className="ava-img empty" style={{ width: size, height: size }}><Icon.user /></span>;
  return (
    <span className="ava-img" style={{ width: size, height: size, background: AVATAR_COLORS[+avatar[1]] }}>
      <img src={pieceImgs(s.pieces)['w' + avatar[0]]} alt="" />
    </span>
  );
}
export function Flag({ country, size = 16 }: { country?: string | null; size?: number }) {
  if (!country || !/^[a-z]{2}$/.test(country)) return null;
  return <img className="flag" src={`flags/${country}.svg`} alt={countryName(country)} title={countryName(country)} style={{ height: size * 0.75, width: size }} />;
}

// аватар и страна игрока по uid (подписка, чтобы изменения были видны сразу)
const cache = new Map<string, { avatar?: string; country?: string }>();
export function usePlayerLook(uid: string | null | undefined): { avatar?: string; country?: string } {
  const [v, setV] = useState(() => (uid && cache.get(uid)) || {});
  useEffect(() => {
    if (!uid) { setV({}); return; }
    const u1 = onValue(ref(db, `users/${uid}/avatar`), (s) => { const x = { ...(cache.get(uid) || {}), avatar: s.val() || undefined }; cache.set(uid, x); setV(x); }, () => {});
    const u2 = onValue(ref(db, `users/${uid}/country`), (s) => { const x = { ...(cache.get(uid) || {}), country: s.val() || undefined }; cache.set(uid, x); setV(x); }, () => {});
    return () => { u1(); u2(); };
  }, [uid]);
  return v;
}
export function PlayerAvatar({ uid, size = 36 }: { uid?: string | null; size?: number }) {
  const look = usePlayerLook(uid);
  return <AvatarImg avatar={look.avatar} size={size} />;
}
