import { similarity, tokens } from '../news/cluster.ts';

// Taste learned only from your reactions: what you open, finish, skip and rate.

export const ERAS = ['Ancient (before 500 BC)', 'Classical (500 BC–500 AD)', 'Medieval (500–1500)', 'Early modern (1500–1800)', '1800s', '1900–1945', '1945–2000', 'Since 2000'] as const;
export const THEMES = ['war', 'science', 'invention', 'politics', 'crime', 'disaster', 'exploration', 'art and culture', 'sport', 'money', 'religion', 'everyday life', 'oddities', 'remarkable people'] as const;

export const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

/** +2 finished, +1 opened, -1 skipped without opening, 0 never touched. */
export function signal(r: { status: string; opened: boolean }): number {
  if (r.status === 'done') return 2;
  if (r.opened) return 1;
  return r.status === 'skip' ? -1 : 0;
}

export type Scores = Map<string, number>;

/** Adds each reaction's signal to every trait it has (era, theme, region…). */
export function score(items: { traits: string[]; signal: number }[]): Scores {
  const s: Scores = new Map();
  for (const it of items) for (const t of it.traits) s.set(t, (s.get(t) ?? 0) + it.signal);
  return s;
}

/** "Likes: war (+5), science (+3). Less keen on: sport (-2)." or '' with no data yet. */
export function describe(s: Scores, top = 4): string {
  const sorted = [...s.entries()].filter(([, v]) => v !== 0).sort((a, b) => b[1] - a[1]);
  const likes = sorted.filter(([, v]) => v > 0).slice(0, top);
  const dislikes = sorted.filter(([, v]) => v < 0).slice(-2).reverse();
  const fmt = (l: [string, number][]) => l.map(([k, v]) => `${k} (${v > 0 ? '+' : ''}${v})`).join(', ');
  return [likes.length ? `Likes: ${fmt(likes)}.` : '', dislikes.length ? `Less keen on: ${fmt(dislikes)}.` : ''].filter(Boolean).join(' ');
}

/** True if a title is the same story as one already shown (exact slug or near-identical words). */
export function alreadySeen(title: string, seen: { title: string }[]): boolean {
  const k = slug(title);
  const tk = tokens(title);
  return seen.some((s) => slug(s.title) === k || (tk.size >= 3 && similarity(tk, tokens(s.title)) >= 0.75));
}

/**
 * Picks `n` candidates: the first by taste (when there is any), the rest at random,
 * so you keep discovering things outside what you already like.
 */
export function pick<T>(candidates: T[], n: number, traits: (c: T) => string[], s: Scores, rng = Math.random): T[] {
  const pool = [...candidates];
  const out: T[] = [];
  if (pool.length && [...s.values()].some((v) => v !== 0)) {
    let best = 0;
    let bestScore = -Infinity;
    pool.forEach((c, i) => {
      const v = traits(c).reduce((sum, t) => sum + (s.get(t) ?? 0), 0);
      if (v > bestScore) [best, bestScore] = [i, v];
    });
    out.push(...pool.splice(best, 1));
  }
  while (out.length < n && pool.length) out.push(...pool.splice(Math.floor(rng() * pool.length), 1));
  return out;
}
