import { HOME } from './sun';
import type { Card, CardStatus, DayFeed } from './types';

/** Calendar day (YYYY-MM-DD) in the home time zone. */
export function dayKey(now: Date, tz = HOME.tz): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(now)
    .reduce<Record<string, string>>((acc, p) => ((acc[p.type] = p.value), acc), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * Lessons opened but not finished come back the next day with their chat.
 * News never carries over, and neither does anything already done.
 */
export function carryOverCards(prev: DayFeed | null | undefined): Card[] {
  if (!prev) return [];
  return prev.cards
    .filter((c) => c.kind !== 'news' && c.status !== 'done' && !!c.openedAt)
    .map((c) => ({ ...c, status: 'open' as CardStatus, continued: true }));
}

/** "Did you watch it?" the day after saying yes to a title. */
export function watchFollowUps(prev: DayFeed | null | undefined): Card[] {
  if (!prev) return [];
  return prev.cards
    .filter((c) => c.kind === 'watch' && c.watch?.stage === 'decided' && c.watch.willWatch)
    .map((c) => ({
      id: `${c.id}-followup`,
      kind: 'watch' as const,
      course: c.course,
      title: `Did you ${c.tag.startsWith('Book') ? 'read' : 'watch'} ${c.title}?`,
      hook: 'Rate it 1–10 so the next picks get closer to your taste.',
      tag: c.tag,
      cta: 'Rate it',
      blocks: [],
      status: 'open' as CardStatus,
      chat: [],
      watch: { stage: 'followup' as const },
    }));
}

/**
 * Builds a day's feed from fresh cards plus yesterday's carry-overs.
 * A carried card replaces a fresh card with the same id, and sits just before the
 * first fresh card of its kind so each course stays together.
 */
export function buildDay(day: string, fresh: Card[], prev: DayFeed | null | undefined, now = new Date()): DayFeed {
  const carried = [...carryOverCards(prev), ...watchFollowUps(prev)];
  const carriedIds = new Set(carried.map((c) => c.id));
  const cards: Card[] = [];
  const placed = new Set<string>();
  for (const card of fresh) {
    if (carriedIds.has(card.id)) continue;
    for (const c of carried) {
      if (c.kind === card.kind && !placed.has(c.id)) {
        cards.push(c);
        placed.add(c.id);
      }
    }
    cards.push({ ...card, status: 'open', chat: card.chat ?? [] });
  }
  for (const c of carried) if (!placed.has(c.id)) cards.push(c);
  return { day, builtAt: now.toISOString(), cards };
}

/**
 * Adds carry-overs a day is missing. The Mac may build tomorrow the night before,
 * before today's last lessons were opened, so the phone tops it up when the day starts.
 * For the same reason it drops an untouched lesson you finished the day before.
 */
export function addCarryOvers(feed: DayFeed, prev: DayFeed | null | undefined): DayFeed {
  const finished = new Set((prev?.cards ?? []).filter((c) => c.kind !== 'news' && c.status === 'done').map((c) => c.id));
  const kept = feed.cards.filter((c) => !(finished.has(c.id) && c.status === 'open' && !c.openedAt));
  const have = new Set(kept.map((c) => c.id));
  const missing = [...carryOverCards(prev), ...watchFollowUps(prev)].filter((c) => !have.has(c.id));
  if (!missing.length) return kept.length === feed.cards.length ? feed : { ...feed, cards: kept };
  const cards = [...kept];
  for (const c of missing) {
    const at = cards.findIndex((x) => x.kind === c.kind);
    cards.splice(at >= 0 ? at : cards.length, 0, { ...c, updatedAt: new Date().toISOString() });
  }
  return { ...feed, cards };
}

/**
 * Returns today's feed without rebuilding it if it already exists (idempotent).
 * `force` is the "Rebuild today's feed" button: it re-runs the build but keeps
 * the status, chat and opened state of any card that survives.
 */
export function ensureDay(
  feeds: Record<string, DayFeed>,
  day: string,
  fresh: Card[],
  opts: { force?: boolean; now?: Date } = {},
): DayFeed {
  const existing = feeds[day];
  if (existing && !opts.force) return existing;
  const prevDay = Object.keys(feeds)
    .filter((d) => d < day)
    .sort()
    .pop();
  const built = buildDay(day, fresh, prevDay ? feeds[prevDay] : null, opts.now);
  if (!existing) return built;
  const old = new Map(existing.cards.map((c) => [c.id, c]));
  return {
    ...built,
    cards: built.cards.map((c) => {
      const o = old.get(c.id);
      return o ? { ...c, status: o.status, chat: o.chat, openedAt: o.openedAt, watch: o.watch, practice: o.practice } : c;
    }),
  };
}

function update(feed: DayFeed, id: string, fn: (c: Card) => Card): DayFeed {
  const at = new Date().toISOString();
  return { ...feed, cards: feed.cards.map((c) => (c.id === id ? { ...fn(c), updatedAt: at } : c)) };
}

export const mark = (feed: DayFeed, id: string, status: Exclude<CardStatus, 'open'>) =>
  update(feed, id, (c) => ({ ...c, status }));

export const undo = (feed: DayFeed, id: string) => update(feed, id, (c) => ({ ...c, status: 'open' }));

export const markOpened = (feed: DayFeed, id: string, now = new Date()) =>
  update(feed, id, (c) => (c.openedAt ? c : { ...c, openedAt: now.toISOString() }));

export const patchCard = (feed: DayFeed, id: string, patch: Partial<Card>) =>
  update(feed, id, (c) => ({ ...c, ...patch }));

/** Scrolling past a news card counts as Skip. Other kinds stay open. */
export function autoSkipNewsBefore(feed: DayFeed, index: number): DayFeed {
  let changed = false;
  const cards = feed.cards.map((c, i) => {
    if (i < index && c.kind === 'news' && c.status === 'open') {
      changed = true;
      return { ...c, status: 'skip' as CardStatus };
    }
    return c;
  });
  return changed ? { ...feed, cards } : feed;
}

export function clearAllNews(feed: DayFeed): DayFeed {
  return {
    ...feed,
    cards: feed.cards.map((c) => (c.kind === 'news' && c.status === 'open' ? { ...c, status: 'skip' } : c)),
  };
}

export function progress(feed: DayFeed) {
  let done = 0;
  let skipped = 0;
  for (const c of feed.cards) {
    if (c.status === 'done') done++;
    else if (c.status === 'skip') skipped++;
  }
  const total = feed.cards.length;
  return { done, skipped, cleared: done + skipped, total, finished: total > 0 && done + skipped === total };
}

/** Index of the next open card after `from`, wrapping to the start; -1 when none are open. */
export function nextOpenIndex(feed: DayFeed, from: number): number {
  const n = feed.cards.length;
  for (let k = 1; k <= n; k++) {
    const i = (from + k) % n;
    if (feed.cards[i].status === 'open') return i;
  }
  return -1;
}

/** Consecutive finished days ending today (or yesterday, if today isn't finished yet). */
export function streak(feeds: Record<string, DayFeed>, today: string): number {
  const finished = (d: string) => !!feeds[d] && progress(feeds[d]).finished;
  let d = finished(today) ? today : prevDay(today);
  let count = 0;
  while (finished(d)) {
    count++;
    d = prevDay(d);
  }
  return count;
}

export function prevDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d - 1));
  return dt.toISOString().slice(0, 10);
}

export function prevDayN(day: string, n: number): string {
  let d = day;
  for (let i = 0; i < n; i++) d = prevDay(d);
  return d;
}
