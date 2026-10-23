import { addDays, NEW_WORD, review, wordId, type Grade, type WordState } from '../../../app/src/lib/srs.ts';
import type { Block, Card } from '../../../app/src/lib/types.ts';
import type { Db } from '../db.ts';

// Italian: each card is a word review (words due today, scheduled with SM-2), then
// the day's new words or grammar point, then a short chat in Italian.

/** Keeps the review within about 4 minutes of the 10-minute card. */
export const MAX_REVIEW = 15;

type VocabRow = WordState & { id: string; it: string; en: string; note: string | null };

export async function dueWords(db: Db, day: string, max = MAX_REVIEW): Promise<VocabRow[]> {
  const { data, error } = await db.sb.from('vocab').select('id, it, en, note, ease, interval, reps, lapses, due').eq('lang', 'it').lte('due', day).order('due').limit(max);
  if (error) throw error;
  return (data ?? []) as VocabRow[];
}

export const reviewBlock = (words: VocabRow[]): Block[] =>
  words.length ? [{ type: 'vocabReview', items: words.map((w) => ({ id: w.id, it: w.it, en: w.en, ...(w.note ? { note: w.note } : {}) })) }] : [];

export const PRACTICE: Block = {
  type: 'callout',
  label: 'Practice',
  text: 'Tap “Chat with me in Italian” below for a short conversation using today’s words. A few lines is enough.',
};

/** The words a lesson teaches: its italianPhrase blocks marked learn. Pure. */
export function learnedWords(card: Card, topicId: string) {
  const seen = new Set<string>();
  return card.blocks.flatMap((b) => {
    if (b.type !== 'italianPhrase' || !b.learn) return [];
    const id = wordId(b.it);
    if (!id || seen.has(id)) return [];
    seen.add(id);
    return [{ id, it: b.it, en: b.en, note: b.note ?? null, topic: topicId }];
  });
}

/** Schedules every graded word. Pure: rows in, updated rows out. */
export function applyGrades(rows: VocabRow[], grades: Record<string, Grade>, day: string): VocabRow[] {
  return rows.filter((r) => grades[r.id]).map((r) => ({ ...r, ...review(r, grades[r.id], day) }));
}

/** DONE on an Italian card: schedule what you reviewed and add today's new words to the deck. */
export async function applyPractice(db: Db, card: Card, day: string, topicId: string) {
  const grades = card.practice?.grades ?? {};
  const ids = Object.keys(grades);
  let reviewed = 0;
  if (ids.length) {
    const { data, error } = await db.sb.from('vocab').select('id, it, en, note, ease, interval, reps, lapses, due').eq('lang', 'it').in('id', ids);
    if (error) throw error;
    const next = applyGrades((data ?? []) as VocabRow[], grades, day);
    if (next.length) {
      const now = new Date().toISOString();
      const u = await db.sb.from('vocab').upsert(next.map((r) => ({ ...r, lang: 'it', user_id: db.userId, last_review: now })));
      if (u.error) throw u.error;
    }
    reviewed = next.length;
  }
  const learned = learnedWords(card, topicId);
  if (learned.length) {
    // New words come back tomorrow; a word you already have keeps its schedule.
    const rows = learned.map((w) => ({ ...w, ...NEW_WORD, due: addDays(day, 1), lang: 'it', user_id: db.userId }));
    const { error } = await db.sb.from('vocab').upsert(rows, { onConflict: 'user_id,lang,id', ignoreDuplicates: true });
    if (error) throw error;
  }
  return { reviewed, learned: learned.length };
}
