import { describe, expect, it } from '@jest/globals';

import * as F from '../feed';
import type { Card, DayFeed } from '../types';

const c = (id: string, kind: Card['kind'], extra: Partial<Card> = {}): Card => ({
  id,
  kind,
  title: id,
  hook: '',
  tag: '',
  cta: '',
  blocks: [],
  status: 'open',
  chat: [],
  ...extra,
});

const day = (d: string, cards: Card[]): DayFeed => ({ day: d, builtAt: '', cards });

describe('dayKey', () => {
  it('uses the Chicago calendar day, not UTC', () => {
    // 03:00 UTC on Oct 23 is still Oct 22 in Richardson.
    expect(F.dayKey(new Date('2026-10-23T03:00:00Z'))).toBe('2026-10-22');
    expect(F.dayKey(new Date('2026-10-23T06:00:00Z'))).toBe('2026-10-23');
  });
});

describe('carry-over', () => {
  const prev = day('2026-10-21', [
    c('news-1', 'news', { openedAt: 'x', status: 'skip' }),
    c('code-1', 'code', { openedAt: 'x', chat: [{ id: 'm1', role: 'user', text: 'hi', at: '' }] }),
    c('code-0', 'code', { openedAt: 'x', status: 'done' }),
    c('chess-3', 'chess', { status: 'skip' }),
    c('chess-2', 'chess', { openedAt: 'x', status: 'skip' }),
  ]);

  it('carries opened, unfinished lessons with their chat', () => {
    const carried = F.carryOverCards(prev);
    expect(carried.map((x) => x.id)).toEqual(['code-1', 'chess-2']);
    expect(carried.every((x) => x.continued && x.status === 'open')).toBe(true);
    expect(carried[0].chat).toHaveLength(1);
  });

  it('never carries news, finished cards, or cards never opened', () => {
    const ids = F.carryOverCards(prev).map((x) => x.id);
    expect(ids).not.toContain('news-1');
    expect(ids).not.toContain('code-0');
    expect(ids).not.toContain('chess-3');
  });

  it('places carried cards before fresh cards of the same kind', () => {
    const built = F.buildDay('2026-10-22', [c('news-9', 'news'), c('code-2', 'code'), c('chess-4', 'chess')], prev);
    expect(built.cards.map((x) => x.id)).toEqual(['news-9', 'code-1', 'code-2', 'chess-2', 'chess-4']);
  });

  it('a carried card replaces a fresh card with the same id', () => {
    const built = F.buildDay('2026-10-22', [c('code-1', 'code')], prev);
    expect(built.cards.filter((x) => x.id === 'code-1')).toHaveLength(1);
    expect(built.cards.find((x) => x.id === 'code-1')?.continued).toBe(true);
  });
});

describe('watch follow-up', () => {
  it('asks "Did you watch it?" the day after a yes', () => {
    const prev = day('2026-10-21', [
      c('watch-a', 'watch', { status: 'done', watch: { stage: 'decided', willWatch: true } }),
      c('watch-b', 'watch', { status: 'done', watch: { stage: 'decided', willWatch: false } }),
    ]);
    const ups = F.watchFollowUps(prev);
    expect(ups).toHaveLength(1);
    expect(ups[0].id).toBe('watch-a-followup');
    expect(ups[0].watch?.stage).toBe('followup');
  });
});

describe('ensureDay', () => {
  const fresh = [c('news-1', 'news'), c('code-1', 'code')];

  it('is idempotent: an existing day is returned untouched', () => {
    const feeds = { '2026-10-22': day('2026-10-22', [c('news-1', 'news', { status: 'done' })]) };
    expect(F.ensureDay(feeds, '2026-10-22', fresh)).toBe(feeds['2026-10-22']);
  });

  it('rebuild keeps status and chat of surviving cards', () => {
    const feeds = {
      '2026-10-22': day('2026-10-22', [c('news-1', 'news', { status: 'done', chat: [{ id: 'm2', role: 'user', text: 'q', at: '' }] })]),
    };
    const rebuilt = F.ensureDay(feeds, '2026-10-22', fresh, { force: true });
    expect(rebuilt.cards.map((x) => x.id)).toEqual(['news-1', 'code-1']);
    expect(rebuilt.cards[0].status).toBe('done');
    expect(rebuilt.cards[0].chat).toHaveLength(1);
    expect(rebuilt.cards[1].status).toBe('open');
  });

  it('uses the latest earlier day for carry-over', () => {
    const feeds = {
      '2026-10-19': day('2026-10-19', [c('old', 'code', { openedAt: 'x' })]),
      '2026-10-21': day('2026-10-21', [c('recent', 'code', { openedAt: 'x' })]),
    };
    const ids = F.ensureDay(feeds, '2026-10-22', []).cards.map((x) => x.id);
    expect(ids).toEqual(['recent']);
  });
});

