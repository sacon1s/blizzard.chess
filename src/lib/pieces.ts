// Наборы фигур (файлы в public/pieces/<набор>/wK.svg …). Авторы и лицензии — в LICENSES/pieces.md.
export const PIECE_SETS: Record<string, { label: string; author: string; license: string }> = {
  maestro: { label: 'Maestro', author: 'sadsnake1', license: 'CC BY-NC-SA 4.0' },
  staunty: { label: 'Staunty', author: 'sadsnake1', license: 'CC BY-NC-SA 4.0' },
  california: { label: 'California', author: 'Jerry S.', license: 'CC BY-NC-SA 4.0' },
  cardinal: { label: 'Cardinal', author: 'sadsnake1', license: 'CC BY-NC-SA 4.0' },
  fresca: { label: 'Fresca', author: 'sadsnake1', license: 'CC BY-NC-SA 4.0' },
  merida: { label: 'Merida', author: 'Armando Hernandez Marroquin', license: 'GPLv2+' },
  cburnett: { label: 'Classic', author: 'Colin M. L. Burnett', license: 'GPLv2+' },
};
const KEYS = ['wK', 'wQ', 'wR', 'wB', 'wN', 'wP', 'bK', 'bQ', 'bR', 'bB', 'bN', 'bP'];
const cache: Record<string, Record<string, string>> = {};
export function pieceImgs(set: string): Record<string, string> {
  const s = PIECE_SETS[set] ? set : 'maestro';
  if (!cache[s]) {
    cache[s] = {};
    for (const k of KEYS) cache[s][k] = `pieces/${s}/${k}.svg`;
    // загрузить заранее, чтобы фигуры не мигали при первом ходе
    for (const k of KEYS) { const i = new Image(); i.src = cache[s][k]; }
  }
  return cache[s];
}
