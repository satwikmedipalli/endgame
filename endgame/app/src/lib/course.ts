import type { Card, CardKind } from './types';

// Courses with a stored syllabus. Sync fills their slots in order; the lesson itself
// is written only when you tap Explain.
export type CourseId = 'code' | 'stocks' | 'chess' | 'italian';
export const LESSON_COURSES: CourseId[] = ['code', 'stocks', 'chess', 'italian'];
export const LESSONS_PER_DAY: Record<CourseId, number> = { code: 2, stocks: 3, chess: 2, italian: 1 };

export interface Topic {
  /** Stable within a syllabus, e.g. "2-07" (unit 2, topic 7). */
  id: string;
  unit: string;
  title: string;
  hook: string;
  minutes: number;
  doneAt?: string;
  /** Course-specific details, e.g. a chess topic's drill type or its validated opening line. */
  data?: { drill?: string; line?: string; color?: 'w' | 'b'; fen?: string; [k: string]: unknown };
}

export interface Course {
  course: CourseId;
  syllabus: Topic[];
  /** Rolling notes on what you've learned, one line per finished topic (newest last). */
  summary: string;
}

/** Keeps the course memory short enough to send with every lesson. */
const SUMMARY_MAX_LINES = 80;

export const isLessonCourse = (c?: string): c is CourseId => (LESSON_COURSES as string[]).includes(c ?? '');

/** "You are here": the first topic not finished yet. */
export function pointerOf(syllabus: Topic[]): number {
  const i = syllabus.findIndex((t) => !t.doneAt);
  return i < 0 ? syllabus.length : i;
}

export const cardIdOf = (course: CourseId, topicId: string) => `${course}-${topicId}`;
export const topicIdOf = (course: CourseId, cardId: string) => (cardId.startsWith(`${course}-`) ? cardId.slice(course.length + 1) : null);

/** The next `n` unfinished topics, in syllabus order, leaving out ones already in the feed. */
export function nextTopics(course: Course, n: number, exclude: Set<string> = new Set()): Topic[] {
  if (n <= 0) return [];
  return course.syllabus.filter((t) => !t.doneAt && !exclude.has(cardIdOf(course.course, t.id))).slice(0, n);
}

/** A teaser card for a topic: title and hook only, no lesson yet. */
export function topicCard(course: CourseId, topic: Topic, syllabus: Topic[]): Card {
  const n = syllabus.findIndex((t) => t.id === topic.id) + 1;
  return {
    id: cardIdOf(course, topic.id),
    kind: course as CardKind,
    course,
    title: topic.title,
    hook: topic.hook,
    // Italian shows its level (A1…C1), which is the unit.
    tag: `${course === 'italian' ? `${topic.unit} · ` : ''}Lesson ${n} · ~${topic.minutes} min`,
    cta: 'Explain',
    blocks: [],
    ...(topic.data?.fen ? { preview: { fen: topic.data.fen } } : {}),
    status: 'open',
    chat: [],
  };
}

/** DONE on a lesson: mark the topic finished and add what you learned to the course memory. */
export function recordDone(course: Course, topicId: string, notes: string, at: string): Course {
  const topic = course.syllabus.find((t) => t.id === topicId);
  if (!topic || topic.doneAt) return course;
  const line = `${topic.title}: ${notes.replace(/\s*\n\s*/g, ' ').trim()}`;
  const lines = [...course.summary.split('\n').filter(Boolean), line].slice(-SUMMARY_MAX_LINES);
  return {
    ...course,
    syllabus: course.syllabus.map((t) => (t.id === topicId ? { ...t, doneAt: at } : t)),
    summary: lines.join('\n'),
  };
}

/** Builds a syllabus from the model's units, numbering topics "unit-nn". */
export function flattenSyllabus(units: { title: string; topics: { title: string; hook: string; minutes: number }[] }[]): Topic[] {
  return units.flatMap((u, ui) =>
    u.topics.map((t, ti) => ({
      id: `${ui + 1}-${String(ti + 1).padStart(2, '0')}`,
      unit: u.title.replace(/^unit\s*\d+\s*[:.–-]\s*/i, '').trim(),
      title: t.title,
      hook: t.hook,
      minutes: Math.max(3, Math.round(t.minutes)),
    })),
  );
}

/**
 * Re-generating a syllabus keeps what you've finished: a new topic with the same
 * title as a finished one stays finished.
 */
export function carryProgress(next: Topic[], old: Topic[]): Topic[] {
  const done = new Map(old.filter((t) => t.doneAt).map((t) => [t.title.toLowerCase(), t.doneAt]));
  return next.map((t) => (done.has(t.title.toLowerCase()) ? { ...t, doneAt: done.get(t.title.toLowerCase()) } : t));
}
