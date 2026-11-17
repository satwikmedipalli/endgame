// Daily puzzles. The sudoku is made entirely in code. The crossword grid is filled in code
// from a list of common words; one small Haiku call writes the clues. A re-run Sync keeps
// the day's puzzles (and your progress), so there are no extra Claude calls.
import { makeGrid } from '../../../shared/crossword.ts';
import { levelFor, makeSudoku } from '../../../shared/sudoku.ts';
import type { Block, Card, CrosswordClue, DayFeed } from '../../../shared/types.ts';
import { ask } from '../claude.ts';
import { addSeen, loadSeen, type Db } from '../db.ts';

/** Answers used in the last ~60 crosswords stay out of new grids. */
const RECENT_ANSWERS = 600;

export const sudokuId = (day: string) => `puzzle-sudoku-${day}`;
export const crosswordId = (day: string) => `puzzle-crossword-${day}`;

export function sudokuCard(day: string): Card {
  const s = makeSudoku(day, levelFor(day));
  const empty = [...s.givens].filter((c) => c === '0').length;
  return {
    id: sudokuId(day),
    kind: 'puzzle',
    title: 'Sudoku',
    hook: `${s.level} · ${empty} squares to fill.`,
    tag: `Sudoku · ${s.level}`,
    cta: 'Play',
    blocks: [{ type: 'sudoku', givens: s.givens, solution: s.solution, level: s.level }],
    status: 'open',
    chat: [],
  };
}

const SCHEMA = {
  type: 'object',
  properties: {
    clues: {
      type: 'array',
      items: { type: 'object', properties: { answer: { type: 'string' }, clue: { type: 'string' } }, required: ['answer', 'clue'] },
    },
  },
  required: ['clues'],
};

export async function crosswordCard(day: string, avoid: Set<string>): Promise<Card> {
  const g = makeGrid(day, avoid);
  const answers = [...new Set(g.entries.map((e) => e.answer))];
  const res = await ask<{ clues: { answer: string; clue: string }[] }>({
    model: 'haiku',
    schema: SCHEMA,
    system: 'You write clues for a small daily newspaper crossword.',
    prompt:
      `Write one clue for each answer below, in the friendly style of a newspaper mini crossword.\n` +
      `Rules: the clue must not contain the answer or an obvious form of it; keep each under 60 characters; ` +
      `make them fair for an adult who reads the news; mix definitions, fill-in-the-blanks ("Pizza ___") and light wordplay.\n\n` +
      answers.join('\n'),
    timeoutMs: 90_000,
  });
  const byAnswer = new Map(res.clues.map((c) => [c.answer.trim().toUpperCase(), c.clue.trim()]));
  const clues: CrosswordClue[] = g.entries.map((e) => {
    const clue = byAnswer.get(e.answer);
    if (!clue || clue.toUpperCase().includes(e.answer)) throw new Error(`no usable clue for ${e.answer}`);
    return { ...e, clue };
  });
  const block: Block = { type: 'crossword', size: g.size, grid: g.grid, clues };
  return {
    id: crosswordId(day),
    kind: 'puzzle',
    title: 'Mini crossword',
    hook: `${clues.filter((c) => c.dir === 'across').length} across, ${clues.filter((c) => c.dir === 'down').length} down.`,
    tag: `Crossword · ${g.size}×${g.size}`,
    cta: 'Play',
    blocks: [block],
    status: 'open',
    chat: [],
  };
}

export async function puzzleCards(db: Db, day: string, existing: DayFeed | null, log: (m: string) => void): Promise<Card[]> {
  const keep = (id: string) => existing?.cards.find((c) => c.id === id && c.blocks.length);
  const cards: Card[] = [keep(sudokuId(day)) ?? sudokuCard(day)];
  const kept = keep(crosswordId(day));
  if (kept) return [...cards, kept];
  try {
    const seen = await loadSeen<{ day: string }>(db, 'crossword');
    const avoid = new Set(seen.slice(-RECENT_ANSWERS).map((s) => s.key));
    const card = await crosswordCard(day, avoid);
    const block = card.blocks[0] as Extract<Block, { type: 'crossword' }>;
    await addSeen(db, 'crossword', block.clues.map((c) => ({ key: c.answer, meta: { day } })));
    cards.push(card);
  } catch (e) {
    // A day without a crossword is better than a broken one.
    log(`crossword skipped: ${(e as Error).message}`);
  }
  return cards;
}
