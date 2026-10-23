import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import * as S from '../../app/src/lib/sync.ts';
import type { DayFeed } from '../../app/src/lib/types.ts';

export type Db = { sb: SupabaseClient; userId: string };

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is missing from worker/.env (see .env.example)`);
  return v;
}

/** Signs in as you, so the helper is bound by the same row-level security as the phone. */
export async function connect(): Promise<Db> {
  const sb = createClient(need('SUPABASE_URL'), need('SUPABASE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: true },
  });
  const { data, error } = await sb.auth.signInWithPassword({ email: need('ENDGAME_EMAIL'), password: need('ENDGAME_PASSWORD') });
  if (error || !data.user) throw new Error(`sign-in failed: ${error?.message ?? 'no user'}`);
  return { sb, userId: data.user.id };
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
  const d = await db.sb.from('days').upsert(rows.days);
  if (d.error) throw d.error;
  const c = await db.sb.from('cards').upsert(rows.cards);
  if (c.error) throw c.error;
  const keep = rows.cards.map((r) => r.id);
  const del = db.sb.from('cards').delete().eq('day', feed.day);
  const res = keep.length ? await del.not('id', 'in', `(${keep.map((k) => `"${k}"`).join(',')})`) : await del;
  if (res.error) throw res.error;
}
