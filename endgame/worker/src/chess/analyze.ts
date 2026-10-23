import { Chess } from 'chess.js';

import { Engine, type Eval } from './engine.ts';

// Finds your mistakes in a game with Stockfish. Severity uses the drop in winning
// chances (the scale Lichess uses), so a slip while already winning big isn't a "blunder".

export type Mistake = {
  ply: number;
  moveNo: number;
  /** What you played, in notation. */
  played: string;
  /** Stockfish's move instead, in notation. */
  best?: string;
  /** Position before your move. */
  fen: string;
  /** Your winning chances (0–100) before and after the move. */
  before: number;
  after: number;
  kind: 'inaccuracy' | 'mistake' | 'blunder';
  phase: Phase;
};
export type Phase = 'opening' | 'middlegame' | 'endgame';
export type Analysis = {
  depth: number;
  counts: Record<Mistake['kind'], number>;
  /** Mistakes and blunders only (inaccuracies are just counted). */
  mistakes: Mistake[];
  /** Ply of your first mistake or blunder. */
  firstMistakePly: number | null;
  plies: number;
};

export const winChance = (cp: number) => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);

export function severity(drop: number): Mistake['kind'] | null {
  if (drop >= 30) return 'blunder';
  if (drop >= 20) return 'mistake';
  if (drop >= 10) return 'inaccuracy';
  return null;
}

const VALUE: Record<string, number> = { q: 9, r: 5, b: 3, n: 3 };
export function phaseOf(fen: string, moveNo: number): Phase {
  if (moveNo <= 12) return 'opening';
  const pieces = fen.split(' ')[0];
  let material = 0;
  for (const ch of pieces) material += VALUE[ch.toLowerCase()] ?? 0;
  return material <= 26 ? 'endgame' : 'middlegame';
}

const uciToSan = (fen: string, uci?: string) => {
  if (!uci) return undefined;
  try {
    return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san;
  } catch {
    return undefined;
  }
};

/** Scores each of your moves from the evaluations before and after it. Pure, exported for tests. */
export function findMistakes(fens: string[], sans: string[], evals: Eval[], me: 'w' | 'b'): Omit<Analysis, 'depth'> {
  const counts = { inaccuracy: 0, mistake: 0, blunder: 0 };
  const mistakes: Mistake[] = [];
  for (let i = 0; i < sans.length; i++) {
    const toMove = i % 2 === 0 ? 'w' : 'b';
    if (toMove !== me) continue;
    // evals[i] is from the mover's view (you); evals[i + 1] from your opponent's.
    const before = winChance(evals[i].cp);
    const after = 100 - winChance(evals[i + 1].cp);
    const kind = severity(before - after);
    if (!kind) continue;
    counts[kind]++;
    if (kind === 'inaccuracy') continue;
    const moveNo = Math.floor(i / 2) + 1;
    mistakes.push({ ply: i, moveNo, played: sans[i], best: uciToSan(fens[i], evals[i].best), fen: fens[i], before: Math.round(before), after: Math.round(after), kind, phase: phaseOf(fens[i], moveNo) });
  }
  return { counts, mistakes, firstMistakePly: mistakes[0]?.ply ?? null, plies: sans.length };
}

export async function analyzeGame(engine: Engine, pgn: string, me: 'w' | 'b', depth = 12): Promise<Analysis> {
  const game = new Chess();
  game.loadPgn(pgn);
  const history = game.history({ verbose: true });
  const fens = [history[0]?.before ?? game.fen(), ...history.map((m) => m.after)];
  const evals: Eval[] = [];
  for (const fen of fens) {
    const g = new Chess(fen);
    // Finished positions need no engine: mate is lost for the side to move, stalemate is level.
    if (g.isCheckmate()) evals.push({ cp: -10_000 });
    else if (g.isDraw()) evals.push({ cp: 0 });
    else evals.push(await engine.evaluate(fen, depth));
  }
  return { depth, ...findMistakes(fens, history.map((m) => m.san), evals, me) };
}
