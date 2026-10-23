import { XMLParser } from 'fast-xml-parser';

import type { Source } from './sources.ts';

export type Item = {
  title: string;
  summary: string;
  link: string;
  /** The outlet that wrote it (Google News items name the real publisher). */
  outlet: string;
  published: number;
  source: Source;
};

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@' });
const PER_FEED = 30;

const text = (v: unknown): string => {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (typeof v === 'object' && '#text' in (v as object)) return String((v as { '#text': unknown })['#text']);
  return '';
};

export function cleanText(s: string): string {
  return s
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;|&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/&#8211;|&#8212;/g, '–')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Parses RSS 2.0, RDF and Atom into items. Exported for tests. */
export function parseFeed(xml: string, source: Source): Item[] {
  const doc = parser.parse(xml);
  const raw: any[] = [doc?.rss?.channel?.item, doc?.['rdf:RDF']?.item, doc?.feed?.entry].flat().filter(Boolean);
  const items: Item[] = [];
  for (const it of raw.slice(0, PER_FEED * 2)) {
    let title = cleanText(text(it.title));
    if (!title) continue;
    let outlet = source.name;
    // Google News: "Headline - Publisher", with the publisher also in <source>.
    if (source.url.includes('news.google.com')) {
      const pub = cleanText(text(it.source));
      const cut = title.lastIndexOf(' - ');
      if (cut > 20) {
        outlet = pub || title.slice(cut + 3);
        title = title.slice(0, cut);
      }
    }
    const link = typeof it.link === 'string' ? it.link : (it.link?.['@href'] ?? text(it.link) ?? '');
    const when = Date.parse(text(it.pubDate) || text(it['dc:date']) || text(it.updated) || text(it.published));
    const summary = source.url.includes('news.google.com') ? '' : cleanText(text(it.description) || text(it.summary) || text(it.content)).slice(0, 600);
    items.push({ title, summary, link, outlet, published: Number.isFinite(when) ? when : 0, source });
  }
  return items.sort((a, b) => b.published - a.published).slice(0, PER_FEED);
}

export async function fetchFeed(source: Source): Promise<Item[]> {
  const res = await fetch(source.url, {
    headers: { 'user-agent': 'Mozilla/5.0 (Macintosh) Endgame/1.0 (personal news reader)' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`${source.name} ${res.status}`);
  return parseFeed(await res.text(), source);
}

export async function fetchAll(sources: Source[]): Promise<{ items: Item[]; failed: string[] }> {
  const results = await Promise.allSettled(sources.map(fetchFeed));
  const items: Item[] = [];
  const failed: string[] = [];
  results.forEach((r, i) => (r.status === 'fulfilled' ? items.push(...r.value) : failed.push(`${sources[i].name} (${sources[i].url})`)));
  return { items, failed };
}
