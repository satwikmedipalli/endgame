import { Chess } from 'chess.js';

import type { Course, Topic } from '../../../shared/course.ts';
import { parseBlocks } from '../../../shared/blocks.ts';
import type { Block, Card } from '../../../shared/types.ts';
import { ask } from '../claude.ts';
import type { Db } from '../db.ts';
import { makeDrills, type DrillKind } from './drills.ts';
import { fromPgn, numbered, play, START, type Played } from './lines.ts';
import { reportText, type Example, type Report } from './report.ts';

// The chess course. Accuracy rule: Claude never supplies a position. Boards are
// built here from validated moves; drills are made in code from your games;
// evaluations come from Stockfish (weekly report) or the Lichess cloud.

const NOTATION: [string, string, DrillKind, number][] = [
  ['The board: files, ranks and squares', 'Every square has a name, like a street address.', 'square', 6],
  ['Find any square fast', 'Name a square and see it instantly: the base of everything else.', 'square', 5],
  ['Seeing the board from Black’s side', 'Same names, upside-down view. Your Black games look like this.', 'square', 5],
  ['Piece letters: K, Q, R, B, N', 'Five capital letters, and why the knight is N.', 'find-piece', 6],
  ['Writing a piece move: Nf3, Bc4', 'A letter and a square is a whole move.', 'dest-piece', 6],
  ['Pawn moves have no letter', 'e4 means a pawn goes to e4. That’s it.', 'dest-pawn', 5],
  ['Captures: the x in Nxe5', 'One small letter says something was taken.', 'capture', 6],
  ['Check and mate: + and #', 'The symbols at the end tell you the king is in danger.', 'check', 6],
  ['Castling: O-O and O-O-O', 'The only move that moves two pieces, written with zeros.', 'castle', 6],
  ['When two pieces can go there: Nbd2', 'An extra letter or number says which piece moved.', 'disambiguation', 7],
  ['Promotion: e8=Q', 'A pawn reaches the end and becomes something new.', 'promotion', 5],
  ['En passant, written down', 'The strangest capture in chess, and how it looks on paper.', 'en-passant', 6],
  ['Move numbers: 12. and 12...', 'Why Black’s moves get three dots.', 'move-number', 5],
  ['Judging moves: ! ? !! ?? !? ?!', 'The punctuation players use to praise and scold moves.', 'symbols', 5],
  ['Speed round: where does it go?', 'Read a move, see the square. Faster each time.', 'mixed-dest', 6],
  ['Speed round: play the move', 'Read notation and make the move on the board.', 'mixed-play', 6],
  ['Reading a whole game score', 'Play through the start of one of your own games from notation.', 'read-game', 8],
  ['Notation review: one of your games', 'If you can do this, every lesson from here speaks notation.', 'read-game', 8],
];

export const notationTopics = (): Topic[] =>
  NOTATION.map(([title, hook, drill, minutes], i) => ({ id: `1-${String(i + 1).padStart(2, '0')}`, unit: 'Notation', title, hook, minutes, data: { drill } }));

export async function loadReport(db: Db): Promise<Report | null> {
  const { data, error } = await db.sb.from('courses').select('report').eq('course', 'chess').maybeSingle();
  if (error) throw error;
  return (data?.report as Report) ?? null;
}

/** Your most recent games as positions, for drills and real examples. */
export async function loadGames(db: Db, n = 40, filter?: { opening?: string; color?: 'w' | 'b' }) {
  let q = db.sb.from('chess_games').select('url, pgn, color, result, opening, opponent, analysis').in('time_class', ['rapid', 'blitz', 'daily']);
  if (filter?.opening) q = q.ilike('opening', `${filter.opening}%`);
  if (filter?.color) q = q.eq('color', filter.color);
  const { data, error } = await q.order('end_time', { ascending: false }).limit(n);
  if (error) throw error;
  return (data ?? []).map((g) => ({ ...g, played: fromPgn(g.pgn) })).filter((g): g is typeof g & { played: Played } => !!g.played);
}

// ---------- syllabus ----------

const OPENINGS_SCHEMA = {
  type: 'object',
  properties: {
    topics: {
      type: 'array',
      minItems: 8,
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          hook: { type: 'string' },
          minutes: { type: 'number' },
          color: { enum: ['w', 'b'] },
          opening: { type: 'string' },
          line: { type: 'string' },
        },
        required: ['title', 'hook', 'minutes', 'color', 'opening', 'line'],
      },
    },
  },
  required: ['topics'],
};

