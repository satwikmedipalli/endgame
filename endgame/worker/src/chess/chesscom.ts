// Chess.com public API: read-only, no key. Their rules ask for serial requests
// (no parallel calls) and a User-Agent with a way to reach you.
import type { Db } from '../db.ts';

export const USERNAME = '2atw1k';
// The contact comes from the environment (worker/.env or the Action's secrets), not git.
const UA = `Endgame personal learning app (contact: ${process.env.ENDGAME_EMAIL ?? 'unknown'})`;
const API = 'https://api.chess.com/pub/player';

export type GameRow = {
  url: string;
  end_time: string;
  time_class: string;
  color: 'w' | 'b';
  result: 'win' | 'loss' | 'draw';
  my_rating: number | null;
  opponent: string | null;
  opp_rating: number | null;
  eco: string | null;
  opening: string | null;
  pgn: string;
};

const DRAWS = new Set(['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient']);

/** "https://www.chess.com/openings/Slav-Defense-3.Nc3-Nf6" → "Slav Defense" (the family, without moves). */
export function openingName(ecoUrl?: string): string | null {
  if (!ecoUrl) return null;
  const slugPart = ecoUrl.split('/openings/')[1];
  if (!slugPart) return null;
  const words = slugPart.split('-');
  const cut = words.findIndex((w) => /^\d+\./.test(w) || /^\d+$/.test(w));
  return (cut > 0 ? words.slice(0, cut) : words).join(' ').replace(/\s+with\s*$/i, '').trim() || null;
}

/** One Chess.com game as a row, from your side of the board. Exported for tests. */
export function toRow(g: any, me = USERNAME): GameRow | null {
  if (g.rules !== 'chess' || !g.pgn) return null;
  const white = g.white?.username?.toLowerCase() === me.toLowerCase();
  const mine = white ? g.white : g.black;
  const theirs = white ? g.black : g.white;
  const result = mine?.result === 'win' ? 'win' : DRAWS.has(mine?.result) ? 'draw' : 'loss';
  const eco = /\[ECO "([^"]+)"\]/.exec(g.pgn)?.[1] ?? null;
  return {
    url: g.url,
    end_time: new Date(g.end_time * 1000).toISOString(),
    time_class: g.time_class,
    color: white ? 'w' : 'b',
    result,
    my_rating: mine?.rating ?? null,
    opponent: theirs?.username ?? null,
    opp_rating: theirs?.rating ?? null,
    eco,
    opening: openingName(g.eco ?? /\[ECOUrl "([^"]+)"\]/.exec(g.pgn)?.[1]),
    pgn: g.pgn,
  };
}

async function get(url: string): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.ok) return res.json();
    // 429 means slow down; wait and retry a couple of times.
    if (res.status === 429 && attempt < 3) await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
    else throw new Error(`chess.com ${res.status} for ${url}`);
  }
}

/** Pulls the last `months` monthly archives (one at a time) and upserts them. Analysis already done is kept. */
export async function importGames(db: Db, months: number, log: (m: string) => void): Promise<number> {
  const { archives } = await get(`${API}/${USERNAME}/games/archives`);
  let total = 0;
  for (const url of (archives as string[]).slice(-months)) {
    const { games } = await get(url);
    const rows = (games as any[]).map((g) => toRow(g)).filter((r): r is GameRow => !!r);
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await db.sb.from('chess_games').upsert(
        rows.slice(i, i + 500).map((r) => ({ ...r, user_id: db.userId })),
        { onConflict: 'user_id,url' },
      );
      if (error) throw error;
    }
    total += rows.length;
    log(`imported ${rows.length} games from ${url.split('/games/')[1]}`);
  }
  return total;
}
