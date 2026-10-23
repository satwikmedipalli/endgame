import type { Analysis, Mistake, Phase } from './analyze.ts';
import type { GameRow } from './chesscom.ts';

// The weekly picture of your chess: what you play, where you score worst, and where
// games go wrong. Built from data only; Claude later explains it, never invents it.

export type OpeningStat = { opening: string; eco: string; games: number; wins: number; draws: number; losses: number; score: number };
export type Example = Mistake & { url: string; opening: string | null; color: 'w' | 'b'; opponent: string | null; result: GameRow['result'] };
export type Report = {
  generatedAt: string;
  since: string;
  games: number;
  rating: number | null;
  record: { wins: number; draws: number; losses: number };
  asWhite: OpeningStat[];
  asBlack: OpeningStat[];
  /** Openings with at least MIN_GAMES games, lowest score first. */
  worst: (OpeningStat & { color: 'w' | 'b' })[];
  analyzed: number;
  perGame: { mistakes: number; blunders: number };
  /** Median move number of your first mistake or blunder. */
  firstMistakeMove: number | null;
  phases: Record<Phase, number>;
  /** Your costliest mistakes, real positions for lessons. */
  examples: Example[];
};

export type AnalyzedGame = GameRow & { analysis: Analysis | null };

const MIN_GAMES = 6;

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function openingStats(games: AnalyzedGame[]): OpeningStat[] {
  const by = new Map<string, OpeningStat & { ecos: Map<string, number> }>();
  for (const g of games) {
    const name = g.opening ?? 'Unknown';
    const s = by.get(name) ?? { opening: name, eco: '', games: 0, wins: 0, draws: 0, losses: 0, score: 0, ecos: new Map() };
    s.games++;
    s[g.result === 'win' ? 'wins' : g.result === 'draw' ? 'draws' : 'losses']++;
    if (g.eco) s.ecos.set(g.eco, (s.ecos.get(g.eco) ?? 0) + 1);
    by.set(name, s);
  }
  return [...by.values()]
    .map(({ ecos, ...s }) => ({ ...s, eco: [...ecos.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '', score: Math.round(((s.wins + s.draws / 2) / s.games) * 100) }))
    .sort((a, b) => b.games - a.games);
}

/** Pure: games in, report out. Exported for tests. */
export function buildReport(games: AnalyzedGame[], since: string, now = new Date()): Report {
  const white = games.filter((g) => g.color === 'w');
  const black = games.filter((g) => g.color === 'b');
  const asWhite = openingStats(white);
  const asBlack = openingStats(black);
  const worst = [...asWhite.map((s) => ({ ...s, color: 'w' as const })), ...asBlack.map((s) => ({ ...s, color: 'b' as const }))]
    .filter((s) => s.games >= MIN_GAMES && s.opening !== 'Unknown')
    .sort((a, b) => a.score - b.score)
    .slice(0, 5);
  const analyzed = games.filter((g) => g.analysis);
  const all = analyzed.flatMap((g) => g.analysis!.mistakes.map((m) => ({ ...m, url: g.url, opening: g.opening, color: g.color, opponent: g.opponent, result: g.result })));
  const phases: Record<Phase, number> = { opening: 0, middlegame: 0, endgame: 0 };
  for (const m of all) phases[m.phase]++;
  const latest = [...games].sort((a, b) => b.end_time.localeCompare(a.end_time))[0];
  return {
    generatedAt: now.toISOString(),
    since,
    games: games.length,
    rating: latest?.my_rating ?? null,
    record: {
      wins: games.filter((g) => g.result === 'win').length,
      draws: games.filter((g) => g.result === 'draw').length,
      losses: games.filter((g) => g.result === 'loss').length,
    },
    asWhite: asWhite.slice(0, 8),
    asBlack: asBlack.slice(0, 8),
    worst,
    analyzed: analyzed.length,
    perGame: {
      mistakes: analyzed.length ? Math.round((all.filter((m) => m.kind === 'mistake').length / analyzed.length) * 10) / 10 : 0,
      blunders: analyzed.length ? Math.round((all.filter((m) => m.kind === 'blunder').length / analyzed.length) * 10) / 10 : 0,
    },
    firstMistakeMove: median(analyzed.map((g) => g.analysis!.firstMistakePly).filter((p): p is number => p !== null).map((p) => Math.floor(p / 2) + 1)),
    phases,
    // Biggest swings first; one per game so a single collapse doesn't fill the list.
    examples: all
      .sort((a, b) => b.before - b.after - (a.before - a.after))
      .filter((m, i, l) => l.findIndex((x) => x.url === m.url) === i)
      .slice(0, 15),
  };
}

/** The report as plain lines, for prompts. */
export function reportText(r: Report): string {
  const fmt = (s: OpeningStat) => `${s.opening} (${s.eco}): ${s.games} games, ${s.score}% score`;
  return [
    `Since ${r.since.slice(0, 10)}: ${r.games} games (${r.record.wins} W / ${r.record.draws} D / ${r.record.losses} L), rating ${r.rating ?? '?'}.`,
    `As White: ${r.asWhite.slice(0, 5).map(fmt).join('; ') || 'no data'}.`,
    `As Black: ${r.asBlack.slice(0, 5).map(fmt).join('; ') || 'no data'}.`,
    `Weakest: ${r.worst.map((s) => `${s.opening} as ${s.color === 'w' ? 'White' : 'Black'} (${s.score}%)`).join('; ') || 'not enough games yet'}.`,
    r.analyzed
      ? `Stockfish over ${r.analyzed} games: ${r.perGame.mistakes} mistakes and ${r.perGame.blunders} blunders per game; the first one typically comes around move ${r.firstMistakeMove}. Mistakes by phase: opening ${r.phases.opening}, middlegame ${r.phases.middlegame}, endgame ${r.phases.endgame}.`
      : 'No engine analysis yet.',
  ].join('\n');
}