/** Opening topics built around what you actually play; every line is replayed and kept only if legal. */
async function openingTopics(report: Report | null, log: (m: string) => void): Promise<Topic[]> {
  const out = await ask<{ topics: { title: string; hook: string; minutes: number; color: 'w' | 'b'; opening: string; line: string }[] }>({
    model: 'sonnet',
    schema: OPENINGS_SCHEMA,
    timeoutMs: 600_000,
    system: 'You are a chess coach planning an openings course for one club player. You return only the structured plan.',
    prompt: `Plan about 18 opening lessons, in a sensible order, for this player. Long-term goal: reach 2500.
${report ? `Their games:\n${reportText(report)}\n\nBuild the course around the openings they actually play as White and as Black, spend extra time on the ones where they score worst, and add one or two sound alternatives where their choice is weak.` : 'No game data yet: use a standard, sound repertoire for a club player (one first move as White, one defence to 1.e4 and one to 1.d4).'}

Each lesson is one idea in one opening, 8–12 minutes. For each:
- title: plain words under 60 characters, e.g. "English: meeting 1...e5"
- hook: one line under 90 characters
- color: "w" or "b", the side the player has in this lesson
- opening: the opening family name as Chess.com writes it, e.g. "English Opening", "Caro Kann Defense"
- line: the main line for the lesson in standard notation from the starting position, 6–14 plies, e.g. "1. c4 e5 2. Nc3 Nf6 3. g3"
Any move you name in the title or hook (like "3...Bb4") must be in the line at exactly that move number.`,
  });
  const topics: Topic[] = [];
  for (const t of out.topics) {
    const p = play(t.line);
    if (!p || p.sans.length < 2) {
      log(`dropped opening topic with an illegal line: ${t.title} (${t.line})`);
      continue;
    }
    if (!namesMatchLine(`${t.title} ${t.hook}`, p.sans)) {
      log(`dropped opening topic whose title names moves not in its line: ${t.title} (${t.line})`);
      continue;
    }
    topics.push({
      id: '',
      unit: 'Your openings',
      title: t.title,
      hook: t.hook,
      minutes: Math.max(5, Math.round(t.minutes)),
      data: { drill: 'opening', color: t.color, opening: t.opening, line: numbered(p.sans), fen: p.fens[p.fens.length - 1] },
    });
  }
  return topics;
}

/**
 * Moves named in a title or hook ("3...Bb4", "4.Bg2") must be in the line at that
 * move number, or the lesson would teach a different line than it promises. Exported for tests.
 */
