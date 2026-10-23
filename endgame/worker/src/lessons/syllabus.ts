import { carryProgress, flattenSyllabus, type Course, type CourseId } from '../../../app/src/lib/course.ts';
import { writeChessSyllabus } from '../chess/course.ts';
import { ask } from '../claude.ts';
import { loadCourse, saveCourse, type Db } from '../db.ts';
import { COURSES } from './info.ts';

const SCHEMA = {
  type: 'object',
  properties: {
    units: {
      type: 'array',
      minItems: 3,
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          topics: {
            type: 'array',
            minItems: 3,
            items: {
              type: 'object',
              properties: { title: { type: 'string' }, hook: { type: 'string' }, minutes: { type: 'number' } },
              required: ['title', 'hook', 'minutes'],
            },
          },
        },
        required: ['title', 'topics'],
      },
    },
  },
  required: ['units'],
};

type Units = { units: { title: string; topics: { title: string; hook: string; minutes: number }[] }[] };

/** One Sonnet call per course, run once; the syllabus is stored and walked in order. */
export async function writeSyllabus(course: CourseId): Promise<Course['syllabus']> {
  const c = COURSES[course];
  const out = await ask<Units>({
    model: 'sonnet',
    timeoutMs: 600_000,
    schema: SCHEMA,
    system: 'You design self-study courses for one adult learner. You return only the structured syllabus.',
    prompt: `Write the full syllabus for my ${c.name} course.

Goal: ${c.goal}

Follow this path, in this order:
${c.path}

Size: ${c.size}. Each topic is one lesson of ${c.minutes[0]}–${c.minutes[1]} minutes, so keep topics small and concrete; split big ideas into several topics. Build strictly from zero: never use a concept before the topic that teaches it. Mix in short review and project topics where they help.

For each topic give:
- title: plain words, under 60 characters, no numbering
- hook: one curious, honest line under 90 characters that makes me want to open it (no clickbait, no emojis)
- minutes: the lesson length`,
  });
  const topics = flattenSyllabus(out.units);
  if (topics.length < 20) throw new Error(`syllabus too short (${topics.length} topics)`);
  return topics;
}

/** Loads a course, writing its syllabus first if there isn't one yet. */
export async function ensureCourse(db: Db, course: CourseId, log: (m: string) => void): Promise<Course> {
  const have = await loadCourse(db, course);
  if (have) return have;
  log(`writing the ${COURSES[course].name} syllabus (once)`);
  const c: Course = { course, syllabus: course === 'chess' ? await writeChessSyllabus(db, log) : await writeSyllabus(course), summary: '' };
  await saveCourse(db, c);
  return c;
}

/** `npm run syllabus -- code --regenerate`: rewrites it, keeping topics you've finished. */
export async function regenerate(db: Db, course: CourseId): Promise<Course> {
  const old = await loadCourse(db, course);
  const fresh = course === 'chess' ? await writeChessSyllabus(db, console.log) : await writeSyllabus(course);
  const c: Course = { course, syllabus: carryProgress(fresh, old?.syllabus ?? []), summary: old?.summary ?? '' };
  await saveCourse(db, c);
  return c;
}
