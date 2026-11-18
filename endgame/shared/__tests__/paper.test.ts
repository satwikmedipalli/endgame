import { describe, expect, it } from 'vitest';

import { freshCards } from '../data/sample';
import { buildPaper, PER_BREAK, PER_PAGE, pageOf, parseTag, readingOrder, sectionOf } from '../paper';
import type { Card } from '../types';

const news = (id: string, tag: string): Card => ({ id, kind: 'news', title: id, hook: '', tag, cta: 'Read', blocks: [], status: 'open', chat: [] });
const extra = (id: string, kind: Card['kind']): Card => ({ id, kind, title: id, hook: '', tag: kind, cta: 'Open', blocks: [], status: 'open', chat: [] });

describe('sections', () => {
  it('reads region and category from the tag', () => {
    expect(parseTag('US · Politics')).toEqual({ region: 'US', category: 'politics' });
    expect(parseTag('World · Real Estate')).toEqual({ region: 'World', category: 'real estate' });
  });

  it('files stories by topic, whatever the region', () => {
    expect(sectionOf(news('a', 'IN · Economy'))).toBe('business');
    expect(sectionOf(news('b', 'US · Tech'))).toBe('tech');
    expect(sectionOf(news('c', 'IN · Cricket'))).toBe('sports');
    expect(sectionOf(news('d', 'World · Diplomacy'))).toBe('politics');
    expect(sectionOf(news('e', 'US · Culture'))).toBe('more');
  });
});

describe('the paper', () => {
  const day = [
    ...Array.from({ length: 9 }, (_, i) => news(`us-pol-${i}`, 'US · Politics')),
    news('in-eco', 'IN · Economy'),
    news('w-pol', 'World · Politics'),
    ...Array.from({ length: 3 }, (_, i) => news(`us-biz-${i}`, 'US · Business')),
    news('sport', 'US · Sports'),
    news('culture', 'US · Culture'),
    extra('code-1', 'code'),
    extra('code-2', 'code'),
    extra('hist', 'history'),
    extra('sudoku', 'puzzle'),
    extra('xw', 'puzzle'),
    extra('chess', 'chess'),
    extra('watch', 'watch'),
  ];
  const pages = buildPaper(day);

  it('puts every card on exactly one page', () => {
    const order = readingOrder(pages).map((c) => c.id);
    expect(order.length).toBe(day.length);
    expect(new Set(order).size).toBe(day.length);
  });

  it('leads with the top story and one from each other region', () => {
    const front = pages[0];
    expect(front.kind).toBe('front');
    if (front.kind !== 'front') return;
    expect(front.lead?.id).toBe('us-pol-0');
    expect(front.top.map((c) => c.id)).toEqual(['in-eco', 'w-pol', 'us-pol-1']);
  });

  it('splits a long section into continued pages', () => {
    const politics = pages.filter((p) => p.kind === 'section' && p.section === 'politics');
    expect(politics.map((p) => p.title)).toEqual(['Politics & world', 'Politics & world, continued']);
    for (const p of politics) if (p.kind === 'section') expect(p.cards.length).toBeLessThanOrEqual(PER_PAGE);
  });

  it('puts breaks between the news, at section changes first, mixed', () => {
    expect(pages[0].kind).toBe('front');
    for (let i = 1; i < pages.length; i++) {
      // Never two breaks in a row, and a break always follows a news page.
      if (pages[i].kind === 'break') expect(pages[i - 1].kind).toBe('section');
    }
    const first = pages.find((p) => p.kind === 'break');
    expect(first && first.kind === 'break' && new Set(first.cards.map((c) => c.kind)).size).toBe(PER_BREAK);
    // 7 extras need 3 breaks; this day has 3 section changes, so all fit between the news.
    expect(pages.filter((p) => p.kind === 'break').length).toBe(3);
    expect(pages.some((p) => p.kind === 'back')).toBe(false);
  });

  it('uses the gaps inside a long section when there are more extras than section changes', () => {
    const extras = Array.from({ length: 12 }, (_, i) => extra(`x-${i}`, i % 2 ? 'code' : 'history'));
    const p = buildPaper([...Array.from({ length: 15 }, (_, i) => news(`p-${i}`, 'US · Politics')), news('b', 'US · Business'), ...extras]);
    const kinds = p.map((pg) => (pg.kind === 'section' ? `${pg.section}${pg.part}` : pg.kind));
    expect(kinds).toEqual(['front', 'politics1', 'break', 'politics2', 'break', 'politics3', 'break', 'business1', 'back']);
  });

  it('never puts more than three cards on a break or back page', () => {
    const many = buildPaper([...day, ...Array.from({ length: 9 }, (_, i) => extra(`more-${i}`, 'stocks'))]);
    for (const p of many) if (p.kind === 'break' || p.kind === 'back') expect(p.cards.length).toBeLessThanOrEqual(PER_BREAK);
    expect(many.filter((p) => p.kind === 'back').map((p) => p.title).slice(0, 2)).toEqual(['Back page', 'Back page, continued']);
  });

  it('finds the page a card is on', () => {
    expect(pageOf(pages, 'us-pol-0')).toBe(0);
    expect(pages[pageOf(pages, 'sport')].kind).toBe('section');
    expect(pageOf(pages, 'nope')).toBe(-1);
  });

  it('still has pages on a day with no news yet', () => {
    const p = buildPaper([extra('code-1', 'code'), extra('hist', 'history')]);
    expect(p[0].kind).toBe('front');
    expect(readingOrder(p).length).toBe(2);
  });

  it('lays out the sample day without losing a card', () => {
    const cards = freshCards('2026-11-17');
    expect(readingOrder(buildPaper(cards)).length).toBe(cards.length);
  });
});
