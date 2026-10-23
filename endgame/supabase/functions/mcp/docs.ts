// What the Claude app sees: each tool's answer as plain Markdown. Pure.
import { blocksToText, RULES } from '../../../app/src/lib/cardText.ts';
import type { Course, CourseId } from '../../../app/src/lib/course.ts';
import type { Card } from '../../../app/src/lib/types.ts';
import { COURSES } from '../../../worker/src/lessons/info.ts';

const COURSE_NAMES: Record<string, string> = { code: 'Coding', stocks: 'Stock market', chess: 'Chess', italian: 'Italian' };
const KIND_NAMES: Record<Card['kind'], string> = {
  news: 'News',
  code: 'Coding',
  stocks: 'Stock market',
  history: 'History',
  chess: 'Chess',
  italian: 'Italian',
  watch: 'Watch',
};

const STATUS: Record<Card['status'], string> = { open: 'not done', done: 'DONE', skip: 'skipped' };

export function todayDoc(day: string, cards: Card[]): string {
  if (!cards.length) return `No feed for ${day} yet. The Mac builds it on Sync.`;
  const lines = cards.map((c) => `- \`${c.id}\` · ${KIND_NAMES[c.kind]} · ${c.title} (${c.tag}) — ${STATUS[c.status]}${c.continued ? ', continued from yesterday' : ''}`);
  return `Endgame feed for ${day}:\n${lines.join('\n')}\n\nUse get_card with an id to read one.`;
}

/** The whole card, its chat so far and, for lessons, the course notes, plus how to discuss it. */
export function cardDoc(card: Card & { day: string }, course?: Pick<Course, 'summary'> | null): string {
  const written = card.blocks.length > 0;
  const info = card.course && card.course in COURSES ? COURSES[card.course as CourseId] : null;
  const parts = [
    `# ${card.title}`,
    `${KIND_NAMES[card.kind]} · ${card.tag} · ${card.day} · ${STATUS[card.status]}`,
    card.hook ? `Hook: ${card.hook}` : '',
    written
      ? `## Card content\n${blocksToText(card.blocks)}`
      : `## Not written yet\nThe Mac writes this ${info ? 'lesson' : 'card'} when it is opened, and it hasn't been. Teach it yourself from the title and hook${info ? `, as part of this course.\nCourse goal: ${info.goal}\nLesson length: about ${info.minutes[0]}–${info.minutes[1]} minutes.\nStyle:\n${info.style}` : '.'}`,
  ];
  if (course?.summary) parts.push(`## What I've already covered in ${COURSE_NAMES[card.course!] ?? card.course}\n${course.summary}`);
  if (card.chat.length) {
    const who = { user: 'Me', assistant: 'Tutor', system: 'Note' } as const;
    parts.push(`## Chat so far\n${card.chat.map((m) => `${who[m.role]}: ${m.text}`).join('\n')}`);
  }
  parts.push(
    `## How to discuss it\nYou are the tutor for this card, the same one I chat with inside the Endgame app. Answer from the card content; usually under 150 words, with an everyday analogy for anything new. ${RULES[card.kind] ?? ''}\nWhen we wrap up (or when I ask), call save_summary with card_id \`${card.id}\` and a few lines on what we covered and anything I struggled with, so the app and the Mac remember it.`,
  );
  return parts.filter(Boolean).join('\n\n');
}

export function courseDoc(course: Pick<Course, 'course' | 'syllabus' | 'summary'>): string {
  const done = course.syllabus.filter((t) => t.doneAt).length;
  const units: string[] = [];
  let unit = '';
  for (const t of course.syllabus) {
    if (t.unit !== unit) units.push(`\n### ${(unit = t.unit)}`);
    units.push(`- ${t.doneAt ? '✓' : '○'} ${t.id} ${t.title}`);
  }
  const name = COURSE_NAMES[course.course] ?? course.course;
  return [
    `# ${name}`,
    `${done} of ${course.syllabus.length} topics done.`,
    course.summary ? `## My notes so far\n${course.summary}` : '## My notes so far\n(none yet)',
    `## Syllabus${units.join('\n')}`,
  ].join('\n\n');
}

export const SUMMARY_MAX = 2000;

/** The chat line saved for a summary. Shown in the app and read by the Mac's tutor. */
export const summaryText = (summary: string) => `From the Claude app: ${summary.trim().slice(0, SUMMARY_MAX)}`;
