import type { Card, DayFeed } from '../../../shared/types.ts';
import { ask } from '../claude.ts';
import { addSeen, loadReactions, loadSeen, type Db, type Reaction, type Seen } from '../db.ts';
import { alreadySeen, describe, pick, score, slug, type Scores } from './taste.ts';

// One movie, TV show or book a day. No preloaded taste: it learns only from
// Interested / Not for me, Will you watch it?, and your 1–10 ratings.

export type WatchType = 'film' | 'tv' | 'book';
export type Title = { title: string; type: WatchType; year: number; byline: string; genres: string[] };

const PREFIX = 'watch-';
const TYPE_LABEL: Record<WatchType, string> = { film: 'Film', tv: 'TV', book: 'Book' };
/** Share of days that ignore taste and pick at random, so it keeps exploring. */
const EXPLORE = 0.3;

const SCHEMA = {
  type: 'object',
  properties: {
    titles: {
      type: 'array',
      minItems: 4,
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          type: { enum: ['film', 'tv', 'book'] },
          year: { type: 'integer' },
          byline: { type: 'string' },
          genres: { type: 'array', items: { type: 'string' } },
        },
        required: ['title', 'type', 'year', 'byline', 'genres'],
      },
    },
  },
  required: ['titles'],
};

export const titleKey = (t: { type: string; title: string }) => `${t.type}-${slug(t.title)}`;
/** The seen key behind a watch card or its "Did you watch it?" follow-up. */
export const keyOfCard = (id: string) => id.slice(PREFIX.length).replace(/-followup$/, '');

export const watchCard = (t: Title): Card => ({
  id: `${PREFIX}${titleKey(t)}`,
  kind: 'watch',
  course: 'watch',
  title: t.title,
  hook: t.byline,
  tag: `${TYPE_LABEL[t.type]} · ${t.year}`,
  cta: 'Interested?',
  blocks: [],
  status: 'open',
  chat: [],
  watch: { stage: 'teaser' },
});

export type Verdict = { key: string; interested?: boolean; willWatch?: boolean; rating?: number; comment?: string; signal: number };

/**
 * Folds a title's card and its follow-up into one verdict. A rating says the most
 * (rating − 5, so 1 → −4 and 10 → +5); otherwise Not for me −2, a plain skip −1,
 * Interested +1, Yes I'll watch +2.
 */
export function verdicts(reactions: Reaction[]): Verdict[] {
  const by = new Map<string, Verdict>();
  for (const r of reactions) {
    const key = keyOfCard(r.id);
    const v = by.get(key) ?? { key, signal: 0 };
    const w = r.watch;
    if (r.id.endsWith('-followup')) {
      if (w?.rating) Object.assign(v, { rating: w.rating, comment: w.comment });
    } else if (w?.stage === 'pitch' || w?.stage === 'decided') {
      v.interested = true;
      if (w.stage === 'decided') v.willWatch = !!w.willWatch;
    } else if (r.status === 'skip') {
      v.interested = r.opened ? false : undefined;
    }
    by.set(key, v);
  }
  for (const v of by.values())
    v.signal = v.rating ? v.rating - 5 : v.willWatch ? 2 : v.interested ? 1 : v.interested === false ? -2 : 0;
  // A plain skip from the feed (never opened) is a weak no.
  for (const r of reactions) {
    const v = by.get(keyOfCard(r.id))!;
    if (!r.id.endsWith('-followup') && r.status === 'skip' && !r.opened && v.signal === 0) v.signal = -1;
  }
  return [...by.values()];
}

/** Your taste in words, for the model: trait scores plus your actual ratings. */
export function profile(vs: Verdict[], seen: Map<string, Title>, s: Scores): string {
  const rated = vs
    .filter((v) => v.rating && seen.has(v.key))
    .slice(-15)
    .map((v) => `- ${seen.get(v.key)!.title} (${seen.get(v.key)!.type}): ${v.rating}/10${v.comment ? ` — "${v.comment}"` : ''}`);
  const no = vs
    .filter((v) => v.interested === false && seen.has(v.key))
    .slice(-10)
    .map((v) => seen.get(v.key)!.title);
  return [describe(s, 6), rated.length ? `My ratings:\n${rated.join('\n')}` : '', no.length ? `Not for me: ${no.join(', ')}` : ''].filter(Boolean).join('\n');
}

