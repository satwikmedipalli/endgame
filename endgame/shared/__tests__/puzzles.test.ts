import { describe, expect, it } from 'vitest';

import { makeGrid, numberGrid, PATTERNS, slotsOf } from '../crossword';
import { conflicts, countSolutions, LEVELS, levelFor, makeSudoku } from '../sudoku';
import { WORDS } from '../words';

describe('sudoku', () => {
  it('makes a puzzle with exactly one solution that matches its givens', () => {
    for (const level of ['Easy', 'Medium', 'Hard'] as const) {
      const s = makeSudoku('2026-11-17', level);
      expect(s.givens).toHaveLength(81);
      expect(countSolutions([...s.givens].map(Number))).toBe(1);
      expect([...s.givens].every((g, i) => g === '0' || g === s.solution[i])).toBe(true);
      const givens = [...s.givens].filter((g) => g !== '0').length;
      expect(givens).toBeLessThanOrEqual(LEVELS[level] + 4);
    }
  });

  it('has a valid solution grid', () => {
    const { solution } = makeSudoku('any day');
    expect(conflicts(solution).size).toBe(0);
    expect([...solution].every((c) => c >= '1' && c <= '9')).toBe(true);
  });

  it('is the same puzzle for the same day, and a different one the next day', () => {
    expect(makeSudoku('2026-11-17').givens).toBe(makeSudoku('2026-11-17').givens);
    expect(makeSudoku('2026-11-18').givens).not.toBe(makeSudoku('2026-11-17').givens);
  });

  it('flags numbers that clash with a row, column or box', () => {
    const cells = '55' + '0'.repeat(79);
    expect([...conflicts(cells)].sort()).toEqual([0, 1]);
  });

  it('gets harder through the week', () => {
    expect(levelFor('2026-11-16')).toBe('Easy'); // Monday
    expect(levelFor('2026-11-18')).toBe('Medium'); // Wednesday
    expect(levelFor('2026-11-21')).toBe('Hard'); // Saturday
  });
});

describe('mini crossword', () => {
  const words = new Set(Object.values(WORDS).flatMap((s) => s.toUpperCase().split(' ')));

  it('word list holds only letters of the right length', () => {
    for (const [n, list] of Object.entries(WORDS)) for (const w of list.split(' ')) expect(/^[a-z]+$/.test(w) && w.length === Number(n)).toBe(true);
  });

  it('fills a grid where every across and down answer is a real word, none repeated', () => {
    for (const day of ['2026-11-17', '2026-11-18', '2026-11-19', '2026-12-25']) {
      const g = makeGrid(day);
      expect(g.grid).toHaveLength(g.size * g.size);
      const answers = g.entries.map((e) => e.answer);
      for (const a of answers) expect(words.has(a)).toBe(true);
      expect(new Set(answers).size).toBe(answers.length);
      // Each answer reads straight out of the grid.
      for (const e of g.entries) {
        const read = [...e.answer].map((_, k) => g.grid[e.dir === 'across' ? e.row * g.size + e.col + k : (e.row + k) * g.size + e.col]).join('');
        expect(read).toBe(e.answer);
      }
    }
  });

  it('keeps recent answers out', () => {
    const first = makeGrid('2026-11-17');
    const avoid = new Set(first.entries.map((e) => e.answer));
    const again = makeGrid('2026-11-17', avoid);
    expect(again.entries.some((e) => avoid.has(e.answer))).toBe(false);
  });

  it('numbers squares left to right, top to bottom', () => {
    const entries = numberGrid(4, 'SLABHOMEOVENTEND');
    expect(entries.filter((e) => e.dir === 'across').map((e) => `${e.n}${e.answer}`)).toEqual(['1SLAB', '5HOME', '6OVEN', '7TEND']);
    expect(entries.filter((e) => e.dir === 'down').map((e) => `${e.n}${e.answer}`)).toEqual(['1SHOT', '2LOVE', '3AMEN', '4BEND']);
  });

  it('every layout has only answers of three letters or more', () => {
    for (const p of PATTERNS) for (const s of slotsOf(p)) expect(s.cells.length).toBeGreaterThanOrEqual(3);
  });
});
