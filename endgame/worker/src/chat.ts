import type { Block, Card } from '../../app/src/lib/types.ts';
import { ask } from './claude.ts';
import { loadDay, type Db } from './db.ts';

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
          return `[${b.kind} chart${b.title ? `: ${b.title}` : ''}: ${b.points.join(', ')}]`;
        case 'chessBoard':
          return `[Chess position FEN: ${b.fen}]${b.caption ? ` ${b.caption}` : ''}`;
        case 'quiz':
          return `Quiz: ${b.question}${b.code ? `\n${b.code}` : ''}\nOptions: ${b.options.join(' | ')}\nAnswer: ${b.options[b.answer]} — ${b.explain}`;
        case 'italianPhrase':
          return `${b.it} = ${b.en}${b.note ? ` (${b.note})` : ''}`;
      }
    })
    .join('\n\n');
}

const RULES: Partial<Record<Card['kind'], string>> = {
  news: 'Stick to what the deep dive and sources say. If something is not in them, say you do not know rather than guessing; general background is fine if clearly marked.',
  stocks: 'This is education, not financial advice. Never recommend buying or selling a specific security.',
  chess: 'Never invent chess positions or moves. Only discuss the FEN given; if asked about another position, ask for it.',
  italian: 'Keep Italian at the learner level shown. Give the Italian, then the English.',
};

export function chatPrompt(card: Card, question: string) {
  const history = card.chat
    .filter((m) => m.role !== 'system')
    .slice(-12)
    .map((m) => `${m.role === 'user' ? 'Me' : 'You'}: ${m.text}`)
    .join('\n');
  const system = `You are the tutor inside Endgame, a calm daily learning app. You are discussing one card with its owner.
Card: ${card.kind} · ${card.tag}
Title: ${card.title}
${card.hook ? `Hook: ${card.hook}\n` : ''}
Card content:
${blocksToText(card.blocks)}

Reply rules: plain text only (no markdown headings, bold or bullet symbols; short code is fine on its own lines). Usually under 150 words. Use an everyday analogy when explaining something new. ${RULES[card.kind] ?? ''}`;
  const prompt = `${history ? `Conversation so far:\n${history}\n\n` : ''}Me: ${question}\n\nReply to my last message.`;
  return { system, prompt };
}

/** Answers the newest unanswered question on a card and saves the reply. */
export async function answerChat(db: Db, payload: { day: string; card_id: string }) {
  const feed = await loadDay(db, payload.day);
  const card = feed?.cards.find((c) => c.id === payload.card_id);
  if (!card) throw new Error(`card ${payload.card_id} not found on ${payload.day}`);
  const lastUser = [...card.chat].reverse().find((m) => m.role === 'user');
  if (!lastUser) throw new Error('no question to answer');
  const already = card.chat.some((m) => m.role === 'assistant' && m.at > lastUser.at);
  if (already) return { skipped: true };
  const { system, prompt } = chatPrompt({ ...card, chat: card.chat.filter((m) => m !== lastUser) }, lastUser.text);
  const text = await ask<string>({ prompt, system, model: 'sonnet', timeoutMs: 120_000 });
  const { error } = await db.sb.from('chat_messages').insert({ card_id: card.id, role: 'assistant', text, user_id: db.userId });
  if (error) throw error;
  return { chars: text.length };
}
