import { describe, expect, it } from 'vitest';

import { fallbackBlocks, parseBlocks } from '../blocks';
import { resolveTheme, sunTimes } from '../sun';

const chicagoHour = (ms: number) =>
  Number(new Date(ms).toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Chicago' }));

describe('sun', () => {
  it('Richardson sunrise is around 7 AM and sunset around 6–7 PM in late October', () => {
    const { rise, set } = sunTimes(new Date('2026-10-22T17:00:00Z'));
    expect(chicagoHour(rise)).toBe(7);
    expect([18, 19]).toContain(chicagoHour(set));
  });

  it('summer days are longer than winter days', () => {
    const len = (iso: string) => {
      const s = sunTimes(new Date(iso));
      return s.set - s.rise;
    };
    expect(len('2026-06-21T17:00:00Z')).toBeGreaterThan(len('2026-12-21T17:00:00Z') + 3 * 3600_000);
  });

  it('auto is light at noon and dark at 10 PM', () => {
    expect(resolveTheme('auto', new Date('2026-10-22T17:00:00Z')).mode).toBe('light');
    expect(resolveTheme('auto', new Date('2026-10-23T03:00:00Z')).mode).toBe('dark');
    expect(resolveTheme('auto', new Date('2026-10-23T03:00:00Z')).label).toMatch(/dark until sunrise/);
  });

  it('a manual choice wins over the sun', () => {
    expect(resolveTheme('dark', new Date('2026-10-22T17:00:00Z')).mode).toBe('dark');
    expect(resolveTheme('light', new Date('2026-10-23T03:00:00Z')).mode).toBe('light');
  });
});

describe('lesson blocks', () => {
  it('accepts a valid lesson, as a string with code fences', () => {
    const raw = '```json\n' + JSON.stringify({ blocks: [{ type: 'heading', text: 'Hi' }, { type: 'quiz', question: 'q', options: ['a', 'b'], answer: 1, explain: 'e' }] }) + '\n```';
    const r = parseBlocks(raw);
    expect(r.ok).toBe(true);
  });

  it('rejects unknown types and bad quiz answers', () => {
    const r = parseBlocks([{ type: 'video' }, { type: 'quiz', question: 'q', options: ['a', 'b'], answer: 5, explain: 'e' }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toHaveLength(2);
  });

  it('rejects an invented chess position', () => {
    // Two white kings: chess.js refuses it, so the board never renders.
    const r = parseBlocks([{ type: 'chessBoard', fen: '4k3/8/8/8/8/8/8/2K1K3 w - - 0 1' }]);
    expect(r.ok).toBe(false);
  });

  it('accepts a legal chess position', () => {
    expect(parseBlocks([{ type: 'chessBoard', fen: '4k3/8/8/8/8/8/8/3BK3 w - - 0 1' }]).ok).toBe(true);
  });

  it('rejects invalid JSON and empty lessons', () => {
    expect(parseBlocks('{oops').ok).toBe(false);
    expect(parseBlocks({ blocks: [] }).ok).toBe(false);
  });

  it('falls back to plain paragraphs', () => {
    expect(fallbackBlocks('One.\n\nTwo.')).toEqual([
      { type: 'text', text: 'One.' },
      { type: 'text', text: 'Two.' },
    ]);
  });
});
