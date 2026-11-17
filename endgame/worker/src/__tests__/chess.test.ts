import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { checkBlock } from '../../../shared/blocks.ts';
import { findMistakes, phaseOf, severity, winChance } from '../chess/analyze.ts';
import { openingName, toRow } from '../chess/chesscom.ts';
import { deviations, interleave, namesMatchLine, notationTopics, resolveBoards, reviewTopic } from '../chess/course.ts';
import { explainSan, makeDrills, type DrillKind } from '../chess/drills.ts';
import { fromPgn, numbered, play, sanTokens, START } from '../chess/lines.ts';
import { buildReport, type AnalyzedGame } from '../chess/report.ts';

// A real game (Morphy's "Opera game", 1858): castling, captures, checks and mate.
const OPERA = '1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0';
// Promotion and en passant, built move by move.
const SPECIAL = '1. e4 a6 2. e5 d5 3. exd6 h6 4. dxc7 h5 5. cxb8=Q Rxb8';

describe('lines', () => {
  it('reads numbered notation and replays it', () => {
    assert.deepEqual(sanTokens('1. e4 e5 2.Nf3 Nc6 3...Bc5!? 1-0'), ['e4', 'e5', 'Nf3', 'Nc6', 'Bc5']);
    const p = play('1. e4 e5 2. Nf3')!;
    assert.deepEqual(p.sans, ['e4', 'e5', 'Nf3']);
    assert.equal(p.fens.length, 4);
    assert.equal(play('1. e4 e5 2. Ke3'), null);
  });

  it('numbers moves from any position', () => {
    assert.equal(numbered(['e4', 'e5', 'Nf3']), '1. e4 e5 2. Nf3');
    const afterE4 = play('e4')!.fens[1];
    assert.equal(numbered(['e5', 'Nf3'], afterE4), '1... e5 2. Nf3');
  });
});

describe('boards from Claude', () => {
  it('turns position and moves into a FEN, and drops illegal boards', () => {
    const { blocks, dropped } = resolveBoards(
      [
        { type: 'text', text: 'x' },
        { type: 'chessBoard', moves: 'e4 e5', caption: 'ok' },
        { type: 'chessBoard', position: 'P1', moves: 'Nf3' },
        { type: 'chessBoard', position: 'P1', moves: 'Ke3' },
        { type: 'chessBoard', position: 'P9' },
      ],
      { P1: play('e4 e5')!.fens[2] },
    );
    assert.equal(dropped, 2);
    assert.equal(blocks.length, 3);
    assert.equal(blocks[1].fen, play('e4 e5')!.fens[2]);
    assert.equal(blocks[2].fen, play('e4 e5 Nf3')!.fens[3]);
    assert.ok(blocks.every((b) => checkBlock(b) === null));
  });
});

describe('drills', () => {
  const games = [fromPgn(OPERA)!, fromPgn(SPECIAL)!];
  const kinds: DrillKind[] = ['square', 'find-piece', 'dest-piece', 'dest-pawn', 'capture', 'check', 'castle', 'promotion', 'disambiguation', 'en-passant', 'move-number', 'symbols', 'mixed-dest', 'mixed-play', 'read-game'];

  it('every kind makes drills that pass the app validator', () => {
    for (const k of kinds) {
      const ds = makeDrills(k, games, 4, `seed-${k}`);
      assert.ok(ds.length > 0, `${k} made no drills`);
      for (const d of ds) assert.equal(checkBlock(d), null, `${k}: ${JSON.stringify(d)}`);
    }
  });

  it('drills match their notation idea', () => {
    for (const d of makeDrills('castle', games, 4, 's')) assert.match((d as any).answer, /^O-O/);
    for (const d of makeDrills('promotion', games, 4, 's')) assert.match((d as any).answer, /=Q/);
    assert.equal((makeDrills('en-passant', games, 1, 's')[0] as any).answer, 'exd6');
    for (const d of makeDrills('disambiguation', games, 4, 's')) assert.match((d as any).question, /Nbd7/);
  });

  it('is the same for the same card', () => {
    assert.deepEqual(makeDrills('mixed-dest', games, 4, 'chess-1-15'), makeDrills('mixed-dest', games, 4, 'chess-1-15'));
  });

  it('explains notation in words', () => {
    assert.equal(explainSan('Nxe5+'), 'Nxe5+: knight takes on e5, with check.');
    assert.equal(explainSan('e8=Q#'), 'e8=Q#: pawn to e8, promoting to a queen, checkmate.');
    assert.equal(explainSan('O-O-O'), 'O-O-O: castling queenside (the long side).');
  });
});

