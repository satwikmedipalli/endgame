import { isLessonCourse } from '../../shared/course.ts';
import { blocksToText, RULES } from '../../shared/cardText.ts';
import type { Card } from '../../shared/types.ts';
import { ask } from './claude.ts';
import { loadCourse, loadDay, type Db } from './db.ts';

/** `notes` is the course memory for lesson cards, so the tutor knows what you've already learned. */
export function chatPrompt(card: Card, question: string, notes?: string) {
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
${blocksToText(card.blocks) || '(The lesson has not been written yet; teach from the title and hook.)'}
${notes ? `\nWhat the learner has already covered in this course:\n${notes}\n` : ''}
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
  const notes = isLessonCourse(card.course) ? (await loadCourse(db, card.course))?.summary : undefined;
  const { system, prompt } = chatPrompt({ ...card, chat: card.chat.filter((m) => m !== lastUser) }, lastUser.text, notes);
  const text = await ask<string>({ prompt, system, model: 'sonnet', timeoutMs: 120_000 });
  const { error } = await db.sb.from('chat_messages').insert({ card_id: card.id, role: 'assistant', text, user_id: db.userId });
  if (error) throw error;
  return { chars: text.length };
}
