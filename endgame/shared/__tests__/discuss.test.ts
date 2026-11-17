import { expect, test } from 'vitest';

import { discussLink, discussPrompt } from '../discuss';

const card = { id: 'chess-1-04', title: 'Knights & forks?', kind: 'chess' as const };

test('the prompt starts with the card title and names the card id', () => {
  const p = discussPrompt(card);
  expect(p.startsWith('Endgame · Knights & forks?\n')).toBe(true);
  expect(p).toContain('card chess-1-04');
});

test('no project: a new chat with the prompt filled in', () => {
  const { url, copy } = discussLink(card, {});
  expect(copy).toBeUndefined();
  expect(url.startsWith('https://claude.ai/new?q=')).toBe(true);
  expect(decodeURIComponent(url.split('q=')[1])).toBe(discussPrompt(card));
});

test("the course's project: open it and copy the prompt", () => {
  expect(discussLink(card, { chess: 'https://claude.ai/project/abc' })).toEqual({ url: 'https://claude.ai/project/abc', copy: discussPrompt(card) });
});
