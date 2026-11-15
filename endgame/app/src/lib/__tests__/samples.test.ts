import { expect, test } from '@jest/globals';

import { freshCards, seedYesterday, stripSamples } from '../../data/sample';
import type { Card, DayFeed } from '../types';

const real = (id: string, title = 'Real story'): Card => ({ id, kind: 'news', title, hook: '', tag: '', cta: '', blocks: [], status: 'open', chat: [] });
const day = '2026-11-10';

test('a device-built day loses every sample card; an all-sample day disappears', () => {
  const feeds: Record<string, DayFeed> = {
    [day]: { day, builtAt: '', cards: [...freshCards(day), real('news-2026-11-10-abc123')] },
    '2026-11-09': seedYesterday('2026-11-09'),
  };
  const out = stripSamples(feeds);
  expect(out[day].cards.map((c) => c.id)).toEqual(['news-2026-11-10-abc123']);
  expect(out['2026-11-09']).toBeUndefined();
});

test('a Sync-built day keeps real cards that share a sample id, but never placeholders', () => {
  const placeholder = freshCards(day).find((c) => c.title.startsWith('['))!;
  const drill = { ...real('chess-drill-3', 'Where does Bg4 go?'), kind: 'chess' as const };
  const out = stripSamples({ [day]: { day, builtAt: '', source: 'sync', cards: [placeholder, drill, real('news-x')] } });
  expect(out[day].cards.map((c) => c.id)).toEqual(['chess-drill-3', 'news-x']);
});

test('nothing to strip returns the same objects', () => {
  const f = { [day]: { day, builtAt: '', source: 'sync' as const, cards: [real('news-x')] } };
  expect(stripSamples(f)[day]).toBe(f[day]);
});
