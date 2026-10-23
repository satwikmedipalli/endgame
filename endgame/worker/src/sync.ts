import { freshCards } from '../../app/src/data/sample.ts';
import { buildDay, dayKey } from '../../app/src/lib/feed.ts';
import { HOME } from '../../app/src/lib/sun.ts';
import type { Card, DayFeed } from '../../app/src/lib/types.ts';
import { loadDay, loadPrev, saveDay, type Db } from './db.ts';
import { buildNews } from './news/index.ts';

/** After this hour (Chicago), Sync prepares tomorrow instead of today. */
const TOMORROW_AFTER_HOUR = 17;

export function targetDay(now = new Date()): string {
  const hour = Number(now.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: HOME.tz })) % 24;
  const today = dayKey(now);
  if (hour < TOMORROW_AFTER_HOUR) return today;
  const [y, m, d] = today.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

const touched = (c: Card) => c.status !== 'open' || !!c.openedAt || c.chat.length > 0;

/**
 * Re-running Sync on a day you've started keeps everything you touched: marked,
 * opened or chatted cards stay (even if the new build dropped them); only untouched
 * cards are replaced. Exported for tests.
 */
export function mergeRebuild(built: DayFeed, existing: DayFeed | null): DayFeed {
  if (!existing) return built;
  const old = new Map(existing.cards.map((c) => [c.id, c]));
  const cards = built.cards.map((c) => {
    const o = old.get(c.id);
    return o && touched(o) ? { ...c, status: o.status, openedAt: o.openedAt, chat: o.chat, watch: o.watch } : c;
  });
  const ids = new Set(cards.map((c) => c.id));
  const keptNews = existing.cards.filter((c) => !ids.has(c.id) && touched(c) && c.kind === 'news');
  const keptOther = existing.cards.filter((c) => !ids.has(c.id) && touched(c) && c.kind !== 'news');
  const firstOther = cards.findIndex((c) => c.kind !== 'news');
  const at = firstOther >= 0 ? firstOther : cards.length;
  return { ...built, cards: [...cards.slice(0, at), ...keptNews, ...cards.slice(at), ...keptOther] };
}

export async function syncDay(db: Db, opts: { day?: string }, log: (m: string) => void): Promise<{ day: string; cards: number; news: number; failedFeeds: string[] }> {
  const day = opts.day ?? targetDay();
  log(`building ${day}`);
  const [prev, existing] = await Promise.all([loadPrev(db, day), loadDay(db, day)]);
  const recentTitles = (prev?.cards ?? []).filter((c) => c.kind === 'news').map((c) => c.title);
  const news = await buildNews(day, recentTitles, log);
  // Lessons stay the sample set until the lesson engine (milestone 4).
  const lessons = freshCards(day).filter((c) => c.kind !== 'news');
  const now = new Date();
  const built = buildDay(day, [...news.cards, ...lessons], prev, now);
  const merged = mergeRebuild(
    { ...built, source: 'sync', cards: built.cards.map((c) => ({ ...c, updatedAt: now.toISOString() })) },
    // A phone fallback day keeps your touched lessons but loses its placeholder news.
    existing?.source === 'sync' ? existing : existing && { ...existing, cards: existing.cards.filter((c) => c.kind !== 'news') },
  );
  await saveDay(db, merged);
  log(`saved ${day}: ${merged.cards.length} cards (${news.cards.length} news)`);
  return { day, cards: merged.cards.length, news: news.cards.length, failedFeeds: news.failedFeeds };
}