export function namesMatchLine(text: string, sans: string[]): boolean {
  for (const m of text.matchAll(/(\d+)\.(\.\.)?\s?((?:O-O(?:-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?)[+#]?)/g)) {
    const ply = (Number(m[1]) - 1) * 2 + (m[2] ? 1 : 0);
    if (sans[ply]?.replace(/[+#]$/, '') !== m[3].replace(/[+#]$/, '')) return false;
  }
  return true;
}

const PHASE_WORD = { opening: 'In the opening', middlegame: 'In the middlegame', endgame: 'In the endgame' };

/** A lesson on one real mistake from your games. The hook never gives the answer away. */
export const reviewTopic = (e: Example): Topic => ({
  id: '',
  unit: 'Learning from your games',
  title: `Your game vs ${e.opponent ?? 'an opponent'}: move ${e.moveNo}`,
  hook: `${PHASE_WORD[e.phase]}, one move took you from ${e.before}% to ${e.after}%. Find the better one.`,
  minutes: 8,
  data: { drill: 'review', color: e.color, fen: e.fen, played: e.played, best: e.best, before: e.before, after: e.after, url: e.url, opening: e.opening },
});

/** Notation first, then openings with a review of one of your real mistakes after every two. */
export function interleave(openings: Topic[], reviews: Topic[]): Topic[] {
  const out: Topic[] = [];
  let r = 0;
  openings.forEach((o, i) => {
    out.push(o);
    if (i % 2 === 1 && r < reviews.length) out.push(reviews[r++]);
  });
  out.push(...reviews.slice(r));
  return out;
}

export async function writeChessSyllabus(db: Db, log: (m: string) => void): Promise<Topic[]> {
  const report = await loadReport(db);
  const later = interleave(await openingTopics(report, log), (report?.examples ?? []).filter((e) => e.best).slice(0, 8).map(reviewTopic));
  // Units 2 and 3 are numbered together so ids stay unique and in order.
  return [...notationTopics(), ...later.map((t, i) => ({ ...t, id: `2-${String(i + 1).padStart(2, '0')}` }))];
}

// ---------- lessons ----------

const str = { type: 'string' };
const CHESS_BLOCKS = {
  type: 'object',
  properties: {
    blocks: {
      type: 'array',
      minItems: 3,
      items: {
        type: 'object',
        properties: {
          type: { enum: ['heading', 'text', 'callout', 'chessBoard', 'quiz'] },
          text: str,
          label: str,
          caption: str,
          position: str,
          moves: str,
          arrows: { type: 'array', items: str },
          highlight: { type: 'array', items: str },
          orientation: { enum: ['w', 'b'] },
          question: str,
          options: { type: 'array', items: str },
          answer: { type: 'integer' },
          explain: str,
        },
        required: ['type'],
      },
    },
  },
  required: ['blocks'],
};

const GUIDE = `Return the lesson as JSON blocks, in reading order:
- heading {text}, text {text} (plain words, no markdown), callout {label, text}
- chessBoard {position?, moves?, caption, arrows?, highlight?, orientation?}: you never write a FEN. Name a position I gave you (position: "P3"), and optionally moves to play from it in standard notation (moves: "Nf3 Nc6"). With no position, moves start from the initial position. Arrows look like "g1f3", highlights like "e4". orientation "b" shows Black's side.
- quiz {question, options: 2–4, answer: index, explain}
Do not write drills; I add interactive drills after your lesson.
Every move you mention must be legal in its position, and use only the engine numbers I give you; never invent evaluations or claim a line is best unless I said so.`;

/** Turns position/moves references into FENs. Boards whose moves are illegal are dropped. Exported for tests. */
export function resolveBoards(raw: any[], positions: Record<string, string>): { blocks: any[]; dropped: number } {
  let dropped = 0;
  const blocks = raw.flatMap((b) => {
    if (b?.type !== 'chessBoard') return [b];
    const from = b.position ? positions[b.position] : START;
    const p = from && play(b.moves ?? '', from);
    if (!p) {
      dropped++;
      return [];
    }
    const { position, moves, ...rest } = b;
    return [{ ...rest, fen: p.fens[p.fens.length - 1] }];
  });
  return { blocks, dropped };
}

type CloudEval = { cp?: number; mate?: number; depth: number; line: string } | null;

/** Lichess cloud evaluation (no token needed). Null when the position isn't in their cache. */
export async function cloudEval(fen: string): Promise<CloudEval> {
  try {
    const res = await fetch(`https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(fen)}`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const d = (await res.json()) as { depth: number; pvs?: { moves: string; cp?: number; mate?: number }[] };
    const pv = d.pvs?.[0];
    if (!pv) return null;
    const g = new Chess(fen);
    const sans: string[] = [];
    for (const u of String(pv.moves).split(' ').slice(0, 6)) {
      try {
        sans.push(g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san);
      } catch {
        break;
      }
    }
    return { cp: pv.cp, mate: pv.mate, depth: d.depth, line: numbered(sans, fen) };
  } catch {
    return null;
  }
}

const evalWords = (e: CloudEval, fen: string) => {
  if (!e) return 'no engine evaluation available';
  // Lichess reports from White's side.
  const score = e.mate !== undefined ? `mate in ${Math.abs(e.mate)} for ${e.mate > 0 ? 'White' : 'Black'}` : `${e.cp! >= 0 ? '+' : ''}${(e.cp! / 100).toFixed(2)} (positive favours White)`;
  return `engine (Lichess cloud, depth ${e.depth}): ${score}; best line ${e.line} [${fen.split(' ')[1] === 'w' ? 'White' : 'Black'} to move]`;
};

/** How your own games in this opening left the lesson's line. Pure, exported for tests. */
export function deviations(line: string[], games: Played[], me: 'w' | 'b') {
  const leftAt = new Map<string, number>();
  let followed = 0;
  for (const g of games) {
    const i = line.findIndex((m, k) => g.sans[k] !== m);
    if (i < 0) {
      followed++;
      continue;
    }
    if (g.sans[i] === undefined) continue;
    // Only count where *you* left the line; your opponents' choices aren't your habit.
    if ((i % 2 === 0 ? 'w' : 'b') !== me) continue;
    const key = numbered([g.sans[i]], g.fens[i]);
    leftAt.set(key, (leftAt.get(key) ?? 0) + 1);
  }
  return { games: games.length, followed, leftAt: [...leftAt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4) };
}

async function writeWithBoards(system: string, prompt: string, positions: Record<string, string>, log: (m: string) => void): Promise<Block[]> {
  let errors: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const out = await ask<{ blocks: any[] }>({
      model: 'sonnet',
      system,
      prompt: errors.length ? `${prompt}\n\nA previous attempt had these problems; avoid them:\n${errors.join('\n')}` : prompt,
      schema: CHESS_BLOCKS,
      timeoutMs: 600_000,
    });
    const { blocks, dropped } = resolveBoards(out.blocks ?? [], positions);
    const valid = blocks.filter((b) => parseBlocks([b]).ok) as Block[];
    errors = [...(dropped ? [`${dropped} board(s) had illegal moves for their position`] : []), ...(parseBlocks(blocks).ok ? [] : (parseBlocks(blocks) as { errors: string[] }).errors)];
    if (!errors.length || attempt === 1) {
      if (errors.length) log(`kept ${valid.length} valid blocks; ${errors.length} problem(s) left out`);
      return valid;
    }
    log(`lesson had problems, retrying: ${errors.slice(0, 3).join('; ')}`);
  }
  return [];
}

export async function writeChessLesson(db: Db, course: Course, card: Card, log: (m: string) => void): Promise<Block[]> {
  const topicId = card.id.slice('chess-'.length);
  const at = course.syllabus.findIndex((t) => t.id === topicId);
  const topic = course.syllabus[at];
  if (!topic) throw new Error(`${card.id} is not in the chess syllabus`);
  const d = topic.data ?? {};
  const report = await loadReport(db);
  const before = course.syllabus.slice(Math.max(0, at - 4), at).map((t) => `- ${t.title}`).join('\n') || '- (first lesson)';
  const system = `You are the chess coach inside Endgame. One learner, rated about ${report?.rating ?? '1300'} on Chess.com, aiming for 2500. Warm, concrete, no filler.

${GUIDE}

Speak in notation from here on (e4, Nf3, Bxc6+), explaining any symbol the learner hasn't met yet. About ${topic.minutes} minutes of reading, plus the boards.`;
  const notes = course.summary ? `\nCourse notes so far:\n${course.summary}` : '';

  if (d.drill === 'opening') {
    const line = play(String(d.line))!;
    const positions = Object.fromEntries(line.fens.map((f, i) => [`P${i}`, f]));
    const mid = Math.floor(line.sans.length / 2);
    log('Checking the line with the Lichess engine');
    const [evMid, evEnd] = [await cloudEval(line.fens[mid]), await cloudEval(line.fens[line.fens.length - 1])];
    const mine = await loadGames(db, 60, { opening: String(d.opening ?? '').split(' ').slice(0, 2).join(' '), color: d.color as 'w' | 'b' });
    const dev = deviations(line.sans, mine.map((g) => g.played), d.color as 'w' | 'b');
    const slips = mine
      .flatMap((g) => ((g.analysis as any)?.mistakes ?? []).filter((m: any) => m.phase === 'opening').map((m: any) => ({ ...m, opponent: g.opponent })))
      .slice(0, 3);
    slips.forEach((m: any, i: number) => (positions[`G${i}`] = m.fen));
    const stat = [...(report?.asWhite ?? []), ...(report?.asBlack ?? [])].find((s) => s.opening.startsWith(String(d.opening ?? '')));
    const prompt = `Lesson ${at + 1}: ${topic.title} (${topic.unit}). The learner plays ${d.color === 'w' ? 'White' : 'Black'}.
Hook: ${topic.hook}
Lessons just before:\n${before}${notes}

The line (validated): ${d.line}
Positions: P0 is the start; P${line.sans.length} is after the whole line. ${line.sans.map((s, i) => `P${i + 1} = after ${numbered([s], line.fens[i])}`).join('; ')}.
After ${numbered(line.sans.slice(0, mid), START)}: ${evalWords(evMid, line.fens[mid])}.
At the end: ${evalWords(evEnd, line.fens[line.fens.length - 1])}.

The learner's own games in ${d.opening}${stat ? ` (${stat.games} recent games, ${stat.score}% score)` : ''}: of ${dev.games} games as ${d.color === 'w' ? 'White' : 'Black'}, ${dev.followed} followed this whole line. Where they left it: ${dev.leftAt.map(([m, n]) => `${m} (${n}×)`).join(', ') || 'no pattern yet'}.
${slips.length ? `Their opening mistakes found by Stockfish:\n${slips.map((m: any, i: number) => `- G${i}: vs ${m.opponent}, they played ${numbered([m.played], m.fen)}; Stockfish preferred ${m.best}; winning chances ${m.before}% → ${m.after}%`).join('\n')}` : ''}

Teach the ideas behind the moves (why each move, the plans for both sides, what to watch for), show 3–5 boards from these positions, and connect it to how the learner actually plays.`;
    const blocks = await writeWithBoards(system, prompt, positions, log);
    // Drills: play your side's main-line moves from the lesson's positions.
    const drills: Block[] = line.sans
      .map((san, i) => ({ san, fen: line.fens[i] }))
      .filter((m) => m.fen.split(' ')[1] === d.color)
      .slice(-3)
      .map((m) => ({ type: 'chessDrill', fen: m.fen, question: `Play the main-line move: ${numbered([m.san], m.fen).replace(/\S+$/, '?')}`, mode: 'move', answer: m.san, explain: `${numbered([m.san], m.fen)} is the move in this line.`, orientation: d.color as 'w' | 'b' }));
    return [...blocks, { type: 'heading', text: 'Your turn' }, ...drills];
  }

  if (d.drill === 'review') {
    const fen = String(d.fen);
    const played = play([String(d.played)], fen);
    const best = d.best ? play([String(d.best)], fen) : null;
    if (!played) throw new Error('the stored game position no longer replays');
    const positions: Record<string, string> = { P0: fen, P1: played.fens[1], ...(best ? { P2: best.fens[1] } : {}) };
    const ev = await cloudEval(fen);
    const prompt = `Lesson ${at + 1}: a mistake from the learner's own game (${d.opening ?? 'unknown opening'}, they had ${d.color === 'w' ? 'White' : 'Black'}).
P0: the position before their move. They played ${numbered([played.sans[0]], fen)} (P1 is after it). Stockfish preferred ${best ? numbered([best.sans[0]], fen) : 'another move'}${best ? ' (P2 is after it)' : ''}.
Stockfish (depth 12, from the weekly analysis): their winning chances went from ${d.before}% to ${d.after}%.
${ev ? `Also, ${evalWords(ev, fen)}.` : ''}${notes}

Explain what was going on in the position, what the played move allowed, and the idea behind the better move, using only the moves and numbers above. Show P0 (orientation "${d.color}"), P1 and${best ? ' P2' : ' nothing else'}. Do not reveal the better move before the drill below; describe the idea in words, then show P2 at the end.`;
    const blocks = await writeWithBoards(system, prompt, positions, log);
    const drill: Block[] = best
      ? [{ type: 'chessDrill', fen, question: `You played ${played.sans[0]} here. Find the move Stockfish preferred.`, mode: 'move', answer: best.sans[0], explain: `${best.sans[0]} keeps your chances; ${played.sans[0]} dropped them from ${d.before}% to ${d.after}%.`, orientation: d.color as 'w' | 'b' }]
      : [];
    // The drill comes first so the answer isn't on screen before you try.
    return [blocks[0], ...drill, ...blocks.slice(1)].filter(Boolean) as Block[];
  }

  // Notation: a short explanation (boards from your real positions), then drills made in code.
  const games = await loadGames(db, 40);
  const played = games.map((g) => g.played);
  const sample = played.flatMap((g) => g.sans.slice(0, 16).map((san, i) => ({ fen: g.fens[i], san }))).filter((_, i) => i % 7 === 3).slice(0, 6);
  const positions = Object.fromEntries(sample.map((s, i) => [`P${i}`, s.fen]));
  const prompt = `Lesson ${at + 1} of the notation unit: ${topic.title}
Hook: ${topic.hook}
Lessons just before:\n${before}${notes}

Positions from the learner's own recent games you may show (with the move they played there):
${sample.map((s, i) => `- P${i}: next move was ${numbered([s.san], s.fen)}`).join('\n')}

Explain this one notation idea from zero with an analogy, show 1–3 boards (from these positions, or moves from the start), and keep it short: drills follow.`;
  const blocks = await writeWithBoards(system, prompt, positions, log);
  const drills = makeDrills(String(d.drill) as DrillKind, played, 6, card.id);
  return [...blocks, { type: 'heading', text: 'Drills' }, ...drills];
}

