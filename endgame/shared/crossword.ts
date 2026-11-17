// Daily mini crossword. The grid is filled in code from a list of common words, so every
// answer is a real word that crosses correctly; Claude only writes the clues (worker).
import { seeded, shuffle } from './sudoku';
import type { CrosswordClue } from './types';
import { WORDS } from './words';

/** Black-square layouts, '#' = black: 5×5 with rotational symmetry, then a 4×4 fallback. (Denser 5×5 layouts need a bigger word list than ours.) */
export const PATTERNS = [
  ['##...', '#....', '.....', '....#', '...##'],
  ['...##', '....#', '.....', '#....', '##...'],
  ['#...#', '.....', '.....', '.....', '#...#'],
  ['....', '....', '....', '....'],
];

type Slot = { dir: 'across' | 'down'; row: number; col: number; cells: number[] };

export function slotsOf(pattern: string[]): Slot[] {
  const size = pattern.length;
  const open = (r: number, c: number) => r >= 0 && c >= 0 && r < size && c < size && pattern[r][c] !== '#';
  const slots: Slot[] = [];
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) {
      if (!open(r, c)) continue;
      if (!open(r, c - 1) && open(r, c + 1)) {
        const cells: number[] = [];
        for (let k = c; open(r, k); k++) cells.push(r * size + k);
        slots.push({ dir: 'across', row: r, col: c, cells });
      }
      if (!open(r - 1, c) && open(r + 1, c)) {
        const cells: number[] = [];
        for (let k = r; open(k, c); k++) cells.push(k * size + c);
        slots.push({ dir: 'down', row: r, col: c, cells });
      }
    }
  return slots;
}

const lists: Record<number, string[]> = Object.fromEntries(Object.entries(WORDS).map(([n, s]) => [n, s.split(' ').map((w) => w.toUpperCase())]));

/** Fills a pattern, or returns null if it can't within the step budget. `avoid` keeps recent answers out. */
export function fill(pattern: string[], rand: () => number, avoid: Set<string> = new Set(), budget = 4_000): string | null {
  const size = pattern.length;
  const slots = slotsOf(pattern);
  if (slots.some((s) => !lists[s.cells.length])) return null;
  const grid: string[] = pattern.join('').split('').map((ch) => (ch === '#' ? '#' : ''));
  const pools = slots.map((s) => shuffle(lists[s.cells.length].filter((w) => !avoid.has(w)), rand));
  const used = new Set<string>();
  const done = new Array<boolean>(slots.length).fill(false);
  let steps = 0;

  const fits = (s: Slot, w: string) => s.cells.every((cell, i) => !grid[cell] || grid[cell] === w[i]);

  const solve = (): boolean => {
    if (++steps > budget) return false;
    // The open slot with the fewest words that still fit.
    let best = -1;
    let cands: string[] = [];
    for (let i = 0; i < slots.length; i++) {
      if (done[i]) continue;
      const c = pools[i].filter((w) => !used.has(w) && fits(slots[i], w));
      if (!c.length) return false;
      if (best < 0 || c.length < cands.length) {
        best = i;
        cands = c;
      }
    }
    if (best < 0) return true;
    const s = slots[best];
    for (const w of cands.slice(0, 40)) {
      const before = s.cells.map((cell) => grid[cell]);
      s.cells.forEach((cell, i) => (grid[cell] = w[i]));
      done[best] = true;
      used.add(w);
      // Every crossing slot that is now complete must also be a word.
      if (solve()) return true;
      used.delete(w);
      done[best] = false;
      s.cells.forEach((cell, i) => (grid[cell] = before[i]));
    }
    return false;
  };
  if (!solve()) return null;
  // Slots filled only by crossings must be words too (solve checks them via `fits`).
  return grid.join('').length === size * size ? grid.join('') : null;
}

export type Grid = { size: number; grid: string; entries: Omit<CrosswordClue, 'clue'>[] };

/** Numbers the grid the usual way: left to right, top to bottom, one number per starting square. */
export function numberGrid(size: number, grid: string): Grid['entries'] {
  const pattern = Array.from({ length: size }, (_, r) => grid.slice(r * size, r * size + size).replace(/[A-Z]/g, '.'));
  const slots = slotsOf(pattern);
  const starts = [...new Set(slots.map((s) => s.row * size + s.col))].sort((a, b) => a - b);
  return slots
    .map((s) => ({
      dir: s.dir,
      n: starts.indexOf(s.row * size + s.col) + 1,
      row: s.row,
      col: s.col,
      answer: s.cells.map((c) => grid[c]).join(''),
    }))
    .sort((a, b) => (a.dir === b.dir ? a.n - b.n : a.dir === 'across' ? -1 : 1));
}

/** Same seed → same grid. Tries the 5×5 layouts first. */
export function makeGrid(seed: string, avoid: Set<string> = new Set()): Grid {
  const rand = seeded(`crossword:${seed}`);
  const five = shuffle(PATTERNS.filter((p) => p.length === 5), rand);
  for (const p of [...five, ...PATTERNS.filter((p) => p.length === 4)]) {
    const grid = fill(p, rand, avoid);
    if (grid) return { size: p.length, grid, entries: numberGrid(p.length, grid) };
  }
  throw new Error('could not fill a crossword grid');
}
