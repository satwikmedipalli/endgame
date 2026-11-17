import { isLessonCourse, recordDone, topicIdOf, type Course } from '../../../shared/course.ts';
import { fallbackBlocks, parseBlocks } from '../../../shared/blocks.ts';
import type { Block, Card } from '../../../shared/types.ts';
import { blocksToText } from '../../../shared/cardText.ts';
import { ask } from '../claude.ts';
import { loadCourse, loadDay, saveBlocks, saveCourse, type Db } from '../db.ts';
import { writeChessLesson } from '../chess/course.ts';
import { applyPractice, dueWords, PRACTICE, reviewBlock } from './italian.ts';
import { watchTaste } from '../discover/watch.ts';
import { COURSES } from './info.ts';
import { ensureCourse } from './syllabus.ts';

const str = { type: 'string' };
// Loose on purpose: checkBlock (shared with the app) is the real validator.
const BLOCKS_SCHEMA = {
  type: 'object',
  properties: {
    blocks: {
      type: 'array',
      minItems: 4,
      items: {
        type: 'object',
        properties: {
          type: { enum: ['heading', 'text', 'code', 'callout', 'diagram', 'chart', 'quiz', 'italianPhrase'] },
          text: str,
          code: str,
          language: str,
          label: str,
          title: str,
          caption: str,
          rows: { type: 'array', items: { type: 'object', properties: { code: str, label: str, value: str }, required: ['code', 'value'] } },
          kind: { enum: ['line', 'bar', 'candle'] },
          points: { type: 'array', items: { type: 'number' } },
          labels: { type: 'array', items: str },
          candles: {
            type: 'array',
            items: { type: 'object', properties: { o: { type: 'number' }, h: { type: 'number' }, l: { type: 'number' }, c: { type: 'number' } }, required: ['o', 'h', 'l', 'c'] },
          },
          question: str,
          options: { type: 'array', items: str },
          answer: { type: 'integer' },
          explain: str,
          it: str,
          en: str,
          note: str,
          learn: { type: 'boolean' },
        },
        required: ['type'],
      },
    },
  },
  required: ['blocks'],
};

// Stories and pitches use any block type but never need a minimum count.
const BLOCKS_SCHEMA_ANY = { ...BLOCKS_SCHEMA, properties: { blocks: { ...BLOCKS_SCHEMA.properties.blocks, minItems: 1 } } };

const BLOCK_GUIDE = `Return the lesson as JSON blocks, in reading order:
- heading {text}: a short section title
- text {text}: one paragraph, plain words, no markdown
- code {code, language}: a code snippet or worked arithmetic
- callout {label, text}: a tip, analogy or warning; label like "Analogy", "Tip", "Careful"
- diagram {title, rows: [{code, label, value}], caption}: a step-by-step trace, one row per step
- chart {title, kind: "line"|"bar", points: [numbers], labels?, caption} or {title, kind: "candle", candles: [{o,h,l,c}], labels?, caption}; candles need low ≤ open/close ≤ high
- quiz {question, code?, options: [2–4 strings], answer: index of the right option, explain}
- italianPhrase {it, en, note?, learn?}: Italian with its English (Italian lessons only)`;

/** Exported for tests. */
export function lessonPrompt(course: Course, card: Card) {
  const info = COURSES[course.course];
  const topicId = topicIdOf(course.course, card.id);
  const at = course.syllabus.findIndex((t) => t.id === topicId);
  const topic = course.syllabus[at];
  const minutes = topic?.minutes ?? info.minutes[1];
  const before = course.syllabus.slice(Math.max(0, at - 5), Math.max(0, at)).map((t) => `- ${t.title}`);
  const after = course.syllabus.slice(at + 1, at + 4).map((t) => `- ${t.title}`);
  const system = `You are the teacher inside Endgame, a calm daily learning app with one learner, Satwik.
Course: ${info.name}. ${info.goal}

${BLOCK_GUIDE}

How to teach:
${info.style}
- Only teach what this topic needs, building on what I already know (below). Never use an idea the course hasn't covered without explaining it.
- Aim for about ${minutes} minutes of reading: roughly ${minutes * 120} words plus the visuals.
- Warm, direct, concrete. No filler, no "In this lesson we will".`;
  const prompt = `Write lesson ${at + 1} of ${course.syllabus.length}.
Unit: ${topic?.unit ?? ''}
Topic: ${card.title}
Hook on the card: ${card.hook}

Topics just before this one:
${before.join('\n') || '- (this is the first lesson)'}
Coming next (do not teach these yet):
${after.join('\n') || '- (this is the last lesson)'}

What I've learned so far (my course notes):
${course.summary || '(nothing yet: I am starting from zero)'}`;
  return { system, prompt };
}

