import { cardIdOf, LESSON_COURSES, LESSONS_PER_DAY, nextTopics, topicCard, topicIdOf } from '../../app/src/lib/course.ts';
import { buildDay, carryOverCards, dayKey } from '../../app/src/lib/feed.ts';
import { HOME } from '../../app/src/lib/sun.ts';
import type { Card, DayFeed } from '../../app/src/lib/types.ts';
import { loadCourse, loadDay, loadPrev, saveDay, type Db } from './db.ts';
import { historyCards } from './discover/history.ts';
import { saveRatings, watchCards } from './discover/watch.ts';
import { finishLesson } from './lessons/lesson.ts';
import { ensureCourse } from './lessons/syllabus.ts';
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
    if (!o) return c;
    // Content written on tap (a lesson, story or pitch) is kept even if you never touched the card again.
    const kept = !c.blocks.length && o.blocks.length ? { ...c, blocks: o.blocks } : c;
    return touched(o) ? { ...kept, status: o.status, openedAt: o.openedAt, chat: o.chat, watch: o.watch, practice: o.practice } : kept;
  });
  // A day the phone built before Sync holds nothing of its own (carry-overs, which Sync
  // rebuilds, or old placeholders), so only Sync-built days keep cards the new build dropped.
  const ids = new Set(cards.map((c) => c.id));
  const extra = existing.source === 'sync' ? existing.cards.filter((c) => !ids.has(c.id) && touched(c)) : [];
  const keptNews = extra.filter((c) => c.kind === 'news');
  const keptOther = extra.filter((c) => c.kind !== 'news');
  const firstOther = cards.findIndex((c) => c.kind !== 'news');
  const at = firstOther >= 0 ? firstOther : cards.length;
  return { ...built, cards: [...cards.slice(0, at), ...keptNews, ...cards.slice(at), ...keptOther] };
}

/**
 * Teasers for the next topics in each course: titles and hooks from the stored
 * syllabus, no lesson yet. Carried-over lessons fill their course's slots first.
 */
async function lessonCards(db: Db, day: string, prev: DayFeed | null, existing: DayFeed | null, log: (m: string) => void): Promise<Card[]> {
  const carried = carryOverCards(prev);
  const cards: Card[] = [];
  for (const id of LESSON_COURSES) {
    const course = await ensureCourse(db, id, log);
    const mine = carried.filter((c) => c.course === id);
    // Keep any lesson you've already touched on this day (a re-run must not swap it out).
    const inSyllabus = (c: Card) => course.syllabus.some((t) => t.id === topicIdOf(id, c.id));
    const kept = (existing?.cards ?? []).filter((c) => c.course === id && inSyllabus(c) && (c.openedAt || c.status !== 'open'));
    const inFeed = new Set([...mine, ...kept].map((c) => c.id));
    const fresh = nextTopics(course, LESSONS_PER_DAY[id] - inFeed.size, inFeed).map((t) => topicCard(id, t, course.syllabus));
    cards.push(...kept.filter((c) => !mine.some((m) => m.id === c.id)), ...fresh);
  }
  return cards;
}

/** DONE normally queues a job that records the topic; this catches any the Mac missed. */
async function catchUpFinished(db: Db, day: string, log: (m: string) => void) {
  const since = new Date(Date.parse(day) - 14 * 86400_000).toISOString().slice(0, 10);
  const { data, error } = await db.sb.from('cards').select('day, id').eq('status', 'done').in('course', LESSON_COURSES).gte('day', since);
  if (error) throw error;
  // Only topics still unfinished in a syllabus (old sample cards and recorded ones are skipped).
  const unfinished = new Set<string>();
  for (const id of LESSON_COURSES) for (const t of (await loadCourse(db, id))?.syllabus ?? []) if (!t.doneAt) unfinished.add(cardIdOf(id, t.id));
  for (const r of data ?? []) {
    if (!unfinished.has(r.id)) continue;
    const res = await finishLesson(db, { day: r.day, card_id: r.id });
    if ('recorded' in res) log(`recorded finished lesson ${r.id}`);
  }
}

/** `lessonsOnly` keeps the day's news as is (no Claude calls for news). */
export async function syncDay(db: Db, opts: { day?: string; lessonsOnly?: boolean }, log: (m: string) => void): Promise<{ day: string; cards: number; news: number; failedFeeds: string[] }> {
  const day = opts.day ?? targetDay();
  log(`building ${day}`);
  const [prev, existing] = await Promise.all([loadPrev(db, day), loadDay(db, day)]);
  const recentTitles = (prev?.cards ?? []).filter((c) => c.kind === 'news').map((c) => c.title);
  await catchUpFinished(db, day, log);
  const news = opts.lessonsOnly && existing
    ? { cards: existing.cards.filter((c) => c.kind === 'news'), failedFeeds: [] as string[] }
    : await buildNews(day, recentTitles, log);
  await saveRatings(db).catch((e) => log(`ratings not saved: ${(e as Error).message}`));
  const lessons = [
    ...(await lessonCards(db, day, prev, existing, log)),
    ...(await historyCards(db, day, existing, carryOverCards(prev), log)),
    ...(await watchCards(db, day, existing, log)),
  ];
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
