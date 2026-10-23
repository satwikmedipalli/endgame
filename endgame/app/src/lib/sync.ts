// Pure mapping and merge logic between the on-device feeds and Supabase rows.
import type { Card, ChatMessage, DayFeed } from './types';

export type DayRow = { user_id: string; day: string; built_at: string; source: 'app' | 'sync' };
export type CardRow = {
  user_id: string;
  day: string;
  id: string;
  position: number;
  kind: Card['kind'];
  course: string | null;
  status: Card['status'];
  opened_at: string | null;
  continued: boolean;
  content: Pick<Card, 'title' | 'hook' | 'tag' | 'cta' | 'sources' | 'blocks' | 'preview' | 'practice'>;
  watch: Card['watch'] | null;
  updated_at: string;
};
export type ChatRow = { id: string; user_id: string; card_id: string; role: ChatMessage['role']; text: string; created_at: string };

export type Rows = { days: DayRow[]; cards: CardRow[]; chats: ChatRow[] };

export function toRows(feeds: Record<string, DayFeed>, userId: string): Rows {
  const days: DayRow[] = [];
  const cards: CardRow[] = [];
  const chats = new Map<string, ChatRow>();
  for (const f of Object.values(feeds)) {
    days.push({ user_id: userId, day: f.day, built_at: f.builtAt, source: f.source ?? 'app' });
    f.cards.forEach((c, position) => {
      cards.push({
        user_id: userId,
        day: f.day,
        id: c.id,
        position,
        kind: c.kind,
        course: c.course ?? null,
        status: c.status,
        opened_at: c.openedAt ?? null,
        continued: !!c.continued,
        content: { title: c.title, hook: c.hook, tag: c.tag, cta: c.cta, sources: c.sources, blocks: c.blocks, preview: c.preview, practice: c.practice },
        watch: c.watch ?? null,
        updated_at: c.updatedAt ?? f.builtAt,
      });
      // A carried card shows the same chat on two days; send each message once.
      for (const m of c.chat) {
        chats.set(m.id, { id: m.id, user_id: userId, card_id: c.id, role: m.role, text: m.text, created_at: m.at });
      }
    });
  }
  return { days, cards, chats: [...chats.values()] };
}

// Postgres returns "+00:00" timestamps; JS writes "Z". Normalise so comparisons work.
const iso = (t: string | null | undefined) => {
  if (!t) return undefined;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? t : d.toISOString();
};

export function fromRows(rows: Rows): Record<string, DayFeed> {
  const chatBy = new Map<string, ChatMessage[]>();
  for (const m of [...rows.chats].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const list = chatBy.get(m.card_id) ?? [];
    list.push({ id: m.id, role: m.role, text: m.text, at: iso(m.created_at)! });
    chatBy.set(m.card_id, list);
  }
  const feeds: Record<string, DayFeed> = {};
  for (const d of rows.days) feeds[d.day] = { day: d.day, builtAt: iso(d.built_at)!, cards: [], source: d.source ?? 'app' };
  for (const r of [...rows.cards].sort((a, b) => a.position - b.position)) {
    const f = feeds[r.day];
    if (!f) continue;
    f.cards.push({
      ...r.content,
      id: r.id,
      kind: r.kind,
      course: r.course ?? undefined,
      status: r.status,
      openedAt: iso(r.opened_at),
      continued: r.continued || undefined,
      watch: r.watch ?? undefined,
      chat: chatBy.get(r.id) ?? [],
      updatedAt: iso(r.updated_at),
    });
  }
  return feeds;
}

const newer = (a?: string, b?: string) => (a ?? '') >= (b ?? '');

function mergeChat(a: ChatMessage[], b: ChatMessage[]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  for (const m of [...a, ...b]) byId.set(m.id, m);
  return [...byId.values()].sort((x, y) => x.at.localeCompare(y.at));
}

/**
 * Merges the device copy with the server copy. Days and cards from either side
 * survive; for a card on both sides the newer `updatedAt` wins; chat is a union.
 * Card order follows whichever copy of the day was built later.
 */
export function mergeFeeds(local: Record<string, DayFeed>, remote: Record<string, DayFeed>): Record<string, DayFeed> {
  const out: Record<string, DayFeed> = { ...local };
  for (const [day, r] of Object.entries(remote)) {
    const l = local[day];
    if (!l) {
      out[day] = r;
      continue;
    }
    // A Sync-built day replaces the phone's fallback outright (its placeholder cards go);
    // otherwise the later build leads and cards from both sides survive.
    const syncWins = (r.source === 'sync') !== (l.source === 'sync');
    const [lead, other] = syncWins ? (r.source === 'sync' ? [r, l] : [l, r]) : newer(r.builtAt, l.builtAt) ? [r, l] : [l, r];
    const otherById = new Map(other.cards.map((c) => [c.id, c]));
    const cards = lead.cards.map((c) => {
      const o = otherById.get(c.id);
      if (!o) return c;
      otherById.delete(c.id);
      const win = newer(c.updatedAt, o.updatedAt) ? c : o;
      return { ...win, chat: mergeChat(c.chat, o.chat) };
    });
    // A newer Sync of the same day already kept every card you had touched, so a card
    // only the phone has is dropped unless it changed after that build.
    const rebuilt = !syncWins && lead === r && r.source === 'sync';
    const extras = syncWins ? [] : [...otherById.values()].filter((c) => !rebuilt || newer(c.updatedAt, r.builtAt));
    out[day] = { ...lead, cards: [...cards, ...extras] };
  }
  return out;
}

/** JSON snapshot per row key, used to send only rows that changed since the last push. */
export function snapshot(rows: Rows): Record<string, string> {
  const s: Record<string, string> = {};
  for (const d of rows.days) s[`d:${d.day}`] = JSON.stringify(d);
  for (const c of rows.cards) s[`c:${c.day}:${c.id}`] = JSON.stringify(c);
  for (const m of rows.chats) s[`m:${m.id}`] = JSON.stringify(m);
  return s;
}

export function changedRows(rows: Rows, last: Record<string, string>): Rows {
  const now = snapshot(rows);
  const changed = (k: string) => now[k] !== last[k];
  return {
    days: rows.days.filter((d) => changed(`d:${d.day}`)),
    cards: rows.cards.filter((c) => changed(`c:${c.day}:${c.id}`)),
    chats: rows.chats.filter((m) => changed(`m:${m.id}`)),
  };
}

export const isEmpty = (r: Rows) => !r.days.length && !r.cards.length && !r.chats.length;
