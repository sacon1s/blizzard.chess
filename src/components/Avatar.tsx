// Аватар игрока и флаг страны. Аватар — своё фото (код «p» в профиле, картинка — users/uid/photo, маленький JPEG в data:)
// или, если фото нет, стандартная картинка: серая пешка на тёмном фоне.
import { useEffect, useState } from 'react';
import { ref, onValue } from 'firebase/database';
import { db } from '../lib/firebase';
import { countryName } from '../lib/countries';

// цвет обложки профиля
export function avatarColor(_avatar?: string | null): string { return '#3a5570'; }

function DefaultPawn() {
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true">
      <rect width="64" height="64" fill="#3b3b3b" />
      <path d="M32 11a8.5 8.5 0 0 1 5.3 15.2c2.4 1.4 3.9 3.6 3.9 6.1 0 .9-.2 1.7-.5 2.4H23.3c-.3-.7-.5-1.5-.5-2.4 0-2.5 1.5-4.7 3.9-6.1A8.5 8.5 0 0 1 32 11Z" fill="#9b9b9b" />
      <path d="M25.6 36.5h12.8L41 48H23Z" fill="#9b9b9b" />
      <rect x="16.5" y="49.5" width="31" height="7" rx="3" fill="#9b9b9b" />
    </svg>
  );
}

export function AvatarImg({ avatar, photo, size = 36, round }: { avatar?: string | null; photo?: string | null; size?: number; round?: boolean }) {
  const st = { width: size, height: size };
  const cls = 'ava-img' + (round ? ' round' : '');
  if (avatar === 'p' && photo && photo.startsWith('data:image/')) return <span className={cls} style={st}><img className="ava-photo" src={photo} alt="" /></span>;
  return <span className={cls + ' art'} style={st}><DefaultPawn /></span>;
}
export function Flag({ country, size = 16 }: { country?: string | null; size?: number }) {
  if (!country || !/^[a-z]{2}$/.test(country)) return null;
  return <img className="flag" src={`flags/${country}.svg`} alt={countryName(country)} title={countryName(country)} style={{ height: size * 0.75, width: size }} />;
}

// аватар, фото и страна игрока по uid (подписка, чтобы изменения были видны сразу); фото грузится, только если выбрано
type Look = { avatar?: string; country?: string; photo?: string };
const cache = new Map<string, Look>();
export function usePlayerLook(uid: string | null | undefined): Look {
  const [v, setV] = useState<Look>(() => (uid && cache.get(uid)) || {});
  useEffect(() => {
    if (!uid) { setV({}); return; }
    const put = (k: keyof Look, val: string | undefined) => { const x = { ...(cache.get(uid) || {}), [k]: val }; cache.set(uid, x); setV(x); };
    const u1 = onValue(ref(db, `users/${uid}/avatar`), (s) => put('avatar', s.val() || undefined), () => {});
    const u2 = onValue(ref(db, `users/${uid}/country`), (s) => put('country', s.val() || undefined), () => {});
    return () => { u1(); u2(); };
  }, [uid]);
  const wantPhoto = !!uid && v.avatar === 'p';
  useEffect(() => {
    if (!wantPhoto || !uid) return;
    return onValue(ref(db, `users/${uid}/photo`), (s) => { const x = { ...(cache.get(uid) || {}), photo: s.val() || undefined }; cache.set(uid, x); setV(x); }, () => {});
  }, [uid, wantPhoto]);
  return v;
}
export function PlayerAvatar({ uid, size = 36, round }: { uid?: string | null; size?: number; round?: boolean }) {
  const look = usePlayerLook(uid);
  return <AvatarImg avatar={look.avatar} photo={look.photo} size={size} round={round} />;
}

// фото с компьютера или телефона → квадрат 160×160, JPEG; строка data: не больше ~40 КБ
export async function photoToDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const c = document.createElement('canvas');
    c.width = c.height = 160;
    const g = c.getContext('2d')!;
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 160, 160);
    for (const q of [0.86, 0.75, 0.6, 0.45]) {
      const d = c.toDataURL('image/jpeg', q);
      if (d.length < 40000) return d;
    }
    throw new Error('too big');
  } finally { URL.revokeObjectURL(url); }
}
