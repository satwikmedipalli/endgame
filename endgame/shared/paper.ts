// Turns a day's cards into a newspaper you page through: a front page, then sections built
// from each story's category, with "A break" pages (lessons, history, puzzles, the watch
// pick) between sections, and a back page for anything left over.
import type { Card } from './types';

export type SectionKey = 'politics' | 'business' | 'tech' | 'sports' | 'more';

export const SECTIONS: { key: SectionKey; title: string; short: string; categories: string[] }[] = [
  {
    key: 'politics',
    title: 'Politics & world',
    short: 'Politics',
    categories: ['politics', 'policy', 'diplomacy', 'government', 'elections', 'election', 'law', 'courts', 'crime', 'conflict', 'war', 'defence', 'defense', 'security', 'world', 'immigration'],
  },
  {
    key: 'business',
    title: 'Business',
    short: 'Business',
    categories: ['business', 'economy', 'markets', 'finance', 'trade', 'jobs', 'labour', 'labor', 'infrastructure', 'energy', 'banking', 'companies', 'real estate', 'housing'],
  },
  {
    key: 'tech',
    title: 'Tech & science',
    short: 'Tech',
    categories: ['tech', 'technology', 'science', 'health', 'climate', 'environment', 'space', 'ai', 'medicine', 'weather'],
  },
  { key: 'sports', title: 'Sports', short: 'Sports', categories: ['sports', 'sport', 'cricket', 'football', 'soccer', 'tennis', 'olympics', 'f1', 'nba', 'nfl'] },
  { key: 'more', title: 'More news', short: 'More', categories: [] },
];

export type PaperPage =
  | { kind: 'front'; id: 'front'; title: string; short: string; lead: Card | null; top: Card[] }
  | { kind: 'section'; id: string; title: string; short: string; section: SectionKey; part: number; cards: Card[] }
  | { kind: 'break'; id: string; title: string; short: string; cards: Card[] }
  | { kind: 'back'; id: string; title: string; short: string; cards: Card[] };

/** Stories per section page: one lead and four more. */
export const PER_PAGE = 5;
/** Cards on one break page. */
export const PER_BREAK = 3;

/** "US · Politics" → { region: 'US', category: 'politics' }. */
export function parseTag(tag: string): { region: string; category: string } {
  const [region, ...rest] = tag.split('·').map((s) => s.trim());
  return { region: rest.length ? region : '', category: (rest.length ? rest.join(' ') : region).toLowerCase() };
}

export function sectionOf(card: Card): SectionKey {
  const { category } = parseTag(card.tag);
  const words = category.split(/[\s&/,]+/).filter(Boolean);
  for (const s of SECTIONS) if (s.categories.includes(category) || words.some((w) => s.categories.includes(w))) return s.key;
  return 'more';
}

/** Mixes the non-news cards so each break has variety (a puzzle, a story, a lesson…). */
function interleave(cards: Card[]): Card[] {
  const byKind = new Map<string, Card[]>();
  for (const c of cards) byKind.set(c.kind, [...(byKind.get(c.kind) ?? []), c]);
  const queues = [...byKind.values()];
  const out: Card[] = [];
  while (queues.some((q) => q.length)) for (const q of queues) if (q.length) out.push(q.shift()!);
  return out;
}

export function buildPaper(cards: Card[]): PaperPage[] {
  const news = cards.filter((c) => c.kind === 'news');
  const extras = interleave(cards.filter((c) => c.kind !== 'news'));

  // Front page: the top story, then the best of each other region, then whatever's next.
  const lead = news[0] ?? null;
  const top: Card[] = [];
  const regions = new Set(lead ? [parseTag(lead.tag).region] : []);
  for (const c of news.slice(1)) {
    if (top.length >= 3) break;
    const r = parseTag(c.tag).region;
    if (!regions.has(r)) {
      regions.add(r);
      top.push(c);
    }
  }
  for (const c of news.slice(1)) if (top.length < 3 && !top.includes(c)) top.push(c);
  const onFront = new Set([lead, ...top].filter(Boolean) as Card[]);

  // Sections, in their fixed order, split into pages of PER_PAGE.
  const sectionPages: Extract<PaperPage, { kind: 'section' }>[][] = [];
  for (const s of SECTIONS) {
    const mine = news.filter((c) => !onFront.has(c) && sectionOf(c) === s.key);
    if (!mine.length) continue;
    const pages: Extract<PaperPage, { kind: 'section' }>[] = [];
    for (let i = 0; i < mine.length; i += PER_PAGE) {
      const part = i / PER_PAGE + 1;
      pages.push({ kind: 'section', id: `${s.key}-${part}`, title: part > 1 ? `${s.title}, continued` : s.title, short: s.short, section: s.key, part, cards: mine.slice(i, i + PER_PAGE) });
    }
    sectionPages.push(pages);
  }

  // Breaks go between the news, never at the end: first at each change of section, then,
  // if there are more lessons and puzzles than that, between a long section's pages too.
  const out: PaperPage[] = [{ kind: 'front', id: 'front', title: 'Front page', short: 'Front', lead, top }];
  const flat = sectionPages.flat();
  const needed = Math.ceil(extras.length / PER_BREAK);
  const between = flat.map((_, i) => i).slice(0, -1);
  const atChange = between.filter((i) => flat[i + 1].part === 1);
  const inside = between.filter((i) => flat[i + 1].part > 1);
  const slots = new Set([...atChange, ...inside].slice(0, needed));
  let next = 0;
  let breaks = 0;
  const takeBreak = () => {
    if (next >= extras.length) return;
    breaks++;
    out.push({ kind: 'break', id: `break-${breaks}`, title: 'A break', short: 'Break', cards: extras.slice(next, next + PER_BREAK) });
    next += PER_BREAK;
  };
  flat.forEach((pg, i) => {
    out.push(pg);
    if (slots.has(i)) takeBreak();
  });
  // No news yet (an unbuilt day): the extras still get pages.
  if (!sectionPages.length) while (next < extras.length && breaks < 2) takeBreak();
  // Anything left goes on the back page, three to a page like the breaks.
  for (let k = 0; next < extras.length; k++, next += PER_BREAK)
    out.push({ kind: 'back', id: `back-${k + 1}`, title: k ? 'Back page, continued' : 'Back page', short: 'Back', cards: extras.slice(next, next + PER_BREAK) });
  return out;
}

/** Every card in reading order: page by page, the way the paper is laid out. */
export function readingOrder(pages: PaperPage[]): Card[] {
  return pages.flatMap((p) => (p.kind === 'front' ? ([p.lead, ...p.top].filter(Boolean) as Card[]) : p.cards));
}

export function pageOf(pages: PaperPage[], cardId: string): number {
  return pages.findIndex((p) => (p.kind === 'front' ? [p.lead, ...p.top] : p.cards).some((c) => c?.id === cardId));
}