/** Validates, retries once with the errors, then keeps the valid blocks or falls back to plain text. */
export async function writeBlocks(course: Course, card: Card, log: (m: string) => void = () => {}): Promise<Block[]> {
  const { system, prompt } = lessonPrompt(course, card);
  let out = await ask<{ blocks: unknown[] }>({ model: 'sonnet', system, prompt, schema: BLOCKS_SCHEMA, timeoutMs: 600_000 });
  let parsed = parseBlocks(out);
  if (parsed.ok) return parsed.blocks;
  log(`lesson had problems, retrying: ${parsed.errors.slice(0, 3).join('; ')}`);
  out = await ask<{ blocks: unknown[] }>({
    model: 'sonnet',
    system,
    prompt: `${prompt}\n\nA previous attempt had these problems; avoid them:\n${parsed.errors.slice(0, 10).join('\n')}`,
    schema: BLOCKS_SCHEMA,
    timeoutMs: 600_000,
  });
  parsed = parseBlocks(out);
  if (parsed.ok) return parsed.blocks;
  const valid = (out?.blocks ?? []).filter((b) => parseBlocks([b]).ok) as Block[];
  return valid.length >= 3 ? valid : fallbackBlocks(blocksToText(valid) || 'This lesson could not be written. Ask about it in the chat below.');
}

const STORY_SYSTEM = `You tell true stories from history for Endgame, a calm daily app with one curious reader.

${BLOCK_GUIDE}

How to tell it:
- Tell the full story in detail, in order, like a great storyteller: people, places, what happened, how it ended, and why it still matters.
- Use only well-documented facts. Where sources disagree, or a detail is legend, say so in a callout labelled "Careful".
- Add a "diagram" block as a short timeline (code = date, value = what happened) when the story spans time.
- About 5–8 minutes of reading. Plain words, no markdown, no "In this story". Don't start with the title as a heading.`;

const PITCH_SYSTEM = `You write very short, spoiler-free pitches for Endgame, a calm daily app with one reader.

${BLOCK_GUIDE}

Return 2–3 blocks: one or two "text" blocks (under 110 words in total) that make me curious about the premise and the feeling of it, without any plot after the setup, then a "callout" labelled "Why you might like it" (one sentence; use my taste if given). Never spoil twists or endings.`;

/** Validates a short piece (story or pitch), retrying once, then plain text. */
async function writeSimple(system: string, prompt: string, model: 'sonnet' | 'haiku'): Promise<Block[]> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const out = await ask<{ blocks: unknown[] }>({ model, system, prompt, schema: BLOCKS_SCHEMA_ANY, timeoutMs: 300_000 });
    const parsed = parseBlocks(out);
    if (parsed.ok) return parsed.blocks;
    if (attempt === 1) {
      const valid = (out?.blocks ?? []).filter((b) => parseBlocks([b]).ok) as Block[];
      return valid.length ? valid : fallbackBlocks('This could not be written. Ask about it in the chat below.');
    }
  }
  return [];
}

