// Plain-text versions of a card, shared by the Mac helper's chat and the Claude connector.
import type { Block, Card } from './types';

export function blocksToText(blocks: Block[]): string {
  return blocks
    .map((b) => {
      switch (b.type) {
        case 'heading':
          return `## ${b.text}`;
        case 'text':
          return b.text;
        case 'callout':
          return `${b.label ? `${b.label}: ` : ''}${b.text}`;
        case 'code':
          return '```\n' + b.code + '\n```';
        case 'diagram':
          return b.rows.map((r) => `${r.code} -> ${r.label ? `${r.label} = ` : ''}${r.value}`).join('\n') + (b.caption ? `\n${b.caption}` : '');
        case 'chart':
          return b.kind === 'candle'
            ? `[candlestick chart${b.title ? `: ${b.title}` : ''}: ${b.candles.map((k) => `o${k.o} h${k.h} l${k.l} c${k.c}`).join('; ')}]`
            : `[${b.kind} chart${b.title ? `: ${b.title}` : ''}: ${b.points.join(', ')}]`;
        case 'chessBoard':
          return `[Chess position FEN: ${b.fen}]${b.caption ? ` ${b.caption}` : ''}`;
        case 'quiz':
          return `Quiz: ${b.question}${b.code ? `\n${b.code}` : ''}\nOptions: ${b.options.join(' | ')}\nAnswer: ${b.options[b.answer]} — ${b.explain}`;
        case 'vocabReview':
          return `Review words: ${b.items.map((w) => `${w.it} = ${w.en}`).join('; ')}`;
        case 'chessDrill':
          return `[Drill on FEN ${b.fen}: ${b.question} Answer: ${b.answer}]`;
        case 'italianPhrase':
          return `${b.it} = ${b.en}${b.note ? ` (${b.note})` : ''}`;
        case 'sudoku':
          return `[Sudoku, ${b.level}. Givens (0 = empty), row by row: ${b.givens.match(/.{9}/g)!.join(' ')}]`;
        case 'crossword':
          return `[Mini crossword, ${b.size}×${b.size}]\n${b.clues.map((c) => `${c.n} ${c.dir}: ${c.clue} (${c.answer.length})`).join('\n')}`;
      }
    })
    .join('\n\n');
}

export const RULES: Partial<Record<Card['kind'], string>> = {
  news: 'Stick to what the deep dive and sources say. If something is not in them, say you do not know rather than guessing; general background is fine if clearly marked.',
  stocks: 'This is education, not financial advice. Never recommend buying or selling a specific security.',
  chess: 'Never invent chess positions or moves. Only discuss the FEN given; if asked about another position, ask for it.',
  italian: 'Keep Italian at the learner level shown (the level is at the start of the card tag) and to words they have met plus today\'s. When they ask to chat in Italian, hold a short, friendly conversation in Italian, one or two sentences at a time, with the English in brackets after each of your lines, and gently correct their mistakes.',
  history: 'Stick to well-documented history. Say clearly when something is legend, disputed or unknown.',
  watch: 'Never spoil plot beyond the setup unless I explicitly ask for spoilers.',
  puzzle: 'Never give away an answer unless I ask for it outright. Prefer hints: a nudge for a crossword clue, or which row, column or box to look at in the sudoku.',
};
