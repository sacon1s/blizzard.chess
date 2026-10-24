// Значки оценок ходов Blizzard: шестигранник (как сердце логотипа) и свой знак внутри.
// Вверх — хорошо, вниз — плохо: шевроны вверх — отлично, шеврон вниз — ошибка, два вниз — зевок.
import type { ReactNode } from 'react';

const HEX = '12,1.6 21,6.8 21,17.2 12,22.4 3,17.2 3,6.8';

const GLYPH: Record<string, ReactNode> = {
  // самоцвет
  brilliant: (
    <>
      <path d="M7.6 10 L9.9 7.2 H14.1 L16.4 10 L12 16.6 Z" fill="#fff" stroke="#fff" />
      <path d="M7.9 10 H16.1 M10.2 10 L12 16 M13.8 10 L12 16" stroke="var(--cc)" strokeWidth="1.1" />
    </>
  ),
  // мишень: точное попадание
  best: (
    <>
      <circle cx="12" cy="12" r="4.9" />
      <circle cx="12" cy="12" r="1.7" fill="#fff" stroke="none" />
    </>
  ),
  // два шеврона вверх
  excellent: <path d="M8 12.6 L12 8.8 L16 12.6 M8 16.4 L12 12.6 L16 16.4" />,
  // галочка
  good: <path d="M7.6 12.4 L10.6 15.4 L16.4 9.2" />,
  // раскрытая книга
  book: (
    <path d="M12 9 C10.6 8 8.6 7.7 6.8 8.1 V15.9 C8.6 15.5 10.6 15.8 12 16.8 C13.4 15.8 15.4 15.5 17.2 15.9 V8.1 C15.4 7.7 13.4 8 12 9 Z M12 9 V16.8" strokeWidth="1.8" />
  ),
  // волна: чуть мимо
  inaccuracy: <path d="M6.8 13.2 C8.4 9.9 10.2 9.9 12 12 C13.8 14.1 15.6 14.1 17.2 10.8" />,
  // пустое кольцо пунктиром: шанс упущен
  miss: <circle cx="12" cy="12" r="4.9" strokeDasharray="2.6 2.1" />,
  // шеврон вниз
  mistake: <path d="M7.8 10.2 L12 14.4 L16.2 10.2" strokeWidth="2.6" />,
  // два шеврона вниз
  blunder: <path d="M8 8.4 L12 12.2 L16 8.4 M8 12.4 L12 16.2 L16 12.4" strokeWidth="2.4" />,
};

export const CLS_LABEL: Record<string, string> = {
  brilliant: 'Brilliant', best: 'Best', excellent: 'Excellent', good: 'Good', book: 'Book', inaccuracy: 'Inaccuracy',
  miss: 'Miss', mistake: 'Mistake', blunder: 'Blunder',
};

export default function ClsIcon({ cls, size = 20, ring = false, className = '' }: { cls: string; size?: number | string; ring?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={'cls-svg cls-' + cls + (className ? ' ' + className : '')} aria-hidden="true">
      <polygon points={HEX} fill="var(--cc)" stroke={ring ? '#fff' : 'var(--cc)'} strokeWidth={ring ? 2.2 : 1.6} strokeLinejoin="round" />
      <g fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">{GLYPH[cls]}</g>
    </svg>
  );
}
