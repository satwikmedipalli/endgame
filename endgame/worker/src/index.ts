// Endgame Mac helper. Runs in the background (launchd), signs in as you, and does
// the jobs the phone asks for: Sync (build a day) and chat replies. Claude runs
// through `claude -p` on your Max plan; see claude.ts.
import { answerChat } from './chat.ts';
import { connect, type Db } from './db.ts';
import { finishLesson, writeLesson } from './lessons/lesson.ts';
import { ensureCourse, regenerate } from './lessons/syllabus.ts';
import { syncDay, targetDay } from './sync.ts';

const VERSION = '0.4.0';
const HEARTBEAT_MS = 30_000;
const POLL_MS = 20_000;

const log = (m: string) => console.log(`${new Date().toLocaleTimeString('en-US', { hour12: false })} ${m}`);

type Job = { id: string; type: 'sync' | 'chat' | 'lesson' | 'condense'; payload: any; status: string; created_at: string };

let busy: string | null = null;

async function heartbeat(db: Db) {
  const { error } = await db.sb
    .from('helper_status')
    .upsert({ user_id: db.userId, last_seen: new Date().toISOString(), version: VERSION, busy });
  if (error) log(`heartbeat failed: ${error.message}`);
}

async function progress(db: Db, id: string, stage: string) {
  log(`  ${stage}`);
  busy = stage;
  await db.sb.from('jobs').update({ result: { stage }, updated_at: new Date().toISOString() }).eq('id', id);
  await heartbeat(db);
}

/** Claims a queued job (only one helper can win the update) and runs it. */
async function runJob(db: Db, job: Job) {
  const { data } = await db.sb
    .from('jobs')
    .update({ status: 'running', updated_at: new Date().toISOString() })
    .eq('id', job.id)
    .eq('status', 'queued')
    .select('id');
  if (!data?.length) return;
  log(`job ${job.type} ${job.id.slice(0, 8)}`);
  try {
    let result: object;
    if (job.type === 'sync') {
      busy = 'Syncing';
      await heartbeat(db);
      result = await syncDay(db, { day: job.payload?.day }, (m) => progress(db, job.id, m));
    } else if (job.type === 'chat') {
      busy = 'Answering';
      await heartbeat(db);
      result = await answerChat(db, job.payload);
    } else if (job.type === 'lesson') {
      result = await writeLesson(db, job.payload, (m) => progress(db, job.id, m));
    } else if (job.type === 'condense') {
      busy = 'Saving course notes';
      await heartbeat(db);
      result = await finishLesson(db, job.payload);
    } else throw new Error(`unknown job type ${job.type}`);
    await db.sb.from('jobs').update({ status: 'done', result, updated_at: new Date().toISOString() }).eq('id', job.id);
    log(`job done`);
  } catch (e) {
    const msg = (e as Error).message;
    log(`job failed: ${msg}`);
    await db.sb.from('jobs').update({ status: 'failed', error: msg.slice(0, 500), updated_at: new Date().toISOString() }).eq('id', job.id);
  } finally {
    busy = null;
    await heartbeat(db);
  }
}

// Jobs run one at a time: chat first, then lessons you're waiting on, then the rest,
// so a question never waits behind a long Sync.
const PRIORITY: Record<Job['type'], number> = { chat: 0, lesson: 1, condense: 2, sync: 3 };
const queue: Job[] = [];
let draining = false;
async function enqueue(db: Db, job: Job) {
  if (queue.some((j) => j.id === job.id)) return;
  queue.push(job);
  queue.sort((a, b) => PRIORITY[a.type] - PRIORITY[b.type] || a.created_at.localeCompare(b.created_at));
  if (draining) return;
  draining = true;
  while (queue.length) await runJob(db, queue.shift()!);
  draining = false;
}

async function pollQueued(db: Db) {
  const { data, error } = await db.sb.from('jobs').select('*').eq('status', 'queued').order('created_at');
  if (error) return log(`poll failed: ${error.message}`);
  for (const j of data ?? []) enqueue(db, j as Job);
}

async function daemon() {
  const db = await connect();
  log(`Endgame helper ${VERSION} signed in; listening for jobs`);
  await heartbeat(db);
  setInterval(() => heartbeat(db), HEARTBEAT_MS);
  db.sb
    .channel('jobs')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'jobs', filter: `user_id=eq.${db.userId}` }, (p) => enqueue(db, p.new as Job))
    .subscribe((status) => log(`realtime: ${status}`));
  // Realtime can miss events while the Mac sleeps; polling catches up.
  await pollQueued(db);
  setInterval(() => pollQueued(db), POLL_MS);
}

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
  await daemon();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
