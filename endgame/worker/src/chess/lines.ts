import { Chess } from 'chess.js';

// Every move Claude mentions is replayed here before it can reach a board.

export const START = new Chess().fen();

/** "1. e4 e5 2.Nf3 Nc6 3...Bc5" → ["e4", "e5", "Nf3", "Nc6", "Bc5"]. */
export function sanTokens(line: string): string[] {
  return line
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/\d+\.(\.\.)?/g, ' ')
    .split(/\s+/)
    .map((s) => s.replace(/[!?]+$/, ''))
    .filter((s) => s && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(s));
}

export type Played = { sans: string[]; fens: string[] };

/** Plays a line from a position. Returns null if any move is illegal. `sans` are chess.js's own spellings. */
export function play(line: string | string[], from = START): Played | null {
  const g = new Chess(from);
  const sans: string[] = [];
  const fens = [g.fen()];
  for (const m of Array.isArray(line) ? line : sanTokens(line)) {
    try {
      sans.push(g.move(m).san);
      fens.push(g.fen());
    } catch {
      return null;
    }
  }
  return { sans, fens };
}

/** "e4 e5 Nf3" → "1. e4 e5 2. Nf3", numbered from the position's move number and side. */
export function numbered(sans: string[], from = START): string {
  const [, turn, , , , full] = from.split(' ');
  let n = Number(full) || 1;
  let white = turn !== 'b';
  const out: string[] = [];
  sans.forEach((s, i) => {
    if (white) out.push(`${n}. ${s}`);
    else out.push(i === 0 ? `${n}... ${s}` : s);
    if (!white) n++;
    white = !white;
  });
  return out.join(' ');
}

/** Positions and moves of a PGN. */
export function fromPgn(pgn: string): Played | null {
  const g = new Chess();
  try {
    g.loadPgn(pgn);
  } catch {
    return null;
  }
  const h = g.history({ verbose: true });
  return { sans: h.map((m) => m.san), fens: [h[0]?.before ?? START, ...h.map((m) => m.after)] };
}
