import { describe, expect, it } from '@jest/globals';

import { addDays, MIN_EASE, NEW_WORD, review, wordId } from '../srs';

const fresh = { ...NEW_WORD, due: '2026-10-23' };

describe('srs', () => {
  it('adds days across months', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
  });

  it('grows the interval with Good: 1, 3, then times ease', () => {
    const a = review(fresh, 3, '2026-10-23');
    expect(a).toMatchObject({ interval: 1, reps: 1, due: '2026-10-24' });
    const b = review(a, 3, '2026-10-24');
    expect(b.interval).toBe(3);
    const c = review(b, 3, '2026-10-27');
    expect(c.interval).toBe(Math.round(3 * 2.5));
  });

  it('Again resets and lowers ease, never below the floor', () => {
    let s = review(review(fresh, 3, '2026-10-23'), 3, '2026-10-24');
    s = review(s, 1, '2026-10-27');
    expect(s).toMatchObject({ interval: 1, reps: 0, lapses: 1, ease: 2.3 });
    for (let i = 0; i < 10; i++) s = review(s, 1, '2026-10-28');
    expect(s.ease).toBe(MIN_EASE);
  });

  it('Easy jumps further and raises ease; Hard grows slowly', () => {
    expect(review(fresh, 4, '2026-10-23')).toMatchObject({ interval: 3, ease: 2.65 });
    const two = { ...fresh, reps: 2, interval: 10 };
    expect(review(two, 2, '2026-10-23').interval).toBe(12);
  });

  it('makes word ids from the Italian', () => {
    expect(wordId('  Buongiorno!  ')).toBe('buongiorno');
    expect(wordId('Un caffè, per favore.')).toBe('un caffè per favore');
  });
});
