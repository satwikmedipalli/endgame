import type { Card, DayFeed } from '../../../shared/types.ts';
import { ask } from '../claude.ts';
import { addSeen, loadReactions, loadSeen, type Db, type Seen } from '../db.ts';
import { alreadySeen, describe, ERAS, pick, score, signal, slug, THEMES, type Scores } from './taste.ts';

export const HISTORY_PER_DAY = 2;
const PREFIX = 'history-';
const REGIONS = ['Africa', 'East Asia', 'South Asia', 'Southeast Asia', 'Central Asia', 'the Middle East', 'Europe', 'Latin America', 'North America', 'Oceania'];

export type Story = { title: string; hook: string; era: string; theme: string; place: string; year: string };

const SCHEMA = {
  type: 'object',
  properties: {
    stories: {
      type: 'array',
      minItems: 6,
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          hook: { type: 'string' },
          era: { enum: [...ERAS] },
          theme: { enum: [...THEMES] },
          place: { type: 'string' },
          year: { type: 'string' },
        },
        required: ['title', 'hook', 'era', 'theme', 'place', 'year'],
      },
    },
  },
  required: ['stories'],
};

export const historyCard = (s: Story): Card => ({
  id: `${PREFIX}${slug(s.title)}`,
  kind: 'history',
  course: 'history',
  title: s.title,
  hook: s.hook,
  tag: `${s.place} · ${s.year}`,
  cta: 'Explain',
  blocks: [],
  status: 'open',
  chat: [],
});

/** Era, theme and place scores from what you opened, finished and skipped. */
export async function historyTaste(db: Db, seen: Seen<Story>[]): Promise<Scores> {
  const byKey = new Map(seen.map((s) => [s.key, s.meta]));
  const items = (await loadReactions(db, 'history'))
    .map((r) => ({ meta: byKey.get(r.id.slice(PREFIX.length)), signal: signal(r) }))
    .filter((x): x is { meta: Story; signal: number } => !!x.meta)
    .map((x) => ({ traits: [x.meta.era, x.meta.theme], signal: x.signal }));
  return score(items);
}

/** Today's history teasers: one small Haiku call, checked against everything ever shown. */
export async function historyCards(db: Db, day: string, existing: DayFeed | null, carried: Card[], log: (m: string) => void): Promise<Card[]> {
  const seen = await loadSeen<Story>(db, 'history');
  const keys = new Set(seen.map((s) => s.key));
  // A re-run of Sync keeps today's picks instead of asking again.
  const today = (existing?.cards ?? []).filter((c) => c.kind === 'history' && keys.has(c.id.slice(PREFIX.length)));
  const n = HISTORY_PER_DAY - carried.filter((c) => c.kind === 'history').length - today.length;
  if (n <= 0) return today;

  const taste = await historyTaste(db, seen);
  const rnd = <T>(l: readonly T[]) => l[Math.floor(Math.random() * l.length)];
  log('choosing history stories');
  const out = await ask<{ stories: Story[] }>({
    model: 'haiku',
    schema: SCHEMA,
    timeoutMs: 180_000,
    system: 'You pick true, surprising, well-documented historical anecdotes for a curious adult. Never invent events.',
    prompt: `Suggest 8 historical anecdotes that make great short stories: surprising, true and story-worthy, from any era, country and topic.
Spread them widely. Today's nudge: at least two from ${rnd(REGIONS)}, and at least two from ${rnd(ERAS)}.
${describe(taste) ? `What I've enjoyed so far (use for about half of them; keep the rest varied): ${describe(taste)}` : 'I have no history yet; surprise me.'}

For each:
- title: an intriguing heading under 60 characters (not a question, no clickbait)
- hook: one line under 100 characters that makes me want the full story, without giving away the ending
- era and theme from the allowed lists
- place: the country or city, short
- year: like "1932" or "c. 300 BC"

Never suggest any of these, or the same event under another name:
${seen.slice(-250).map((s) => `- ${s.meta.title}`).join('\n') || '- (none yet)'}`,
  });

  const fresh: Story[] = [];
  for (const s of out.stories) if (!alreadySeen(s.title, [...seen.map((x) => x.meta), ...fresh])) fresh.push(s);
  const picks = pick(fresh, n, (s) => [s.era, s.theme], taste);
  await addSeen(db, 'history', picks.map((p) => ({ key: slug(p.title), meta: { ...p, day } })));
  return [...today, ...picks.map(historyCard)];
}
