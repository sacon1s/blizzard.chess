// Аватар игрока и флаг страны. Аватар — код в профиле:
//   «a:fox» — нарисованная картинка (AvatarArt.tsx), «p» — своё фото (users/uid/photo, маленький JPEG в data:),
//   «N3» — фигура на цветном фоне (так было до 1.0, по-прежнему работает).
import { useEffect, useState } from 'react';
import { ref, onValue } from 'firebase/database';
import { db } from '../lib/firebase';
import { Icon } from './icons';
import { pieceImgs } from '../lib/pieces';
import { useSettings } from '../lib/store';
import { countryName } from '../lib/countries';
import { ArtSvg, artColor } from './AvatarArt';

export const AVATAR_COLORS = ['#3d8ad6', '#4fae5a', '#e0463f', '#ec8130', '#8f84dc', '#2bc0d0', '#e0558c', '#6b6b6b'];
export const AVATAR_PIECES = ['K', 'Q', 'R', 'B', 'N', 'P'];

// основной цвет аватара — для фона шапки профиля
export function avatarColor(avatar?: string | null): string {
  if (avatar && avatar.startsWith('a:')) return artColor(avatar.slice(2));
  if (avatar && /^[KQRBNP][0-7]$/.test(avatar)) return AVATAR_COLORS[+avatar[1]];
  return '#3d8ad6';
}

export function AvatarImg({ avatar, photo, size = 36, round }: { avatar?: string | null; photo?: string | null; size?: number; round?: boolean }) {
  const s = useSettings();
  const st = { width: size, height: size };
  const cls = 'ava-img' + (round ? ' round' : '');
  if (avatar === 'p' && photo && photo.startsWith('data:image/')) return <span className={cls} style={st}><img className="ava-photo" src={photo} alt="" /></span>;
  if (avatar && avatar.startsWith('a:')) return <span className={cls + ' art'} style={st}><ArtSvg id={avatar.slice(2)} /></span>;
  if (!avatar || !/^[KQRBNP][0-7]$/.test(avatar)) return <span className={cls + ' empty'} style={st}><Icon.user /></span>;
  return (
    <span className={cls} style={{ ...st, background: AVATAR_COLORS[+avatar[1]] }}>
      <img src={pieceImgs(s.pieces)['w' + avatar[0]]} alt="" />
    </span>
  );
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
