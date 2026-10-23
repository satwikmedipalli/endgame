import { describe, expect, it } from '@jest/globals';

import * as S from '../sync';
import type { Card, DayFeed } from '../types';

const c = (id: string, extra: Partial<Card> = {}): Card => ({
  id,
  kind: 'code',
  title: id,
  hook: '',
  tag: '',
  cta: '',
  blocks: [{ type: 'text', text: 'x' }],
  status: 'open',
  chat: [],
  ...extra,
});
const day = (d: string, cards: Card[], builtAt = `${d}T10:00:00.000Z`): DayFeed => ({ day: d, builtAt, cards });

describe('rows round trip', () => {
  it('feeds → rows → feeds keeps cards, order and chat', () => {
    const feeds = {
      '2026-10-22': day('2026-10-22', [
        c('a', { status: 'done', updatedAt: '2026-10-22T11:00:00.000Z', chat: [{ id: 'm1', role: 'user', text: 'hi', at: '2026-10-22T11:00:00.000Z' }] }),
        c('b', { kind: 'chess', preview: { fen: '8/8/8/8/8/8/8/8 w - - 0 1' } }),
      ]),
    };
    const rows = S.toRows(feeds, 'u1');
    expect(rows.cards.map((r) => [r.id, r.position])).toEqual([
      ['a', 0],
      ['b', 1],
    ]);
    expect(rows.chats).toHaveLength(1);
    const back = S.fromRows(rows);
    expect(back['2026-10-22'].cards.map((x) => x.id)).toEqual(['a', 'b']);
    expect(back['2026-10-22'].cards[0].chat[0].text).toBe('hi');
    expect(back['2026-10-22'].cards[1].preview?.fen).toBeDefined();
  });

  it('a carried card shares its chat on both days but sends each message once', () => {
    const chat = [{ id: 'm1', role: 'user' as const, text: 'q', at: '2026-10-21T09:00:00.000Z' }];
    const feeds = {
      '2026-10-21': day('2026-10-21', [c('lesson', { chat })]),
      '2026-10-22': day('2026-10-22', [c('lesson', { chat, continued: true })]),
    };
    const rows = S.toRows(feeds, 'u1');
    expect(rows.chats).toHaveLength(1);
    const back = S.fromRows(rows);
    expect(back['2026-10-21'].cards[0].chat).toHaveLength(1);
    expect(back['2026-10-22'].cards[0].chat).toHaveLength(1);
  });

  it('normalises Postgres timestamps to JS ISO strings', () => {
    const rows = S.toRows({ '2026-10-22': day('2026-10-22', [c('a', { updatedAt: '2026-10-22T11:00:00.000Z' })]) }, 'u1');
    rows.cards[0].updated_at = '2026-10-22T11:00:00+00:00';
    rows.days[0].built_at = '2026-10-22T10:00:00+00:00';
    const back = S.fromRows(rows);
    expect(back['2026-10-22'].builtAt).toBe('2026-10-22T10:00:00.000Z');
    expect(back['2026-10-22'].cards[0].updatedAt).toBe('2026-10-22T11:00:00.000Z');
  });
});

describe('mergeFeeds', () => {
  it('keeps days that exist on only one side', () => {
    const m = S.mergeFeeds({ '2026-10-21': day('2026-10-21', [c('a')]) }, { '2026-10-22': day('2026-10-22', [c('b')]) });
    expect(Object.keys(m).sort()).toEqual(['2026-10-21', '2026-10-22']);
  });

  it('the newer card wins, and chat is a union in time order', () => {
    const local = {
      d: day('d', [
        c('a', { status: 'done', updatedAt: '2026-10-22T12:00:00.000Z', chat: [{ id: 'm2', role: 'user', text: 'second', at: '2026-10-22T12:00:00.000Z' }] }),
      ]),
    };
    const remote = {
      d: day('d', [
        c('a', { status: 'skip', updatedAt: '2026-10-22T11:00:00.000Z', chat: [{ id: 'm1', role: 'user', text: 'first', at: '2026-10-22T11:00:00.000Z' }] }),
      ]),
    };
    const card = S.mergeFeeds(local, remote).d.cards[0];
    expect(card.status).toBe('done');
    expect(card.chat.map((m) => m.text)).toEqual(['first', 'second']);
  });

  it('order follows the later build and keeps cards only one side has', () => {
    const local = { d: day('d', [c('a'), c('b')], '2026-10-22T08:00:00.000Z') };
    const remote = { d: day('d', [c('b'), c('c')], '2026-10-22T09:00:00.000Z') };
    expect(S.mergeFeeds(local, remote).d.cards.map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('changedRows', () => {
  it('sends only what changed since the last push', () => {
    const feeds = { d: day('d', [c('a'), c('b')]) };
    const rows = S.toRows(feeds, 'u1');
    const snap = S.snapshot(rows);
    expect(S.isEmpty(S.changedRows(rows, snap))).toBe(true);

    const edited = S.toRows({ d: day('d', [c('a', { status: 'done' }), c('b')]) }, 'u1');
    const changed = S.changedRows(edited, snap);
    expect(changed.days).toHaveLength(0);
    expect(changed.cards.map((r) => r.id)).toEqual(['a']);
  });

  it('a failed push keeps rows pending (snapshot untouched)', () => {
    const rows = S.toRows({ d: day('d', [c('a')]) }, 'u1');
    expect(S.changedRows(rows, {}).cards).toHaveLength(1);
  });
});

describe('Sync-built days', () => {
  it('a Sync day replaces the phone fallback, keeping status of shared cards', () => {
    const local = { d: { ...day('d', [c('news-sample'), c('code-1', { status: 'done', updatedAt: '2026-10-22T12:00:00.000Z' })]), source: 'app' as const } };
    const remote = { d: { ...day('d', [c('news-real'), c('code-1', { updatedAt: '2026-10-22T11:00:00.000Z' })], '2026-10-22T05:00:00.000Z'), source: 'sync' as const } };
    const m = S.mergeFeeds(local, remote).d;
    expect(m.source).toBe('sync');
    expect(m.cards.map((x) => x.id)).toEqual(['news-real', 'code-1']);
    expect(m.cards[1].status).toBe('done');
  });

  it('a re-run Sync drops cards it replaced, but keeps ones touched since', () => {
    const local = {
      d: {
        ...day('d', [c('code-1', { updatedAt: '2026-10-22T05:00:00.000Z' }), c('news-x', { status: 'done', updatedAt: '2026-10-22T09:00:00.000Z' })], '2026-10-22T05:00:00.000Z'),
        source: 'sync' as const,
      },
    };
    const remote = { d: { ...day('d', [c('code-1-01')], '2026-10-22T08:00:00.000Z'), source: 'sync' as const } };
    expect(S.mergeFeeds(local, remote).d.cards.map((x) => x.id)).toEqual(['code-1-01', 'news-x']);
  });

  it('source survives the round trip', () => {
    const rows = S.toRows({ '2026-10-22': { ...day('2026-10-22', [c('a')]), source: 'sync' } }, 'u1');
    expect(rows.days[0].source).toBe('sync');
    expect(S.fromRows(rows)['2026-10-22'].source).toBe('sync');
  });
});