describe('marking cards', () => {
  const feed = day('d', [c('n1', 'news'), c('n2', 'news'), c('code', 'code'), c('n3', 'news')]);

  it('scrolling past news skips it, but not lessons', () => {
    const f = F.autoSkipNewsBefore(feed, 3);
    expect(f.cards.map((x) => x.status)).toEqual(['skip', 'skip', 'open', 'open']);
  });

  it('returns the same object when nothing changes', () => {
    const f = F.autoSkipNewsBefore(feed, 0);
    expect(f).toBe(feed);
  });

  it('clear all news only touches open news', () => {
    const f = F.clearAllNews(F.mark(feed, 'n1', 'done'));
    expect(f.cards.map((x) => x.status)).toEqual(['done', 'skip', 'open', 'skip']);
  });

  it('progress counts and finishes', () => {
    let f = F.clearAllNews(feed);
    expect(F.progress(f)).toMatchObject({ cleared: 3, total: 4, finished: false });
    f = F.mark(f, 'code', 'done');
    expect(F.progress(f)).toMatchObject({ done: 1, skipped: 3, finished: true });
    f = F.undo(f, 'code');
    expect(F.progress(f).finished).toBe(false);
  });

  it('markOpened only sets the first open time', () => {
    const f1 = F.markOpened(feed, 'code', new Date('2026-01-01T00:00:00Z'));
    const f2 = F.markOpened(f1, 'code', new Date('2026-02-01T00:00:00Z'));
    expect(f2.cards[2].openedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('nextOpenIndex wraps and returns -1 when all clear', () => {
    const f = F.mark(feed, 'n3', 'skip');
    expect(F.nextOpenIndex(f, 2)).toBe(0);
    expect(F.nextOpenIndex(F.clearAllNews(F.mark(feed, 'code', 'done')), 0)).toBe(-1);
  });
});

describe('streak', () => {
  const fin = (d: string) => day(d, [c('a', 'code', { status: 'done' })]);
  const open = (d: string) => day(d, [c('a', 'code')]);

  it('counts finished days back from today', () => {
    const feeds = { '2026-10-20': fin('2026-10-20'), '2026-10-21': fin('2026-10-21'), '2026-10-22': fin('2026-10-22') };
    expect(F.streak(feeds, '2026-10-22')).toBe(3);
  });

  it('an unfinished today does not break the streak yet', () => {
    const feeds = { '2026-10-21': fin('2026-10-21'), '2026-10-22': open('2026-10-22') };
    expect(F.streak(feeds, '2026-10-22')).toBe(1);
  });

  it('a gap breaks it', () => {
    const feeds = { '2026-10-19': fin('2026-10-19'), '2026-10-21': fin('2026-10-21') };
    expect(F.streak(feeds, '2026-10-22')).toBe(1);
  });

  it('prevDay crosses month boundaries', () => {
    expect(F.prevDay('2026-11-01')).toBe('2026-10-31');
    expect(F.prevDay('2026-01-01')).toBe('2025-12-31');
  });
});

describe('addCarryOvers', () => {
  it('tops up a day built the night before, once', () => {
    const prev = day('2026-10-22', [c('code-1', 'code', { openedAt: 'x' })]);
    const built = day('2026-10-23', [c('news-1', 'news'), c('code-2', 'code')]);
    const once = F.addCarryOvers(built, prev);
    expect(once.cards.map((x) => x.id)).toEqual(['news-1', 'code-1', 'code-2']);
    expect(F.addCarryOvers(once, prev)).toBe(once);
  });
});
