// Daily sudoku, made entirely in code: a random full grid, then squares are removed
// while the puzzle still has exactly one solution. Same day → same puzzle.

/** Small seeded generator (mulberry32), so a day's puzzle can be rebuilt exactly. */
export function seeded(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(list: T[], rand: () => number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const peersOf: number[][] = Array.from({ length: 81 }, (_, i) => {
  const r = Math.floor(i / 9);
  const c = i % 9;
  const br = r - (r % 3);
  const bc = c - (c % 3);
  const set = new Set<number>();
  for (let k = 0; k < 9; k++) {
    set.add(r * 9 + k);
    set.add(k * 9 + c);
    set.add((br + Math.floor(k / 3)) * 9 + bc + (k % 3));
  }
  set.delete(i);
  return [...set];
});

const canPlace = (g: number[], i: number, v: number) => peersOf[i].every((p) => g[p] !== v);

/** Counts solutions up to `limit` (2 is enough to know a puzzle isn't unique). */
export function countSolutions(grid: number[], limit = 2): number {
  const g = [...grid];
  let count = 0;
  const solve = (): boolean => {
    // The empty square with the fewest options first keeps this fast.
    let best = -1;
    let bestOpts: number[] = [];
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const opts: number[] = [];
      for (let v = 1; v <= 9; v++) if (canPlace(g, i, v)) opts.push(v);
      if (!opts.length) return false;
      if (best < 0 || opts.length < bestOpts.length) {
        best = i;
        bestOpts = opts;
        if (opts.length === 1) break;
      }
    }
    if (best < 0) return ++count >= limit;
    for (const v of bestOpts) {
      g[best] = v;
      if (solve()) return true;
    }
    g[best] = 0;
    return false;
  };
  solve();
  return count;
}

function fullGrid(rand: () => number): number[] {
  const g = new Array<number>(81).fill(0);
  const fill = (i: number): boolean => {
    if (i === 81) return true;
    for (const v of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rand)) {
      if (!canPlace(g, i, v)) continue;
      g[i] = v;
      if (fill(i + 1)) return true;
    }
    g[i] = 0;
    return false;
  };
  fill(0);
  return g;
}

export const LEVELS = { Easy: 38, Medium: 32, Hard: 27 } as const;
export type Level = keyof typeof LEVELS;

/** Monday is easy and the week gets harder, like a newspaper's. */
export function levelFor(day: string): Level {
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay(); // 0 Sunday
  return dow === 1 || dow === 2 ? 'Easy' : dow === 6 || dow === 0 ? 'Hard' : 'Medium';
}

/** Givens and solution as 81-character strings ('0' = empty). */
export function makeSudoku(seed: string, level: Level = 'Medium'): { givens: string; solution: string; level: Level } {
  const rand = seeded(`sudoku:${seed}`);
  const solution = fullGrid(rand);
  const g = [...solution];
  const target = LEVELS[level];
  let left = 81;
  // Remove symmetric pairs, keeping each removal only if the answer stays unique.
  for (const i of shuffle([...Array(41).keys()], rand)) {
    if (left <= target) break;
    const j = 80 - i;
    const keep = [g[i], g[j]];
    g[i] = 0;
    g[j] = 0;
    if (countSolutions(g) === 1) left -= i === j ? 1 : 2;
    else [g[i], g[j]] = keep;
  }
  return { givens: g.join(''), solution: solution.join(''), level };
}

/** Squares that break a rule against the givens and your own entries (for red marks). */
export function conflicts(cells: string): Set<number> {
  const bad = new Set<number>();
  for (let i = 0; i < 81; i++) {
    const v = cells[i];
    if (v < '1' || v > '9') continue;
    for (const p of peersOf[i]) if (cells[p] === v) bad.add(i);
  }
  return bad;
}
