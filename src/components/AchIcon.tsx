// Значки достижений: шестиугольник цвета группы и линейная иконка по смыслу достижения.
import type { ReactNode } from 'react';

const GOLD = '#d9a21b', PLAY = '#4fae5a', BOTS = '#6f7fe0', ICE = '#4fa6e6', BRILL = '#2bc0d0', PUZ = '#e0a43a', RUSH = '#e8743b', SOC = '#d9668f', ARENA = '#8f84dc', LEARN = '#86b83a';

const ICONS: Record<string, { color: string; d: ReactNode }> = {
  // кубок
  firstWin: { color: GOLD, d: <><path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" /><path d="M8 6H5.5a2.6 2.6 0 0 0 2.8 3.6M16 6h2.5a2.6 2.6 0 0 1-2.8 3.6" /><path d="M12 13v3.5" /><path d="M8.5 20h7l-.8-3.5H9.3L8.5 20Z" /></> },
  // пешка
  games10: { color: PLAY, d: <><circle cx="12" cy="6.8" r="2.6" /><path d="M10.3 9.3 9.2 15.5h5.6l-1.1-6.2" /><path d="M7 20h10l-1.1-4.5H8.1L7 20Z" /></> },
  // медаль на ленте
  games100: { color: PLAY, d: <><path d="m8 3 2.6 6.4M16 3l-2.6 6.4" /><circle cx="12" cy="14.6" r="5.2" /><path d="m12 11.9.85 1.75 1.9.27-1.38 1.33.33 1.9L12 16.25l-1.7.9.33-1.9-1.38-1.33 1.9-.27L12 11.9Z" fill="currentColor" strokeWidth={0.6} /></> },
  // бот
  beat5: { color: BOTS, d: <><rect x="4.5" y="7.5" width="15" height="11" rx="3" /><path d="M12 7.5V4.5" /><circle cx="12" cy="3.6" r=".8" /><circle cx="9.3" cy="12.5" r="1.2" /><circle cx="14.7" cy="12.5" r="1.2" /><path d="M9.5 15.6h5" /></> },
  // меч
  beat8: { color: BOTS, d: <><path d="M20 4v3.4l-9.2 9.2-3.4-3.4L16.6 4H20Z" /><path d="m5.6 11.6 6.8 6.8" /><path d="m7.6 16.4-3.3 3.3" /></> },
  // снежинка
  beat10: { color: ICE, d: <path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.95 4.15 12 6.2l2.05-2.05M9.95 19.85 12 17.8l2.05 2.05M6.23 6.3l.75 2.8-2.8.75M17.77 17.7l-.75-2.8 2.8-.75M4.18 14.15l2.8.75-.75 2.8M19.82 9.85l-2.8-.75.75-2.8" /> },
  // кристалл
  brilliant: { color: BRILL, d: <><path d="M7 4.5h10l3.8 4.8L12 20 3.2 9.3 7 4.5Z" /><path d="M3.2 9.3h17.6M9.6 4.5 8.2 9.3 12 20l3.8-10.7-1.4-4.8" /></> },
  // кусочек пазла
  puzzles50: { color: PUZ, d: <path d="M5 8h3.2a2.3 2.3 0 1 1 4.6 0H16v3.2a2.3 2.3 0 1 1 0 4.6V19H5v-3.2a2.3 2.3 0 1 0 0-4.6V8Z" /> },
  // конь — вилки и тактика
  puzzles500: { color: PUZ, d: <><path d="M8.6 19.5c0-2.6 1.3-4.5 3.4-6.1L7.3 15 5.4 13c.8-3 2.3-4.9 4-6L10.7 4l2 2.3c3.6.7 5.5 4 5.5 8.6v4.6H8.6Z" /><path d="M6.5 19.5h13.5" /><circle cx="11" cy="9.4" r=".8" fill="currentColor" stroke="none" /></> },
  // глаз
  puzzle1500: { color: PUZ, d: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></> },
  // секундомер на ходу
  rush15: { color: RUSH, d: <><circle cx="13.5" cy="13.5" r="6.5" /><path d="M13.5 10.2v3.3l2.2 1.5" /><path d="M11.5 3.5h4M13.5 3.5V7" /><path d="M2.5 11h3M2 14h2.5M2.5 17h3" /></> },
  // молния
  rush30: { color: RUSH, d: <path d="M13.5 3 5.5 13.5H12L10.5 21l8-10.5H12L13.5 3Z" /> },
  // календарь с галочкой
  daily7: { color: PUZ, d: <><rect x="4" y="5.5" width="16" height="14.5" rx="2" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" /><path d="m9 15 2 2 4-4" /></> },
  // двое людей
  friend1: { color: SOC, d: <><circle cx="9" cy="8.5" r="3" /><path d="M3.5 19.5c.8-3 3-4.9 5.5-4.9s4.7 1.9 5.5 4.9" /><circle cx="16.5" cy="9.3" r="2.4" /><path d="M15.6 14.4c2.3-.2 4.2 1.3 4.9 4.2" /></> },
  // флаг
  arena1: { color: ARENA, d: <><path d="M6 21V3.5" /><path d="M6 4.5c3-1.6 5 1.6 8 0s4-1 5-.4v8c-1-.6-2-1.2-5 .4s-5-1.6-8 0" /></> },
  // корона
  arenaWin: { color: GOLD, d: <><path d="m4 8 4.2 4L12 5l3.8 7L20 8l-1.6 9.5H5.6L4 8Z" /><path d="M5.6 20.5h12.8" /></> },
  // шапка выпускника
  lessons: { color: LEARN, d: <><path d="M2.5 9.5 12 5l9.5 4.5L12 14 2.5 9.5Z" /><path d="M6.5 11.4V16c1.5 1.4 3.5 2.2 5.5 2.2s4-.8 5.5-2.2v-4.6" /><path d="M21.5 9.5v5" /></> },
};

export function AchBadge({ id, got = true, size = 38 }: { id: string; got?: boolean; size?: number }) {
  const ic = ICONS[id];
  return (
    <span className="ach-badge" style={{ width: size, height: size, background: got && ic ? ic.color : undefined }} aria-hidden="true">
      {ic && (
        <svg viewBox="0 0 24 24" width={Math.round(size * 0.55)} height={Math.round(size * 0.55)} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">{ic.d}</svg>
      )}
    </span>
  );
}
