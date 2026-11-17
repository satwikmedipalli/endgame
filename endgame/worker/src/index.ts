// Endgame helper from the command line. The Mac app runs the same helper inside itself;
// these commands are for running it on its own, one-off Syncs and printing syllabi.
import { connect } from './db.ts';
import { startHelper } from './helper.ts';
import { ensureCourse, regenerate } from './lessons/syllabus.ts';
import { syncDay, targetDay } from './sync.ts';

const log = (m: string) => console.log(`${new Date().toLocaleTimeString('en-US', { hour12: false })} ${m}`);

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--syllabus')) {
    // npm run syllabus -- code|stocks|chess [--regenerate]
    const db = await connect();
    const name = args[args.indexOf('--syllabus') + 1];
    const course = name === 'stocks' || name === 'chess' ? name : 'code';
    const c = args.includes('--regenerate') ? await regenerate(db, course) : await ensureCourse(db, course, log);
    let unit = '';
    for (const [i, t] of c.syllabus.entries()) {
      if (t.unit !== unit) console.log(`\n${(unit = t.unit)}`);
      console.log(`  ${String(i + 1).padStart(3)}. ${t.doneAt ? '✓' : ' '} ${t.title} (${t.minutes} min) — ${t.hook}`);
    }
    process.exit(0);
  }
  if (args.includes('--sync')) {
    const db = await connect();
    const dayArg = args[args.indexOf('--sync') + 1];
    const day = dayArg && /^\d{4}-\d{2}-\d{2}$/.test(dayArg) ? dayArg : targetDay();
    const r = await syncDay(db, { day, lessonsOnly: args.includes('--lessons-only') }, log);
    log(`done: ${JSON.stringify(r)}`);
    process.exit(0);
  }
  await startHelper();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
