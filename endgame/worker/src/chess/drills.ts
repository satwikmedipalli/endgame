import { Chess } from 'chess.js';

import type { Block } from '../../../shared/types.ts';
import { numbered, type Played } from './lines.ts';

// Notation drills made in code from positions in your own games: no Claude, so
// every square and move is right by construction.

export type DrillKind =
  | 'square'
  | 'find-piece'
  | 'dest-piece'
  | 'dest-pawn'
  | 'capture'
  | 'check'
  | 'castle'
  | 'promotion'
  | 'disambiguation'
  | 'en-passant'
  | 'move-number'
  | 'symbols'
  | 'mixed-dest'
  | 'mixed-play'
  | 'read-game';

/** Small seeded generator so a card's drills are the same every time they're built. */
export function rng(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

type Ply = { fen: string; san: string; ply: number };
const NAMES: Record<string, string> = { K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight' };
const turnOf = (fen: string) => fen.split(' ')[1] as 'w' | 'b';
const label = (p: Ply) => numbered([p.san], p.fen);

const FILTERS: Partial<Record<DrillKind, (san: string, fen: string) => boolean>> = {
  'dest-piece': (s) => /^[NBRQK][a-h][1-8][+#]?$/.test(s),
  'dest-pawn': (s) => /^[a-h][1-8][+#]?$/.test(s),
  capture: (s) => s.includes('x'),
  check: (s) => /[+#]$/.test(s),
  castle: (s) => s.startsWith('O-O'),
  promotion: (s) => s.includes('='),
  disambiguation: (s) => /^[NBRQ]([a-h]|[1-8]|[a-h][1-8])x?[a-h][1-8]/.test(s),
  'en-passant': (s, fen) => {
    try {
      return /^[a-h]x/.test(s) && new Chess(fen).move(s).isEnPassant();
    } catch {
      return false;
    }
  },
  'mixed-dest': (s) => !s.startsWith('O-O'),
  'mixed-play': () => true,
};

/** What a move in notation says, in words: "Nxe5+: knight takes on e5, with check." */
export function explainSan(san: string): string {
  if (san.startsWith('O-O-O')) return `${san}: castling queenside (the long side).`;
  if (san.startsWith('O-O')) return `${san}: castling kingside (the short side).`;
  const piece = NAMES[san[0]] ?? 'pawn';
  const to = /([a-h][1-8])(=[QRBN])?[+#]?$/.exec(san);
  const parts = [`${piece} ${san.includes('x') ? 'takes on' : 'to'} ${to?.[1] ?? '?'}`];
  if (to?.[2]) parts.push(`promoting to a ${NAMES[to[2][1]]}`);
  if (san.endsWith('#')) parts.push('checkmate');
  else if (san.endsWith('+')) parts.push('with check');
  return `${san}: ${parts.join(', ')}.`;
}

const SYMBOLS: [string, string][] = [
  ['!', 'a good move'],
  ['?', 'a mistake'],
  ['!!', 'a brilliant move'],
  ['??', 'a blunder'],
  ['!?', 'an interesting move, worth trying'],
  ['?!', 'a dubious move'],
];

function shuffle<T>(l: T[], r: () => number): T[] {
  const a = [...l];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function makeDrills(kind: DrillKind, games: Played[], n: number, seed: string): Block[] {
  const r = rng(seed);
  const plies: Ply[] = games.flatMap((g) => g.sans.map((san, ply) => ({ fen: g.fens[ply], san, ply })));
  if (!plies.length) return [];
  const anyPly = () => plies[Math.floor(r() * plies.length)];
  const out: Block[] = [];

  if (kind === 'symbols') {
    for (const [sym, meaning] of shuffle(SYMBOLS, r).slice(0, n)) {
      const options = shuffle([meaning, ...shuffle(SYMBOLS.filter(([s]) => s !== sym).map(([, m]) => m), r).slice(0, 3)], r);
      const p = anyPly();
      out.push({ type: 'quiz', question: `What does ${label(p)}${sym} say about the move?`, options, answer: options.indexOf(meaning), explain: `${sym} means ${meaning}.` });
    }
    return out;
  }

  if (kind === 'move-number') {
    for (let i = 0; i < n; i++) {
      const p = anyPly();
      const black = turnOf(p.fen) === 'b';
      out.push({
        type: 'quiz',
        question: `Who played ${label(p)}?`,
        options: ['White', 'Black'],
        answer: black ? 1 : 0,
        explain: black ? 'Three dots after the move number mean it is Black’s move.' : 'A number with one dot is White’s move; Black’s reply follows it.',
      });
    }
    return out;
  }

  if (kind === 'square' || kind === 'find-piece') {
    for (let i = 0; i < n * 4 && out.length < n; i++) {
      const p = anyPly();
      const orientation = r() < 0.3 ? ('b' as const) : ('w' as const);
      const side = orientation === 'b' ? ' (the board is shown from Black’s side)' : '';
      if (kind === 'square') {
        const sq = 'abcdefgh'[Math.floor(r() * 8)] + (1 + Math.floor(r() * 8));
        out.push({ type: 'chessDrill', fen: p.fen, question: `Tap the square ${sq}${side}.`, mode: 'square', answer: sq, explain: `${sq}: file ${sq[0]} (the column), rank ${sq[1]} (the row).`, orientation });
      } else {
        // A piece that side has exactly one of, so the answer is unique.
        const board = new Chess(p.fen).board().flat().filter(Boolean) as { square: string; type: string; color: 'w' | 'b' }[];
        const color = r() < 0.5 ? 'w' : 'b';
        const unique = ['k', 'q', 'r', 'b', 'n'].filter((t) => board.filter((x) => x.type === t && x.color === color).length === 1);
        if (!unique.length) continue;
        const type = unique[Math.floor(r() * unique.length)];
        const sq = board.find((x) => x.type === type && x.color === color)!.square;
        const letter = type.toUpperCase();
        out.push({ type: 'chessDrill', fen: p.fen, question: `Where is ${color === 'w' ? 'White' : 'Black'}’s ${NAMES[letter]} (${letter})?${side}`, mode: 'square', answer: sq, explain: `${letter} is the ${NAMES[letter]}; it stands on ${sq}.`, orientation });
      }
    }
    return out;
  }

  if (kind === 'read-game') {
    // Play the opening of one of your games, move by move, from its notation.
    const g = games[Math.floor(r() * games.length)];
    for (let ply = 0; ply < Math.min(n, g.sans.length); ply++) {
      const p = { fen: g.fens[ply], san: g.sans[ply], ply };
      out.push({ type: 'chessDrill', fen: p.fen, question: `Play ${label(p)}.`, mode: 'move', answer: p.san, explain: explainSan(p.san), orientation: turnOf(p.fen) });
    }
    return out;
  }

  const filter = FILTERS[kind]!;
  const pool = shuffle(plies.filter((p) => filter(p.san, p.fen)), r);
  const seen = new Set<string>();
  const destMode = kind === 'dest-piece' || kind === 'dest-pawn' || kind === 'capture' || kind === 'mixed-dest';
  for (const p of pool) {
    if (out.length >= n) break;
    if (seen.has(p.san)) continue;
    seen.add(p.san);
    if (destMode) {
      const to = new Chess(p.fen).move(p.san).to;
      out.push({ type: 'chessDrill', fen: p.fen, question: `Where does ${label(p)} go? Tap the square.`, mode: 'square', answer: to, explain: explainSan(p.san), orientation: turnOf(p.fen) });
    } else {
      out.push({ type: 'chessDrill', fen: p.fen, question: `Play ${label(p)}.`, mode: 'move', answer: p.san, explain: explainSan(p.san), orientation: turnOf(p.fen) });
    }
  }
  return out;
}
