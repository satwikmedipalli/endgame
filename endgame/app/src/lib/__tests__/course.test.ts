import { describe, expect, it } from '@jest/globals';

import * as C from '../course';
import { checkBlock } from '../blocks';

const course = (): C.Course => ({
  course: 'code',
  summary: '',
  syllabus: C.flattenSyllabus([
    { title: 'What programming is', topics: [{ title: 'Recipes for computers', hook: 'h', minutes: 6 }, { title: 'Your first program', hook: 'h', minutes: 7.4 }] },
    { title: 'Python basics', topics: [{ title: 'Variables', hook: 'h', minutes: 8 }, { title: 'Types', hook: 'h', minutes: 2 }] },
  ]),
});

describe('syllabus', () => {
  it('numbers topics by unit and keeps minutes sensible', () => {
    const s = course().syllabus;
    expect(s.map((t) => t.id)).toEqual(['1-01', '1-02', '2-01', '2-02']);
    expect(s[1].minutes).toBe(7);
    expect(s[3].minutes).toBe(3);
    expect(s[2].unit).toBe('Python basics');
    expect(C.flattenSyllabus([{ title: 'Unit 3: Ratios', topics: [{ title: 't', hook: 'h', minutes: 9 }] }])[0].unit).toBe('Ratios');
  });

  it('the pointer is the first unfinished topic', () => {
    let c = course();
    expect(C.pointerOf(c.syllabus)).toBe(0);
    c = C.recordDone(c, '1-01', 'A program is a recipe.', '2026-10-23T10:00:00.000Z');
    expect(C.pointerOf(c.syllabus)).toBe(1);
    // Finishing out of order (a carried lesson) still points at the first gap.
    c = C.recordDone(c, '2-01', 'Names for values.', '2026-10-23T11:00:00.000Z');
    expect(C.pointerOf(c.syllabus)).toBe(1);
  });

  it('next topics skip finished ones and ones already in the feed', () => {
    let c = C.recordDone(course(), '1-01', 'x', 'now');
    expect(C.nextTopics(c, 2).map((t) => t.id)).toEqual(['1-02', '2-01']);
    expect(C.nextTopics(c, 2, new Set(['code-1-02'])).map((t) => t.id)).toEqual(['2-01', '2-02']);
    expect(C.nextTopics(c, 0)).toEqual([]);
    c = ['1-02', '2-01', '2-02'].reduce((acc, id) => C.recordDone(acc, id, 'x', 'now'), c);
    expect(C.nextTopics(c, 2)).toEqual([]);
  });

  it('a skipped topic comes back: skipping does not advance the course', () => {
    const c = course();
    expect(C.nextTopics(c, 1)[0].id).toBe('1-01');
    expect(C.nextTopics(c, 1)[0].id).toBe('1-01');
  });

  it('teaser cards carry the topic identity and no lesson', () => {
    const c = course();
    const card = C.topicCard('code', c.syllabus[2], c.syllabus);
    expect(card.id).toBe('code-2-01');
    expect(C.topicIdOf('code', card.id)).toBe('2-01');
    expect(card.tag).toBe('Lesson 3 · ~8 min');
    expect(card.blocks).toEqual([]);
    expect(card.cta).toBe('Explain');
  });
});

describe('course memory', () => {
  it('DONE appends one line per topic, once', () => {
    let c = C.recordDone(course(), '1-01', 'A program is\n a recipe.', 'now');
    c = C.recordDone(c, '1-01', 'again', 'later');
    expect(c.summary).toBe('Recipes for computers: A program is a recipe.');
    expect(c.syllabus[0].doneAt).toBe('now');
  });

  it('keeps only the most recent notes', () => {
    const many: C.Course = {
      course: 'stocks',
      summary: '',
      syllabus: C.flattenSyllabus([{ title: 'U', topics: Array.from({ length: 100 }, (_, i) => ({ title: `T${i}`, hook: 'h', minutes: 10 })) }]),
    };
    const done = many.syllabus.reduce((acc, t) => C.recordDone(acc, t.id, 'n', 'now'), many);
    const lines = done.summary.split('\n');
    expect(lines).toHaveLength(80);
    expect(lines[79]).toBe('T99: n');
  });

  it('regenerating a syllabus keeps finished topics by title', () => {
    const old = C.recordDone(course(), '2-01', 'x', 'then').syllabus;
    const next = C.flattenSyllabus([{ title: 'New unit', topics: [{ title: 'variables', hook: 'h', minutes: 8 }, { title: 'Loops', hook: 'h', minutes: 8 }] }]);
    expect(C.carryProgress(next, old).map((t) => t.doneAt)).toEqual(['then', undefined]);
  });
});

describe('candlestick charts', () => {
  it('accepts valid candles and rejects impossible ones', () => {
    expect(checkBlock({ type: 'chart', kind: 'candle', candles: [{ o: 10, h: 12, l: 9, c: 11 }, { o: 11, h: 11.5, l: 8, c: 8.5 }] })).toBeNull();
    expect(checkBlock({ type: 'chart', kind: 'candle', candles: [{ o: 10, h: 9, l: 8, c: 11 }, { o: 1, h: 2, l: 0, c: 1 }] })).toMatch(/candles/);
    expect(checkBlock({ type: 'chart', kind: 'candle', points: [1, 2] })).toMatch(/candles/);
  });
});

describe('chess blocks', () => {
  const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  it('drills need a legal answer in standard notation', () => {
    expect(checkBlock({ type: 'chessDrill', fen: start, question: 'Play 1. Nf3', mode: 'move', answer: 'Nf3' })).toBeNull();
    expect(checkBlock({ type: 'chessDrill', fen: start, question: 'q', mode: 'move', answer: 'Nf4' })).toMatch(/not legal/);
    expect(checkBlock({ type: 'chessDrill', fen: start, question: 'q', mode: 'move', answer: 'g1f3' })).toMatch(/standard notation/);
    expect(checkBlock({ type: 'chessDrill', fen: start, question: 'Tap e4', mode: 'square', answer: 'e4' })).toBeNull();
    expect(checkBlock({ type: 'chessDrill', fen: start, question: 'q', mode: 'square', answer: 'e9' })).toMatch(/square/);
  });
  it('boards check arrows and highlights', () => {
    expect(checkBlock({ type: 'chessBoard', fen: start, arrows: ['g1f3'], highlight: ['f3'], orientation: 'b' })).toBeNull();
    expect(checkBlock({ type: 'chessBoard', fen: start, arrows: ['g1-f3'] })).toMatch(/arrows/);
  });
});
