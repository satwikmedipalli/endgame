import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { NEW_WORD } from '../../../app/src/lib/srs.ts';
import type { Card } from '../../../app/src/lib/types.ts';
import { applyGrades, learnedWords, reviewBlock } from '../lessons/italian.ts';

const card = {
  id: 'italian-a1-01',
  blocks: [
    { type: 'italianPhrase', it: 'Ciao!', en: 'Hi', learn: true },
    { type: 'italianPhrase', it: 'ciao', en: 'Bye', learn: true },
    { type: 'italianPhrase', it: 'Ciao, come stai?', en: 'Hi, how are you?' },
    { type: 'italianPhrase', it: 'Grazie', en: 'Thanks', note: 'GRAH-tsyeh', learn: true },
  ],
} as unknown as Card;

describe('italian', () => {
  it('keeps only learn words, once each', () => {
    const w = learnedWords(card, 'a1-01');
    assert.deepEqual(
      w.map((x) => x.id),
      ['ciao', 'grazie'],
    );
    assert.equal(w[1].note, 'GRAH-tsyeh');
  });

  it('schedules only graded words', () => {
    const rows = [
      { id: 'ciao', it: 'ciao', en: 'hi', note: null, ...NEW_WORD, due: '2026-10-23' },
      { id: 'grazie', it: 'grazie', en: 'thanks', note: null, ...NEW_WORD, due: '2026-10-23' },
    ];
    const next = applyGrades(rows, { ciao: 4 }, '2026-10-23');
    assert.equal(next.length, 1);
    assert.equal(next[0].due, '2026-10-26');
  });

  it('skips the review section when nothing is due', () => {
    assert.deepEqual(reviewBlock([]), []);
  });
});
