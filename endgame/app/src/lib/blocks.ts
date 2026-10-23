import { validateFen } from 'chess.js';

import type { Block } from './types';

const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const optStr = (v: unknown) => v === undefined || typeof v === 'string';

/** Returns an error message, or null when the block is valid. */
export function checkBlock(b: any): string | null {
  if (!b || typeof b !== 'object') return 'not an object';
  switch (b.type) {
    case 'heading':
    case 'text':
      return isStr(b.text) ? null : `${b.type}: text missing`;
    case 'code':
      return isStr(b.code) ? null : 'code: code missing';
    case 'callout':
      return isStr(b.text) && optStr(b.label) ? null : 'callout: text missing';
    case 'diagram':
      return Array.isArray(b.rows) && b.rows.length > 0 && b.rows.every((r: any) => isStr(r?.code) && typeof r?.value === 'string')
        ? null
        : 'diagram: rows need code and value';
    case 'chart':
      return (b.kind === 'line' || b.kind === 'bar') &&
        Array.isArray(b.points) &&
        b.points.length >= 2 &&
        b.points.every((p: unknown) => typeof p === 'number' && Number.isFinite(p))
        ? null
        : 'chart: needs kind and at least 2 numbers';
    case 'chessBoard': {
      // Positions must come from real games or be checked here; the AI never gets to invent one.
      if (!isStr(b.fen)) return 'chessBoard: fen missing';
      const v = validateFen(b.fen);
      return v.ok ? null : `chessBoard: ${v.error}`;
    }
    case 'quiz':
      return isStr(b.question) &&
        Array.isArray(b.options) &&
        b.options.length >= 2 &&
        b.options.every(isStr) &&
        Number.isInteger(b.answer) &&
        b.answer >= 0 &&
        b.answer < b.options.length &&
        isStr(b.explain)
        ? null
        : 'quiz: needs question, 2+ options, a valid answer index and explain';
    case 'italianPhrase':
      return isStr(b.it) && isStr(b.en) ? null : 'italianPhrase: it and en required';
    default:
      return `unknown block type ${JSON.stringify(b.type)}`;
  }
}

export type ParseResult = { ok: true; blocks: Block[] } | { ok: false; errors: string[] };

/** Validates a lesson the model returned. Accepts a JSON string or an already-parsed value. */
export function parseBlocks(input: unknown): ParseResult {
  let data = input;
  if (typeof input === 'string') {
    try {
      data = JSON.parse(stripFences(input));
    } catch (e) {
      return { ok: false, errors: [`invalid JSON: ${(e as Error).message}`] };
    }
  }
  const list = Array.isArray(data) ? data : (data as any)?.blocks;
  if (!Array.isArray(list) || list.length === 0) return { ok: false, errors: ['expected a non-empty blocks array'] };
  const errors = list.map((b, i) => {
    const err = checkBlock(b);
    return err ? `block ${i}: ${err}` : null;
  });
  const bad = errors.filter((e): e is string => !!e);
  return bad.length ? { ok: false, errors: bad } : { ok: true, blocks: list as Block[] };
}

/** Plain-text fallback when a lesson still fails validation after the retry. */
export function fallbackBlocks(raw: string): Block[] {
  const paras = stripFences(raw)
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return paras.length ? paras.map((text) => ({ type: 'text', text })) : [{ type: 'text', text: 'This lesson could not be loaded.' }];
}

function stripFences(s: string): string {
  return s.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
}
