import { ask } from '../claude.ts';
import type { Cluster } from './cluster.ts';
import type { Region } from './sources.ts';

const TRIAGE_POOL = 140;

export type Story = { clusters: Cluster[]; region: Region; category: string; importance: number };

const TRIAGE_SCHEMA = {
  type: 'object',
  properties: {
    stories: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ids: { type: 'array', items: { type: 'integer' }, minItems: 1 },
          region: { type: 'string', enum: ['US', 'IN', 'World'] },
          category: { type: 'string' },
          importance: { type: 'integer', minimum: 1, maximum: 5 },
        },
        required: ['ids', 'region', 'category', 'importance'],
      },
    },
  },
  required: ['stories'],
};

/**
 * One cheap Haiku pass over the biggest candidate stories: merge leftovers that are
 * the same event, say where the story is about (not which feed carried it), and rate it.
 */
export async function triage(clusters: Cluster[]): Promise<Story[]> {
  const pool = [...clusters].sort((a, b) => b.score - a.score).slice(0, TRIAGE_POOL);
  const lines = pool.map((c, i) => `${i}. [${c.outlets.length} outlets] ${c.items[0].title}`).join('\n');
  const prompt = `Candidate news stories from US, Indian and world RSS feeds, numbered:

${lines}

Group numbers that are the SAME news event into one story (only true duplicates).
For each story give:
- region: "US" if mainly about the United States, "IN" if mainly about India, else "World"
- category: one or two words, e.g. Politics, Economy, Business, Tech, Science, Health, Climate, Sports, Cricket, Crime, Culture
- importance 1-5 for a general reader (5 = major national/world news; 1 = minor, local, opinion, podcasts, quizzes, live blogs)
Leave out pure opinion pieces, podcasts, quizzes, horoscopes and listicles entirely.`;
  const out = await ask<{ stories: { ids: number[]; region: Region; category: string; importance: number }[] }>({
    prompt,
    model: 'haiku',
    schema: TRIAGE_SCHEMA,
    system: 'You are a careful news editor. Answer only with the requested JSON.',
  });
  const used = new Set<number>();
  const stories: Story[] = [];
  for (const s of out.stories) {
    const ids = s.ids.filter((i) => Number.isInteger(i) && i >= 0 && i < pool.length && !used.has(i));
    if (!ids.length) continue;
    ids.forEach((i) => used.add(i));
    stories.push({ clusters: ids.map((i) => pool[i]), region: s.region, category: s.category.trim().slice(0, 20), importance: s.importance });
  }
  return stories;
}

export const outletsOf = (s: Story) => [...new Set(s.clusters.flatMap((c) => c.outlets))];
export const itemsOf = (s: Story) => s.clusters.flatMap((c) => c.items);
export const latestOf = (s: Story) => Math.max(...s.clusters.map((c) => c.latest));

/** Quotas per region, most important first, ties broken by how many outlets covered it. */
export function choose(stories: Story[], quota: Record<Region, number>): Story[] {
  const out: Story[] = [];
  for (const region of ['US', 'IN', 'World'] as Region[]) {
    const pool = stories
      .filter((s) => s.region === region)
      .sort((a, b) => b.importance - a.importance || outletsOf(b).length - outletsOf(a).length || latestOf(b) - latestOf(a));
    const perCat = new Map<string, number>();
    const cap = Math.ceil(quota[region] / 3);
    for (const s of pool) {
      if (out.filter((x) => x.region === region).length >= quota[region]) break;
      const n = perCat.get(s.category) ?? 0;
      if (n >= cap) continue;
      perCat.set(s.category, n + 1);
      out.push(s);
    }
  }
  return out;
}

export type Written = {
  headline: string;
  blocks: { type: 'heading' | 'text' | 'callout'; text: string; label?: string }[];
};

const WRITE_SCHEMA = {
  type: 'object',
  properties: {
    stories: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          n: { type: 'integer' },
          headline: { type: 'string' },
          blocks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['heading', 'text', 'callout'] },
                text: { type: 'string' },
                label: { type: 'string' },
              },
              required: ['type', 'text'],
            },
          },
        },
        required: ['n', 'headline', 'blocks'],
      },
    },
  },
  required: ['stories'],
};

const WRITE_SYSTEM = `You write the "deep dive" behind a headline in a calm, ad-free news app.
Rules:
- Facts about the event come ONLY from the source reports given. Never invent numbers, quotes, names or outcomes.
- You may add brief, well-established background (who someone is, what an institution does) to help a newcomer, but label it as context.
- Neutral tone. No hype, no "breaking", no clickbait. Plain words a curious non-expert understands.
- If sources disagree, say so. If the reports are thin, keep it short rather than padding.`;

/** Writes headline + deep dive for a few stories per call. */
export async function writeStories(stories: Story[]): Promise<Written[]> {
  const BATCH = 5;
  const batches: Story[][] = [];
  for (let i = 0; i < stories.length; i += BATCH) batches.push(stories.slice(i, i + BATCH));
  const results = await Promise.all(
    batches.map(async (batch) => {
      const body = batch
        .map((s, n) => {
          const reports = itemsOf(s)
            .slice(0, 8)
            .map((it) => `  - ${it.outlet}: ${it.title}${it.summary ? ` — ${it.summary}` : ''}`)
            .join('\n');
          return `Story ${n}:\n${reports}`;
        })
        .join('\n\n');
      const prompt = `${body}

For each story (use its number as n):
- headline: one neutral, specific headline, at most 14 words, sentence case
- blocks: the deep dive, 4–7 blocks:
  1. text: what happened, in 2–3 sentences
  2. heading "Why it matters" + a text block
  3. a callout labelled "Context" with background a newcomer needs (only well-established facts)
  4. if sources differ or key facts are unknown, a callout labelled "Still unclear"
  Keep the whole deep dive under 220 words.`;
      const out = await ask<{ stories: (Written & { n: number })[] }>({ prompt, model: 'sonnet', schema: WRITE_SCHEMA, system: WRITE_SYSTEM, timeoutMs: 300_000 });
      return batch.map((_, n) => out.stories.find((w) => w.n === n) ?? null);
    }),
  );
  return results.flat().map((w, i) => w ?? { headline: itemsOf(stories[i])[0].title, blocks: [] });
}
