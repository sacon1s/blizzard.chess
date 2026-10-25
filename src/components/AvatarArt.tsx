// Нарисованные аватарки (свои, 64×64): звери, роботы и шахматно-зимние картинки. Код в профиле — «a:имя».
import type { ReactNode } from 'react';

const knight = 'M8.6 19.5c0-2.6 1.3-4.5 3.4-6.1L7.3 15 5.4 13c.8-3 2.3-4.9 4-6L10.7 4l2 2.3c3.6.7 5.5 4 5.5 8.6v4.6H8.6Z';
const flake = 'M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.95 4.15 12 6.2l2.05-2.05M9.95 19.85 12 17.8l2.05 2.05M6.23 6.3l.75 2.8-2.8.75M17.77 17.7l-.75-2.8 2.8-.75M4.18 14.15l2.8.75-.75 2.8M19.82 9.85l-2.8-.75.75-2.8';

export const AVATAR_ART: { id: string; name: string; bg: string; art: ReactNode }[] = [
  { id: 'fox', name: 'Fox', bg: '#2f5d50', art: <>
    <path d="M14 26 22 11l6 11h8l6-11 8 15-4 16-14 10-14-10Z" fill="#f07a2b" />
    <path d="M19 23l3-7 3 6ZM45 23l-3-7-3 6Z" fill="#3a2418" />
    <path d="M18 38l14 14 14-14-6-2-8 6-8-6Z" fill="#fff4e8" />
    <circle cx="26" cy="32" r="2.3" fill="#1d1612" /><circle cx="38" cy="32" r="2.3" fill="#1d1612" />
    <path d="M29.6 44.5h4.8L32 48Z" fill="#1d1612" />
  </> },
  { id: 'owl', name: 'Owl', bg: '#5b4a9c', art: <>
    <path d="M15 20l8 8-5 3ZM49 20l-8 8 5 3Z" fill="#a9784d" />
    <ellipse cx="32" cy="38" rx="18" ry="20" fill="#a9784d" />
    <ellipse cx="32" cy="48" rx="10" ry="8" fill="#c99a6b" />
    <circle cx="25" cy="32" r="8" fill="#f7efe2" /><circle cx="39" cy="32" r="8" fill="#f7efe2" />
    <circle cx="25" cy="32" r="4" fill="#1f1a17" /><circle cx="39" cy="32" r="4" fill="#1f1a17" />
    <circle cx="26.4" cy="30.6" r="1.3" fill="#fff" /><circle cx="40.4" cy="30.6" r="1.3" fill="#fff" />
    <path d="M29.5 38h5L32 43Z" fill="#f2b134" />
  </> },
  { id: 'penguin', name: 'Penguin', bg: '#7cc7e8', art: <>
    <ellipse cx="32" cy="38" rx="17" ry="21" fill="#1e2430" />
    <ellipse cx="32" cy="43" rx="11" ry="14" fill="#f8f8f4" />
    <circle cx="26.5" cy="31" r="6" fill="#f8f8f4" /><circle cx="37.5" cy="31" r="6" fill="#f8f8f4" />
    <circle cx="27" cy="31" r="2.3" fill="#1e2430" /><circle cx="37" cy="31" r="2.3" fill="#1e2430" />
    <path d="M28.5 35.5h7L32 40Z" fill="#f39a2b" />
  </> },
  { id: 'cat', name: 'Cat', bg: '#e9c46a', art: <>
    <path d="M17 31l3-18 11 9ZM47 31l-3-18-11 9Z" fill="#5d6470" />
    <path d="M20.5 26l1.5-8 5 4.5ZM43.5 26l-1.5-8-5 4.5Z" fill="#f2a7b6" />
    <circle cx="32" cy="36" r="16" fill="#5d6470" />
    <ellipse cx="25.5" cy="35" rx="2.8" ry="3.6" fill="#b6e36a" /><ellipse cx="38.5" cy="35" rx="2.8" ry="3.6" fill="#b6e36a" />
    <ellipse cx="25.5" cy="35" rx="0.9" ry="3" fill="#1a1a1a" /><ellipse cx="38.5" cy="35" rx="0.9" ry="3" fill="#1a1a1a" />
    <path d="M30.3 41h3.4L32 43.2Z" fill="#f2a7b6" />
    <path d="M17 41l8 1M17 44.5l8-1M47 41l-8 1M47 44.5l-8-1" stroke="#e6e6e6" strokeWidth="0.9" strokeLinecap="round" />
  </> },
  { id: 'bear', name: 'Bear', bg: '#8fbf5e', art: <>
    <circle cx="19" cy="21" r="7" fill="#7a4f2e" /><circle cx="45" cy="21" r="7" fill="#7a4f2e" />
    <circle cx="19" cy="21" r="3.5" fill="#c8936a" /><circle cx="45" cy="21" r="3.5" fill="#c8936a" />
    <circle cx="32" cy="36" r="18" fill="#7a4f2e" />
    <ellipse cx="32" cy="43" rx="9" ry="7" fill="#d9b08c" />
    <ellipse cx="32" cy="40" rx="3.4" ry="2.3" fill="#2a1a10" />
    <circle cx="25" cy="32" r="2.1" fill="#2a1a10" /><circle cx="39" cy="32" r="2.1" fill="#2a1a10" />
    <path d="M32 42v3" stroke="#2a1a10" strokeWidth="1.4" strokeLinecap="round" />
  </> },
  { id: 'wolf', name: 'Wolf', bg: '#26354d', art: <>
    <path d="M14 17l10 9 8-2 8 2 10-9-2 19-10 14-6 4-6-4-10-14Z" fill="#9aa7b8" />
    <path d="M17 22l6 5-4 3ZM47 22l-6 5 4 3Z" fill="#5d6b7e" />
    <path d="M24 40l8 14 8-14-8 4Z" fill="#e7edf3" />
    <circle cx="26" cy="34" r="2.2" fill="#f5d76e" /><circle cx="38" cy="34" r="2.2" fill="#f5d76e" />
    <circle cx="26" cy="34" r="1" fill="#1b2533" /><circle cx="38" cy="34" r="1" fill="#1b2533" />
    <ellipse cx="32" cy="46.5" rx="2.6" ry="1.9" fill="#1b2533" />
  </> },
  { id: 'panda', name: 'Panda', bg: '#f19bb0', art: <>
    <circle cx="19" cy="20" r="7" fill="#1f1f1f" /><circle cx="45" cy="20" r="7" fill="#1f1f1f" />
    <circle cx="32" cy="36" r="18" fill="#fbfbf8" />
    <ellipse cx="25" cy="34" rx="5" ry="6.5" transform="rotate(-25 25 34)" fill="#1f1f1f" />
    <ellipse cx="39" cy="34" rx="5" ry="6.5" transform="rotate(25 39 34)" fill="#1f1f1f" />
    <circle cx="25.6" cy="33" r="1.8" fill="#fff" /><circle cx="38.4" cy="33" r="1.8" fill="#fff" />
    <ellipse cx="32" cy="42" rx="2.9" ry="2" fill="#1f1f1f" />
    <path d="M29.5 45.5q2.5 2 5 0" stroke="#1f1f1f" strokeWidth="1.2" fill="none" strokeLinecap="round" />
  </> },
  { id: 'rabbit', name: 'Rabbit', bg: '#ffcf5c', art: <>
    <ellipse cx="25" cy="17" rx="5" ry="13" fill="#fdfdfb" /><ellipse cx="39" cy="17" rx="5" ry="13" fill="#fdfdfb" />
    <ellipse cx="25" cy="18" rx="2.2" ry="9" fill="#f4a6b8" /><ellipse cx="39" cy="18" rx="2.2" ry="9" fill="#f4a6b8" />
    <circle cx="32" cy="39" r="15" fill="#fdfdfb" />
    <circle cx="26" cy="37" r="2.1" fill="#2b2b2b" /><circle cx="38" cy="37" r="2.1" fill="#2b2b2b" />
    <circle cx="23" cy="43" r="3" fill="#fbd3dc" /><circle cx="41" cy="43" r="3" fill="#fbd3dc" />
    <path d="M30.4 42.5h3.2L32 44.6Z" fill="#f28ca5" />
  </> },
  { id: 'frog', name: 'Frog', bg: '#3fb3a0', art: <>
    <circle cx="22" cy="27" r="8" fill="#6cbf3b" /><circle cx="42" cy="27" r="8" fill="#6cbf3b" />
    <ellipse cx="32" cy="40" rx="20" ry="14" fill="#6cbf3b" />
    <circle cx="22" cy="27" r="5" fill="#fff" /><circle cx="42" cy="27" r="5" fill="#fff" />
    <circle cx="22.5" cy="27.5" r="2.6" fill="#1b1b1b" /><circle cx="41.5" cy="27.5" r="2.6" fill="#1b1b1b" />
    <circle cx="18" cy="42" r="2.6" fill="#f49ab0" /><circle cx="46" cy="42" r="2.6" fill="#f49ab0" />
    <path d="M21 43q11 9 22 0" stroke="#2f6e1b" strokeWidth="2" fill="none" strokeLinecap="round" />
  </> },
  { id: 'lion', name: 'Lion', bg: '#b8492f', art: <>
    <circle cx="32" cy="35" r="21" fill="#e08a2c" />
    <circle cx="20" cy="22" r="4.5" fill="#f2c46d" /><circle cx="44" cy="22" r="4.5" fill="#f2c46d" />
    <circle cx="32" cy="37" r="14" fill="#f2c46d" />
    <circle cx="27" cy="34" r="1.9" fill="#3b2412" /><circle cx="37" cy="34" r="1.9" fill="#3b2412" />
    <path d="M29.4 39h5.2L32 42Z" fill="#3b2412" />
    <path d="M32 42v2.5m0 0q-3 2.2-5 0m5 0q3 2.2 5 0" stroke="#3b2412" strokeWidth="1.2" fill="none" strokeLinecap="round" />
  </> },
  { id: 'robot', name: 'Robot', bg: '#3a3f4b', art: <>
    <path d="M32 10v6" stroke="#c9d1dc" strokeWidth="2" /><circle cx="32" cy="9" r="2.6" fill="#ff6b6b" />
    <rect x="10" y="26" width="4" height="10" rx="2" fill="#9aa4b2" /><rect x="50" y="26" width="4" height="10" rx="2" fill="#9aa4b2" />
    <rect x="14" y="16" width="36" height="30" rx="7" fill="#c9d1dc" />
    <rect x="19" y="22" width="26" height="17" rx="4" fill="#1d2330" />
    <circle cx="26" cy="30" r="3" fill="#5ee0ff" /><circle cx="38" cy="30" r="3" fill="#5ee0ff" />
    <rect x="26" y="34.5" width="12" height="2" rx="1" fill="#5ee0ff" />
    <rect x="22" y="48" width="20" height="8" rx="3" fill="#9aa4b2" />
  </> },
  { id: 'knight', name: 'Knight', bg: '#2b2d42', art: <>
    <circle cx="47" cy="17" r="7" fill="#f6e7c1" />
    <g transform="translate(5 6) scale(2.15)"><path d={knight} fill="#ece6d8" /><rect x="6.5" y="19" width="13.5" height="2.2" rx="1" fill="#ece6d8" /></g>
    <circle cx="29.3" cy="26.3" r="1.6" fill="#2b2d42" />
  </> },
  { id: 'crown', name: 'Crown', bg: '#6d3fbf', art: <>
    <path d="M14 24l8 10 10-16 10 16 8-10-4 22H18Z" fill="#f5c542" />
    <rect x="18" y="46" width="28" height="6" rx="2" fill="#e0a92e" />
    <circle cx="14" cy="24" r="2.6" fill="#f5c542" /><circle cx="32" cy="18" r="2.6" fill="#f5c542" /><circle cx="50" cy="24" r="2.6" fill="#f5c542" />
    <circle cx="32" cy="39" r="2.6" fill="#e85d75" /><circle cx="24" cy="41" r="2" fill="#4cc9b0" /><circle cx="40" cy="41" r="2" fill="#4cc9b0" />
  </> },
  { id: 'peaks', name: 'Peaks', bg: '#1b2a4a', art: <>
    <circle cx="45" cy="17" r="6" fill="#f1f3f8" />
    <circle cx="14" cy="14" r="1" fill="#fff" /><circle cx="24" cy="10" r="0.9" fill="#fff" /><circle cx="33" cy="18" r="0.8" fill="#fff" /><circle cx="54" cy="30" r="0.9" fill="#fff" />
    <path d="M2 54l20-28 10 12 8-10 22 26Z" fill="#8ea4c8" />
    <path d="M22 26l-5 7.5 4-1.5 3 3 3-3.5ZM40 28l-4 6 3-1 3 2.5 2-2.5Z" fill="#fff" />
    <rect x="0" y="52" width="64" height="12" fill="#dfe8f5" />
  </> },
  { id: 'flake', name: 'Snowflake', bg: '#3a7bd5', art: <>
    <circle cx="32" cy="32" r="20" fill="#5590e0" />
    <g transform="translate(8 8) scale(2)"><path d={flake} stroke="#fff" strokeWidth="1.5" strokeLinecap="round" fill="none" /></g>
  </> },
  { id: 'rook', name: 'Rook', bg: '#3b6e8f', art: <>
    <path d="M20 52h24v-5l-4-3V30l4-4v-9h-5v4h-4v-4h-6v4h-4v-4h-5v9l4 4v14l-4 3Z" fill="#f1ece2" />
    <rect x="24" y="36" width="16" height="2" fill="#3b6e8f" opacity="0.35" />
  </> },
];

export function ArtSvg({ id }: { id: string }) {
  const a = AVATAR_ART.find((x) => x.id === id);
  if (!a) return null;
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true">
      <rect width="64" height="64" fill={a.bg} />
      <circle cx="12" cy="10" r="22" fill="#fff" opacity="0.07" />
      {a.art}
    </svg>
  );
}
export const artColor = (id: string) => (AVATAR_ART.find((x) => x.id === id) || { bg: '#3d8ad6' }).bg;
