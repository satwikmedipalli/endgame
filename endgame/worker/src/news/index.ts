import { parseBlocks } from '../../../shared/blocks.ts';
import { HOME } from '../../../shared/sun.ts';
import type { Block, Card } from '../../../shared/types.ts';
import { cluster, hashKey, similarity, tokens } from './cluster.ts';
import { fetchAll } from './rss.ts';
import { QUOTA, SOURCES, type Region } from './sources.ts';
import { choose, itemsOf, latestOf, outletsOf, triage, writeStories } from './write.ts';

const REGION_LABEL: Record<Region, string> = { US: 'US', IN: 'IN', World: 'World' };

function timeLabel(ms: number) {
  if (!ms) return '';
  return new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: HOME.tz });
}

export type NewsResult = { cards: Card[]; failedFeeds: string[]; candidates: number };

/**
 * RSS → dedupe in code → Haiku triage (leftover duplicates, region, importance)
 * → Sonnet writes headline + deep dive. `recentTitles` keeps yesterday's stories out.
 */
export async function buildNews(day: string, recentTitles: string[], log: (m: string) => void): Promise<NewsResult> {
  const { items, failed } = await fetchAll(SOURCES);
  log(`fetched ${items.length} items from ${SOURCES.length - failed.length}/${SOURCES.length} feeds`);
  // Drop stories already shown yesterday (headlines are rewritten, so compare key words).
  const recent = recentTitles.map(tokens);
  const clusters = cluster(items).filter((c) => !recent.some((r) => similarity(tokens(c.items[0].title), r) >= 0.75));
  log(`${clusters.length} stories after merging duplicates`);
  const stories = choose(await triage(clusters), QUOTA);
  log(`picked ${stories.length} stories; writing deep dives`);
  const written = await writeStories(stories);

  const cards = stories.map((s, i): Card => {
    const w = written[i];
    const outlets = outletsOf(s);
    const parsed = parseBlocks(w.blocks);
    const lead = itemsOf(s)[0];
    const blocks: Block[] = parsed.ok ? parsed.blocks : [{ type: 'text', text: lead.summary || lead.title }];
    blocks.push({ type: 'callout', label: 'Covered by', text: outlets.join(', ') });
    return {
      id: `news-${day}-${hashKey(s.clusters[0].key)}`,
      kind: 'news',
      title: w.headline || lead.title,
      hook: [outlets[0], timeLabel(latestOf(s))].filter(Boolean).join(' · '),
      tag: `${REGION_LABEL[s.region]} · ${s.category}`,
      cta: 'Deep dive',
      sources: outlets.length,
      blocks,
      status: 'open',
      chat: [],
    };
  });
  return { cards, failedFeeds: failed, candidates: clusters.length };
}
