// Weekly chess analysis: import your Chess.com games, run Stockfish over the recent
// ones, and save the report for the chess course. Runs in a GitHub Action (see
// .github/workflows/chess-analysis.yml) or locally: `npm run chess-analysis`.
// No Claude here; only data.
import { connect, type Db } from '../db.ts';
import { analyzeGame } from './analyze.ts';
import { importGames } from './chesscom.ts';
import { Engine } from './engine.ts';
import { buildReport, type AnalyzedGame } from './report.ts';

const REPORT_DAYS = 90;
const MONTHS_TO_IMPORT = Number(process.env.CHESS_MONTHS ?? 3);
const ANALYZE_MAX = Number(process.env.CHESS_ANALYZE_MAX ?? 150);
const DEPTH = Number(process.env.CHESS_DEPTH ?? 12);
/** Bullet is mostly about the clock; it isn't worth studying move by move. */
const STUDIED = ['rapid', 'blitz', 'daily'];

const log = (m: string) => console.log(`${new Date().toISOString().slice(11, 19)} ${m}`);

async function recentGames(db: Db, since: string): Promise<AnalyzedGame[]> {
  const out: AnalyzedGame[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.sb
      .from('chess_games')
      .select('*')
      .gte('end_time', since)
      .in('time_class', STUDIED)
      .order('end_time', { ascending: false })
      .range(from, from + 999);
    if (error) throw error;
    out.push(...(data as AnalyzedGame[]));
    if (!data || data.length < 1000) return out;
  }
}

export async function weekly(db: Db) {
  await importGames(db, MONTHS_TO_IMPORT, log);
  const since = new Date(Date.now() - REPORT_DAYS * 86400_000).toISOString();
  const games = await recentGames(db, since);
  const todo = games.filter((g) => !g.analysis).slice(0, ANALYZE_MAX);
  log(`${games.length} games in the last ${REPORT_DAYS} days; analysing ${todo.length} at depth ${DEPTH}`);
  if (todo.length) {
    const engine = new Engine();
    await engine.init(Number(process.env.CHESS_THREADS ?? 2));
    for (const [i, g] of todo.entries()) {
      try {
        g.analysis = await analyzeGame(engine, g.pgn, g.color, DEPTH);
        const { error } = await db.sb.from('chess_games').update({ analysis: g.analysis }).eq('url', g.url);
        if (error) throw error;
      } catch (e) {
        log(`skipped ${g.url}: ${(e as Error).message}`);
      }
      if ((i + 1) % 10 === 0) log(`  ${i + 1}/${todo.length}`);
    }
    engine.quit();
  }
  const report = buildReport(games, since);
  const { error } = await db.sb.from('courses').upsert({ user_id: db.userId, course: 'chess', report, updated_at: new Date().toISOString() });
  if (error) throw error;
  log(`report saved: ${report.games} games, ${report.analyzed} analysed, ${report.examples.length} example mistakes`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  weekly(await connect())
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
