// Deduplication in code (no AI): headlines about the same story are grouped, and
// the number of distinct outlets becomes "Covered by N sources".
import type { Region } from './sources.ts';
import type { Item } from './rss.ts';

const STOP = new Set(
  'a an the and or but of to in on at for from by with as is are was were be been has have had it its this that these those after over into amid says said say will would could can new us u.s. vs live updates update video watch what why how who when where top more than not no just about up out'.split(
    ' ',
  ),
);

export function tokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/['’]s\b/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
      // crude stemming so "strikes"/"strike" match
      .map((w) => (w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w)),
  );
}

export function similarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  // Overlap relative to the shorter headline: rewrites of one story share most key words.
  return shared / Math.min(a.size, b.size);
}

export type Cluster = {
  key: string;
  items: Item[];
  outlets: string[];
  region: Region;
  hint?: string;
  latest: number;
  score: number;
};

const SAME_STORY = 0.6;
const MIN_SHARED = 3;

export function cluster(items: Item[], now = Date.now(), maxAgeH = 36): Cluster[] {
  const fresh = items.filter((i) => !i.published || now - i.published < maxAgeH * 3600_000);
  const groups: { toks: Set<string>; items: Item[] }[] = [];
  for (const it of fresh) {
    const t = tokens(it.title);
    if (t.size < 2) continue;
    let best: (typeof groups)[number] | null = null;
    let bestSim = 0;
    for (const g of groups) {
      const s = similarity(t, g.toks);
      let shared = 0;
      for (const w of t) if (g.toks.has(w)) shared++;
      if (s >= SAME_STORY && shared >= Math.min(MIN_SHARED, t.size) && s > bestSim) {
        best = g;
        bestSim = s;
      }
    }
    if (best) {
      best.items.push(it);
      for (const w of t) best.toks.add(w);
    } else groups.push({ toks: new Set(t), items: [it] });
  }

  return groups.map((g) => {
    const outlets = [...new Set(g.items.map((i) => i.outlet))];
    // Region: whichever region's feeds carried it most (US/IN beat World on ties).
    const votes: Record<Region, number> = { US: 0, IN: 0, World: 0 };
    for (const i of g.items) votes[i.source.region]++;
    const region = (['US', 'IN', 'World'] as Region[]).reduce((a, b) => (votes[b] > votes[a] ? b : a));
    const hint = g.items.find((i) => i.source.hint)?.source.hint;
    const latest = Math.max(...g.items.map((i) => i.published));
    const ageH = latest ? (now - latest) / 3600_000 : 24;
    // More outlets = bigger story; newer = better.
    const score = outlets.length * 3 + Math.max(0, 24 - ageH) / 6;
    const lead = [...g.items].sort((a, b) => b.title.length - a.title.length)[0];
    return { key: [...tokens(lead.title)].sort().slice(0, 8).join('-'), items: g.items, outlets, region, hint, latest, score };
  });
}

export function hashKey(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}
