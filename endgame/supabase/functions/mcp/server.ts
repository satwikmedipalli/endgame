// The "Discuss in Claude" connector: a remote MCP server (Streamable HTTP, stateless JSON
// responses) that lets the Claude app read Endgame cards and save a summary back.
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Course } from '../../../app/src/lib/course.ts';
import { HOME } from '../../../app/src/lib/sun.ts';
import type { Card, ChatMessage } from '../../../app/src/lib/types.ts';
import type { CardRow, ChatRow } from '../../../app/src/lib/sync.ts';
import { cardDoc, courseDoc, SUMMARY_MAX, summaryText, todayDoc } from './docs.ts';

// Same calendar day as the app's dayKey (feed.ts), which the deploy bundler can't import.
const dayKey = (now: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: HOME.tz }).format(now);

const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const COURSE_IDS = ['code', 'stocks', 'chess', 'italian'];

export const TOOLS = [
  {
    name: 'today',
    description: "Lists today's Endgame cards (id, course, title, done or not). Start here when I don't name a card.",
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_card',
    description: 'Reads one Endgame card: the full lesson or story, the chat so far, my notes for that course, and how to discuss it.',
    inputSchema: {
      type: 'object',
      properties: { card_id: { type: 'string', description: 'Card id from today, e.g. "code-1-03" or "news-1".' } },
      required: ['card_id'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_course',
    description: "Shows a course's syllabus (done and not done), and my notes on what I've learned so far.",
    inputSchema: {
      type: 'object',
      properties: { course: { type: 'string', enum: COURSE_IDS, description: 'code = Coding, stocks = Stock market, chess, italian.' } },
      required: ['course'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'save_summary',
    description:
      "Saves a short summary of this conversation to the card's chat in the Endgame app, so the app and the Mac remember it. Call it once when we wrap up, or when I ask.",
    inputSchema: {
      type: 'object',
      properties: {
        card_id: { type: 'string' },
        summary: { type: 'string', maxLength: SUMMARY_MAX, description: 'A few plain sentences: what we covered and anything I struggled with.' },
      },
      required: ['card_id', 'summary'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  },
];

const INSTRUCTIONS =
  'Endgame is my daily learning feed (news, coding, stocks, history, chess, Italian, something to watch). Open a card with get_card before discussing it, and follow its "How to discuss it" section. Call save_summary once when we wrap up.';

type Rpc = { jsonrpc: '2.0'; id?: string | number | null; method: string; params?: Record<string, unknown> };
class ToolError extends Error {}

/** The newest copy of a card (a carried-over lesson appears on two days) with its chat. */
async function loadCard(sb: SupabaseClient, id: string): Promise<(Card & { day: string }) | null> {
  const c = await sb.from('cards').select('*').eq('id', id).order('day', { ascending: false }).limit(1);
  if (c.error) throw c.error;
  const row = c.data?.[0] as CardRow | undefined;
  if (!row) return null;
  const m = await sb.from('chat_messages').select('*').eq('card_id', id).order('created_at');
  if (m.error) throw m.error;
  const chat: ChatMessage[] = ((m.data ?? []) as ChatRow[]).map((r) => ({ id: r.id, role: r.role, text: r.text, at: r.created_at }));
  return {
    ...row.content,
    id: row.id,
    day: row.day,
    kind: row.kind,
    course: row.course ?? undefined,
    status: row.status,
    continued: row.continued || undefined,
    blocks: row.content.blocks ?? [],
    chat,
  };
}

async function loadCourse(sb: SupabaseClient, course: string) {
  const { data, error } = await sb.from('courses').select('course, syllabus, summary').eq('course', course).maybeSingle();
  if (error) throw error;
  return data as Pick<Course, 'course' | 'syllabus' | 'summary'> | null;
}

export async function callTool(sb: SupabaseClient, name: string, args: Record<string, unknown>, now = new Date()): Promise<string> {
  const str = (k: string) => {
    const v = args[k];
    if (typeof v !== 'string' || !v.trim()) throw new ToolError(`${k} is required`);
    return v.trim();
  };
  switch (name) {
    case 'today': {
      const day = dayKey(now);
      const { data, error } = await sb.from('cards').select('*').eq('day', day).order('position');
      if (error) throw error;
      const cards = ((data ?? []) as CardRow[]).map((r) => ({ ...r.content, id: r.id, kind: r.kind, status: r.status, continued: r.continued, chat: [] }) as Card);
      return todayDoc(day, cards);
    }
    case 'get_card': {
      const card = await loadCard(sb, str('card_id'));
      if (!card) throw new ToolError(`No card "${args.card_id}". Call today for today's ids.`);
      const course = card.course && COURSE_IDS.includes(card.course) ? await loadCourse(sb, card.course) : null;
      return cardDoc(card, course);
    }
    case 'get_course': {
      const id = str('course');
      if (!COURSE_IDS.includes(id)) throw new ToolError(`Unknown course "${id}". Use one of ${COURSE_IDS.join(', ')}.`);
      const course = await loadCourse(sb, id);
      if (!course) throw new ToolError(`The ${id} syllabus hasn't been written yet (the Mac writes it on Sync).`);
      return courseDoc(course);
    }
    case 'save_summary': {
      const cardId = str('card_id');
      const summary = str('summary');
      const card = await loadCard(sb, cardId);
      if (!card) throw new ToolError(`No card "${cardId}".`);
      // Only appends a chat line; the connector never edits or deletes anything.
      const { error } = await sb.from('chat_messages').insert({ card_id: cardId, role: 'assistant', text: summaryText(summary) });
      if (error) throw error;
      return `Saved to "${card.title}" in Endgame.`;
    }
    default:
      throw new ToolError(`Unknown tool ${name}`);
  }
}

/** Answers one JSON-RPC message; null for notifications. */
export async function rpc(msg: Rpc, sb: () => Promise<SupabaseClient>): Promise<object | null> {
  const ok = (result: object) => ({ jsonrpc: '2.0', id: msg.id ?? null, result });
  if (msg.id === undefined || msg.id === null) return null; // notifications/initialized and friends
  switch (msg.method) {
    case 'initialize': {
      const asked = String(msg.params?.protocolVersion ?? '');
      return ok({
        protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'endgame', title: 'Endgame', version: '1.0.0' },
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping':
      return ok({});
    case 'tools/list':
      return ok({ tools: TOOLS });
    case 'tools/call': {
      const name = String(msg.params?.name ?? '');
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
      try {
        return ok({ content: [{ type: 'text', text: await callTool(await sb(), name, args) }] });
      } catch (e) {
        const text = e instanceof ToolError ? e.message : `Endgame couldn't do that: ${e instanceof Error ? e.message : String(e)}`;
        return ok({ content: [{ type: 'text', text }], isError: true });
      }
    }
    default:
      return { jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `Method not found: ${msg.method}` } };
  }
}

/** Constant-time compare, so the key can't be guessed one character at a time. */
export function sameKey(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

const json = (body: unknown, status = 200) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** The whole HTTP side. The secret key is the last part of the URL: …/functions/v1/mcp/<key>. */
export async function handle(req: Request, key: string, sb: () => Promise<SupabaseClient>): Promise<Response> {
  const given = new URL(req.url).pathname.split('/').filter(Boolean).at(-1) ?? '';
  if (key.length < 32 || !sameKey(given, key)) return new Response('Not found', { status: 404 });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { allow: 'POST' } });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400);
  }
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => rpc(m as Rpc, sb)))).filter(Boolean);
    return out.length ? json(out) : new Response(null, { status: 202 });
  }
  const out = await rpc(body as Rpc, sb);
  return out ? json(out) : new Response(null, { status: 202 });
}
