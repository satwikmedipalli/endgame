import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { pointerOf, type Course, type CourseId } from '../../shared/course.ts';
import * as S from '../../shared/sync.ts';
import type { Block, Card, DayFeed } from '../../shared/types.ts';

export type Db = { sb: SupabaseClient; userId: string };

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is missing from worker/.env (see .env.example)`);
  return v;
}

/** Signs in as you, so the helper is bound by the same row-level security as the app. */
export async function connect(): Promise<Db> {
  const sb = createClient(need('SUPABASE_URL'), need('SUPABASE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: true },
  });
  const { data, error } = await sb.auth.signInWithPassword({ email: need('ENDGAME_EMAIL'), password: need('ENDGAME_PASSWORD') });
  if (error || !data.user) throw new Error(`sign-in failed: ${error?.message ?? 'no user'}`);
  return { sb, userId: data.user.id };
}

/**
 * Keeps the helper signed in across sleep. The automatic refresh can miss its moment while
 * the Mac is asleep or offline, and then every request quietly runs as nobody (RLS refuses
 * writes and reads come back empty). Renews early, and signs in again if renewing fails.
 */
export async function ensureSession(db: Db): Promise<boolean> {
  const { data } = await db.sb.auth.getSession();
  const left = data.session?.expires_at ? data.session.expires_at * 1000 - Date.now() : -1;
  if (left > 5 * 60_000) return true;
  if (data.session) {
    const r = await db.sb.auth.refreshSession();
    if (!r.error && r.data.session) return true;
  }
  const s = await db.sb.auth.signInWithPassword({ email: need('ENDGAME_EMAIL'), password: need('ENDGAME_PASSWORD') });
  return !s.error && !!s.data.session;
}

async function rowsFor(db: Db, days: string[]): Promise<S.Rows> {
  if (!days.length) return { days: [], cards: [], chats: [] };
  const [d, c] = await Promise.all([
    db.sb.from('days').select('*').in('day', days),
    db.sb.from('cards').select('*').in('day', days),
  ]);
  if (d.error || c.error) throw d.error ?? c.error;
  const ids = [...new Set((c.data ?? []).map((r) => r.id as string))];
  const m = ids.length ? await db.sb.from('chat_messages').select('*').in('card_id', ids) : { data: [], error: null };
  if (m.error) throw m.error;
  return { days: d.data, cards: c.data, chats: m.data } as S.Rows;
}

export async function loadDay(db: Db, day: string): Promise<DayFeed | null> {
  return S.fromRows(await rowsFor(db, [day]))[day] ?? null;
}

/** The most recent stored day before `day` (for carry-over and no-repeat news). */
export async function loadPrev(db: Db, day: string): Promise<DayFeed | null> {
  const { data, error } = await db.sb.from('days').select('day').lt('day', day).order('day', { ascending: false }).limit(1);
  if (error) throw error;
  return data?.[0] ? loadDay(db, data[0].day) : null;
}

/** Replaces a day on the server: upserts its cards and removes cards no longer in it. Chat is untouched. */
export async function saveDay(db: Db, feed: DayFeed) {
  const rows = S.toRows({ [feed.day]: feed }, db.userId);
  // The day row must exist for its cards, but it only becomes the new build (source, built_at)
  // once the cards are in place, so the app syncing mid-way never takes old cards for new.
  const d0 = await db.sb.from('days').upsert(rows.days, { ignoreDuplicates: true });
  if (d0.error) throw d0.error;
  const c = await db.sb.from('cards').upsert(rows.cards);
  if (c.error) throw c.error;
  const keep = rows.cards.map((r) => r.id);
  const del = db.sb.from('cards').delete().eq('day', feed.day);
  const res = keep.length ? await del.not('id', 'in', `(${keep.map((k) => `"${k}"`).join(',')})`) : await del;
  if (res.error) throw res.error;
  const d = await db.sb.from('days').upsert(rows.days);
  if (d.error) throw d.error;
}

export async function loadCourse(db: Db, course: CourseId): Promise<Course | null> {
  const { data, error } = await db.sb.from('courses').select('course, syllabus, summary').eq('course', course).maybeSingle();
  if (error) throw error;
  return data && Array.isArray(data.syllabus) && data.syllabus.length ? (data as Course) : null;
}

export async function saveCourse(db: Db, c: Course) {
  const { error } = await db.sb.from('courses').upsert({
    user_id: db.userId,
    course: c.course,
    syllabus: c.syllabus,
    summary: c.summary,
    pointer: pointerOf(c.syllabus),
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

/** Writes a card's lesson without touching its status, chat or position. */
export async function saveBlocks(db: Db, day: string, cardId: string, blocks: Block[]) {
  const { data, error } = await db.sb.from('cards').select('content').eq('day', day).eq('id', cardId).single();
  if (error) throw error;
  const u = await db.sb
    .from('cards')
    .update({ content: { ...data.content, blocks }, updated_at: new Date().toISOString() })
    .eq('day', day)
    .eq('id', cardId);
  if (u.error) throw u.error;
}

export type Seen<M = Record<string, unknown>> = { key: string; meta: M; created_at: string };

/** Every row of a query; PostgREST returns at most 1000 per request. */
async function all<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return out;
  }
}

/** Everything ever shown for a kind (history teasers, watch titles): the no-repeat list. */
export function loadSeen<M>(db: Db, kind: string): Promise<Seen<M>[]> {
  return all((a, b) => db.sb.from('seen').select('key, meta, created_at').eq('kind', kind).order('created_at').range(a, b));
}

export async function addSeen(db: Db, kind: string, rows: { key: string; meta: object }[]) {
  if (!rows.length) return;
  const { error } = await db.sb.from('seen').upsert(rows.map((r) => ({ ...r, kind, user_id: db.userId })), { ignoreDuplicates: true });
  if (error) throw error;
}

export type Reaction = { id: string; day: string; status: string; opened: boolean; watch: Card['watch'] | null };

/** Your latest reaction to each card of a kind, across every stored day. */
export async function loadReactions(db: Db, kind: string): Promise<Reaction[]> {
  type Row = { id: string; day: string; status: string; opened_at: string | null; watch: Card['watch'] | null };
  const rows = await all<Row>((a, b) => db.sb.from('cards').select('id, day, status, opened_at, watch').eq('kind', kind).order('day').order('id').range(a, b));
  const latest = new Map<string, Reaction>();
  for (const r of rows) latest.set(r.id, { id: r.id, day: r.day, status: r.status, opened: !!r.opened_at, watch: r.watch });
  return [...latest.values()];
}