describe('analysis', () => {
  it('rates moves by lost winning chances', () => {
    assert.equal(Math.round(winChance(0)), 50);
    assert.equal(severity(35), 'blunder');
    assert.equal(severity(22), 'mistake');
    assert.equal(severity(5), null);
  });

  it('finds your mistakes only, from both colours’ evaluations', () => {
    const p = play('e4 e5 Qh5 Nc6 Bc4 Nf6 Qxf7#')!;
    // Engine view from the side to move at each position (cp). Black's 3...Nf6?? drops from about level to lost.
    const evals = [20, -20, 10, -10, 30, -30, 9999, -10000].map((cp) => ({ cp }));
    const r = findMistakes(p.fens, p.sans, evals, 'b');
    assert.equal(r.mistakes.length, 1);
    assert.equal(r.mistakes[0].played, 'Nf6');
    assert.equal(r.mistakes[0].moveNo, 3);
    assert.equal(r.mistakes[0].kind, 'blunder');
    assert.equal(findMistakes(p.fens, p.sans, evals, 'w').mistakes.length, 0);
  });

  it('knows the phase', () => {
    assert.equal(phaseOf(START, 5), 'opening');
    assert.equal(phaseOf(START, 20), 'middlegame');
    assert.equal(phaseOf('8/5k2/8/8/8/2R5/5K2/8 w - - 0 50', 50), 'endgame');
  });
});

describe('chess.com', () => {
  it('names the opening family', () => {
    assert.equal(openingName('https://www.chess.com/openings/Slav-Defense-3.Nc3-Nf6-4.e3-Bf5'), 'Slav Defense');
    assert.equal(openingName('https://www.chess.com/openings/Caro-Kann-Defense'), 'Caro Kann Defense');
  });

  it('reads a game from your side', () => {
    const r = toRow({
      url: 'u',
      rules: 'chess',
      time_class: 'rapid',
      end_time: 1792719445,
      pgn: '[ECO "D10"]\n1. d4 d5',
      eco: 'https://www.chess.com/openings/Slav-Defense',
      white: { username: 'e4d4knight', rating: 1323, result: 'win' },
      black: { username: '2atw1k', rating: 1291, result: 'resigned' },
    })!;
    assert.deepEqual([r.color, r.result, r.my_rating, r.opponent, r.eco, r.opening], ['b', 'loss', 1291, 'e4d4knight', 'D10', 'Slav Defense']);
    assert.equal(toRow({ rules: 'chess960', pgn: 'x' }), null);
  });
});

describe('report and syllabus', () => {
  const game = (opening: string, color: 'w' | 'b', result: 'win' | 'loss' | 'draw', i: number): AnalyzedGame => ({
    url: `g${opening}${color}${i}`,
    end_time: `2026-10-${String(10 + (i % 15)).padStart(2, '0')}T00:00:00Z`,
    time_class: 'rapid',
    color,
    result,
    my_rating: 1290,
    opponent: 'x',
    opp_rating: 1300,
    eco: 'A20',
    opening,
    pgn: '',
    analysis: null,
  });

  it('scores openings by colour and finds the weakest', () => {
    const gs = [
      ...Array.from({ length: 8 }, (_, i) => game('English Opening', 'w', i < 6 ? 'win' : 'loss', i)),
      ...Array.from({ length: 7 }, (_, i) => game('Caro Kann Defense', 'b', i < 2 ? 'win' : 'loss', i)),
    ];
    const r = buildReport(gs, '2026-07-01');
    assert.equal(r.asWhite[0].opening, 'English Opening');
    assert.equal(r.asWhite[0].score, 75);
    assert.equal(r.worst[0].opening, 'Caro Kann Defense');
    assert.equal(r.worst[0].color, 'b');
  });

  it('notation comes first, then openings with a review after every two', () => {
    assert.equal(notationTopics().length, 18);
    assert.ok(notationTopics().every((t) => t.data?.drill));
    const o = (n: number) => ({ id: '', unit: 'Your openings', title: `o${n}`, hook: '', minutes: 8 });
    const rv = reviewTopic({ ply: 20, moveNo: 11, played: 'Qb6', best: 'Be7', fen: START, before: 60, after: 20, kind: 'blunder', phase: 'middlegame', url: 'u', opening: 'x', color: 'b', opponent: 'Bob', result: 'loss' });
    assert.doesNotMatch(rv.hook, /Be7/);
    assert.deepEqual(interleave([o(1), o(2), o(3)], [rv]).map((t) => t.title), ['o1', 'o2', 'Your game vs Bob: move 11', 'o3']);
  });

  it('counts where your games left the line', () => {
    const line = play('c4 e5 Nc3 Nf6 g3')!.sans;
    const gs = [play('c4 e5 Nc3 Nf6 g3 d5')!, play('c4 e5 Nc3 Nf6 Nf3')!, play('c4 e5 Nc3 Nf6 Nf3')!, play('c4 c5')!];
    const d = deviations(line, gs, 'w');
    assert.equal(d.followed, 1);
    assert.deepEqual(d.leftAt, [['3. Nf3', 2]]);
  });
});

describe('opening topics', () => {
  it('titles may only name moves that are in the line', () => {
    const sans = play('c4 e5 Nc3 Nc6 g3 g6 Bg2 Bg7')!.sans;
    assert.ok(namesMatchLine('English: the 3...g6 fianchetto with 4.Bg2', sans));
    assert.ok(!namesMatchLine('English: Closed Reversed Sicilian 3...Bb4', sans));
    assert.ok(namesMatchLine('No moves named here', sans));
  });
});