export async function watchTaste(db: Db) {
  const seen = await loadSeen<Title>(db, 'watch');
  const meta = new Map(seen.map((s) => [s.key, s.meta]));
  const vs = verdicts(await loadReactions(db, 'watch'));
  const scores = score(vs.filter((v) => meta.has(v.key)).map((v) => ({ traits: traitsOf(meta.get(v.key)!), signal: v.signal })));
  return { seen, meta, vs, scores, text: profile(vs, meta, scores) };
}

const traitsOf = (t: Title) => [t.type, ...t.genres.map((g) => g.toLowerCase())];

/** Rotates types so films, shows and books all come up: the least-shown recently wins. */
export function nextType(seen: Seen<Title>[], rng = Math.random): WatchType {
  const recent = seen.slice(-9).map((s) => s.meta.type);
  const counts = (['film', 'tv', 'book'] as const).map((t) => [t, recent.filter((r) => r === t).length] as const);
  const min = Math.min(...counts.map(([, n]) => n));
  const options = counts.filter(([, n]) => n === min).map(([t]) => t);
  return options[Math.floor(rng() * options.length)];
}

export async function watchCards(db: Db, day: string, existing: DayFeed | null, log: (m: string) => void): Promise<Card[]> {
  const taste = await watchTaste(db);
  const today = (existing?.cards ?? []).filter((c) => c.kind === 'watch' && !c.id.endsWith('-followup') && taste.meta.has(keyOfCard(c.id)));
  if (today.length) return today;

  const type = nextType(taste.seen);
  const explore = !taste.text || Math.random() < EXPLORE;
  log(`choosing a ${type}${explore ? ' (exploring)' : ''}`);
  const out = await ask<{ titles: Title[] }>({
    model: 'haiku',
    schema: SCHEMA,
    timeoutMs: 180_000,
    system: 'You recommend real, well-regarded films, TV shows and books. Only titles that exist, with correct years and creators.',
    prompt: `Suggest 5 ${type === 'film' ? 'films' : type === 'tv' ? 'TV shows' : 'books'} for me, best fit first.
${explore ? 'Pick widely: different decades, countries and genres, acclaimed but not only the obvious classics.' : `My taste so far:\n${taste.text}\nRecommend things I'm likely to love, with one wildcard.`}

For each: title, type "${type}", year (first release or publication), byline (like "Directed by Denis Villeneuve", "Created by Vince Gilligan", "By Ursula K. Le Guin"), and 1–3 genres.

Never suggest any of these:
${taste.seen.slice(-300).map((s) => `- ${s.meta.title}`).join('\n') || '- (none yet)'}`,
  });

  const fresh: Title[] = [];
  for (const t of out.titles) if (!taste.meta.has(titleKey(t)) && !alreadySeen(t.title, [...taste.seen.map((s) => s.meta), ...fresh])) fresh.push(t);
  const [choice] = explore ? pick(fresh, 1, () => [], new Map()) : pick(fresh, 1, traitsOf, taste.scores);
  if (!choice) return [];
  await addSeen(db, 'watch', [{ key: titleKey(choice), meta: { ...choice, day } }]);
  return [watchCard(choice)];
}

/** Keeps the ratings table (shown on Progress) in step with your reactions. */
export async function saveRatings(db: Db) {
  const { vs, meta } = await watchTaste(db);
  const rows = vs
    .filter((v) => meta.has(v.key) && (v.interested !== undefined || v.rating))
    .map((v) => ({
      user_id: db.userId,
      title_key: v.key,
      title: meta.get(v.key)!.title,
      interested: v.interested ?? null,
      will_watch: v.willWatch ?? null,
      rating: v.rating ?? null,
      comment: v.comment ?? null,
      meta: meta.get(v.key),
      updated_at: new Date().toISOString(),
    }));
  if (!rows.length) return;
  const { error } = await db.sb.from('ratings').upsert(rows);
  if (error) throw error;
}