/** The "lesson" job: you tapped Explain (or Interested). Written once and stored on the card. */
export async function writeLesson(db: Db, payload: { day: string; card_id: string }, log: (m: string) => void) {
  const feed = await loadDay(db, payload.day);
  const card = feed?.cards.find((c) => c.id === payload.card_id);
  if (!card) throw new Error(`card ${payload.card_id} not found on ${payload.day}`);
  if (card.blocks.length) return { skipped: 'already written' };
  let blocks: Block[];
  if (card.kind === 'history') {
    await log('Writing the story');
    blocks = await writeSimple(STORY_SYSTEM, `Tell me the story: ${card.title} (${card.tag}).\nThe teaser I saw: ${card.hook}`, 'sonnet');
  } else if (card.kind === 'watch') {
    await log('Writing the pitch');
    const { text } = await watchTaste(db);
    blocks = await writeSimple(PITCH_SYSTEM, `Pitch: ${card.title} (${card.tag}), ${card.hook}.${text ? `\n\nMy taste:\n${text}` : ''}`, 'sonnet');
  } else if (card.course === 'italian') {
    const course = await ensureCourse(db, 'italian', log);
    await log('Writing your Italian');
    const [review, lesson] = await Promise.all([dueWords(db, payload.day), writeBlocks(course, card, log)]);
    blocks = [...reviewBlock(review), ...lesson, PRACTICE];
  } else if (card.course === 'chess') {
    const course = await ensureCourse(db, 'chess', log);
    await log('Writing your lesson');
    blocks = await writeChessLesson(db, course, card, log);
  } else if (isLessonCourse(card.course)) {
    const course = await ensureCourse(db, card.course, log);
    await log('Writing your lesson');
    blocks = await writeBlocks(course, card, log);
  } else throw new Error(`${card.id} has nothing to write`);
  // The screen already shows the title; a first heading that repeats it is noise.
  const first = blocks[0];
  if (blocks.length > 1 && first.type === 'heading' && first.text.trim().toLowerCase() === card.title.trim().toLowerCase()) blocks = blocks.slice(1);
  await saveBlocks(db, payload.day, card.id, blocks);
  return { blocks: blocks.length };
}

/** 2–4 lines for the course memory: what I learned, and anything I found hard. */
export async function condense(card: Card): Promise<string> {
  if (!card.blocks.length) return 'Marked done without opening the lesson.';
  const chat = card.chat
    .filter((m) => m.role !== 'system')
    .map((m) => `${m.role === 'user' ? 'Me' : 'Tutor'}: ${m.text}`)
    .join('\n');
  return ask<string>({
    model: 'haiku',
    timeoutMs: 120_000,
    system: 'You keep short course notes for one learner. Reply with 2–4 short plain lines, no bullets or headings.',
    prompt: `Lesson: ${card.title}\n\n${blocksToText(card.blocks).slice(0, 8000)}\n\n${chat ? `My questions in the chat:\n${chat.slice(-4000)}\n\n` : ''}Write my notes: what I now know from this lesson, and anything I struggled with or asked about.`,
  });
}

/** The "condense" job: DONE on a lesson advances the course and saves what you learned. */
export async function finishLesson(db: Db, payload: { day: string; card_id: string }) {
  const feed = await loadDay(db, payload.day);
  const card = feed?.cards.find((c) => c.id === payload.card_id);
  if (!card || card.status !== 'done' || !isLessonCourse(card.course)) return { skipped: 'not a finished lesson' };
  const course = await loadCourse(db, card.course);
  const topicId = topicIdOf(card.course, card.id);
  const topic = course?.syllabus.find((t) => t.id === topicId);
  if (!course || !topic) return { skipped: 'not in the syllabus' };
  if (topic.doneAt) return { skipped: 'already recorded' };
  // Italian: schedule the reviewed words and add the new ones first, so a failure leaves the topic to retry.
  const practice = card.course === 'italian' ? await applyPractice(db, card, payload.day, topic.id) : undefined;
  const notes = await condense(card);
  await saveCourse(db, recordDone(course, topic.id, notes, card.updatedAt ?? new Date().toISOString()));
  return { recorded: topic.id, ...practice };
}
