import { assert, assertEquals, assertMatch, assertNotMatch } from '@std/assert';
import type { SupabaseClient } from '@supabase/supabase-js';

import { cardDoc, courseDoc, summaryText } from './docs.ts';
import { callTool, handle, sameKey } from './server.ts';

const KEY = 'k'.repeat(40);
type Row = Record<string, unknown>;

/** Just enough of supabase-js for the connector: filters, order, limit, insert. */
function fakeDb(tables: Record<string, Row[]>) {
  const inserts: { table: string; row: Row }[] = [];
  const sb = {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      const q = {
        select: () => q,
        eq: (k: string, v: unknown) => ((rows = rows.filter((r) => r[k] === v)), q),
        order: (k: string, o?: { ascending?: boolean }) => (
          (rows = rows.sort((a, b) => String(a[k]).localeCompare(String(b[k])) * (o?.ascending === false ? -1 : 1))), q
        ),
        limit: (n: number) => ((rows = rows.slice(0, n)), q),
        maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
        insert: (row: Row) => (inserts.push({ table, row }), Promise.resolve({ error: null })),
        then: (f: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(f),
      };
      return q;
    },
  };
  return { sb: sb as unknown as SupabaseClient, inserts };
}

const lesson = (day: string, extra: Row = {}) => ({
  day,
  id: 'code-1-03',
  position: 2,
  kind: 'code',
  course: 'code',
  status: 'open',
  continued: false,
  content: { title: 'Variables', hook: 'Boxes with names', tag: 'Coding · Lesson 3 · ~7 min', cta: 'Explain', blocks: [{ type: 'text', text: 'A variable is a named box.' }] },
  ...extra,
});

const call = async (db: ReturnType<typeof fakeDb>, body: unknown, key = KEY) =>
  await handle(new Request(`https://x.supabase.co/functions/v1/mcp/${key}`, { method: 'POST', body: JSON.stringify(body) }), KEY, () => Promise.resolve(db.sb));

const tool = async (db: ReturnType<typeof fakeDb>, name: string, args: Row = {}) => {
  const res = await call(db, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
  const out = await res.json();
  return { text: out.result.content[0].text as string, isError: !!out.result.isError };
};

Deno.test('a wrong or missing key gets a plain 404, and the database is never touched', async () => {
  let touched = false;
  const res = await handle(new Request('https://x/functions/v1/mcp/nope', { method: 'POST', body: '{}' }), KEY, () => ((touched = true), Promise.reject()));
  assertEquals(res.status, 404);
  assertEquals((await handle(new Request(`https://x/functions/v1/mcp/${KEY}`, { method: 'POST', body: '{}' }), 'short', () => Promise.reject())).status, 404);
  assert(!touched);
  assert(sameKey('abc', 'abc') && !sameKey('abc', 'abd') && !sameKey('abc', 'abcd'));
});

Deno.test('initialize, notifications and tools/list follow MCP', async () => {
  const db = fakeDb({});
  const init = await (await call(db, { jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-06-18' } })).json();
  assertEquals(init.result.protocolVersion, '2025-06-18');
  assertEquals(init.result.serverInfo.name, 'endgame');
  assertEquals((await call(db, { jsonrpc: '2.0', method: 'notifications/initialized' })).status, 202);
  const list = await (await call(db, { jsonrpc: '2.0', id: 2, method: 'tools/list' })).json();
  assertEquals(list.result.tools.map((t: { name: string }) => t.name), ['today', 'get_card', 'get_course', 'save_summary']);
  const bad = await (await call(db, { jsonrpc: '2.0', id: 3, method: 'resources/list' })).json();
  assertEquals(bad.error.code, -32601);
});

Deno.test('get_card returns the newest copy with chat and course notes', async () => {
  const db = fakeDb({
    cards: [lesson('2026-10-22', { status: 'skip' }), lesson('2026-10-23', { continued: true })],
    chat_messages: [{ id: 'm1', card_id: 'code-1-03', role: 'user', text: 'Why a box?', created_at: '2026-10-22T10:00:00Z' }],
    courses: [{ course: 'code', syllabus: [], summary: '- 1-01: what a program is' }],
  });
  const { text, isError } = await tool(db, 'get_card', { card_id: 'code-1-03' });
  assert(!isError);
  assertMatch(text, /2026-10-23 · not done/);
  assertMatch(text, /A variable is a named box/);
  assertMatch(text, /Me: Why a box\?/);
  assertMatch(text, /what a program is/);
  assertMatch(text, /save_summary with card_id `code-1-03`/);
  assert((await tool(db, 'get_card', { card_id: 'nope' })).isError);
});

Deno.test('save_summary only appends one assistant chat line, and only for a real card', async () => {
  const db = fakeDb({ cards: [lesson('2026-10-23')], chat_messages: [] });
  const ok = await tool(db, 'save_summary', { card_id: 'code-1-03', summary: '  Covered variables; mixed up = and ==.  ' });
  assertMatch(ok.text, /Saved to "Variables"/);
  assertEquals(db.inserts, [{ table: 'chat_messages', row: { card_id: 'code-1-03', role: 'assistant', text: 'From the Claude app: Covered variables; mixed up = and ==.' } }]);
  assert((await tool(db, 'save_summary', { card_id: 'ghost', summary: 'x' })).isError);
  assert((await tool(db, 'save_summary', { card_id: 'code-1-03', summary: ' ' })).isError);
  assertEquals(db.inserts.length, 1);
  assertEquals(summaryText('x'.repeat(5000)).length, 'From the Claude app: '.length + 2000);
});

Deno.test('today lists the Chicago day; errors come back as tool errors', async () => {
  const db = fakeDb({ cards: [lesson('2026-10-23')] });
  // 02:00 UTC on the 24th is still the 23rd in Chicago.
  assertMatch(await callTool(db.sb, 'today', {}, new Date('2026-10-24T02:00:00Z')), /`code-1-03` · Coding · Variables .* — not done/);
  assertMatch(await callTool(db.sb, 'today', {}, new Date('2026-10-25T12:00:00Z')), /No feed for 2026-10-25/);
  assert((await tool(db, 'get_course', { course: 'french' })).isError);
});

Deno.test('an unwritten lesson asks Claude to teach it from the course goal', () => {
  const text = cardDoc({ ...lesson('2026-10-23').content, blocks: [], id: 'italian-1-02', day: '2026-10-23', kind: 'italian', course: 'italian', status: 'open', chat: [] } as never);
  assertMatch(text, /Not written yet/);
  assertMatch(text, /reach fluency \(C1\)/);
  assertNotMatch(text, /Chat so far/);
});

Deno.test('courseDoc marks progress by unit', () => {
  const text = courseDoc({
    course: 'chess',
    summary: '',
    syllabus: [
      { id: '1-01', unit: 'Notation', title: 'Files and ranks', hook: '', minutes: 5, doneAt: '2026-10-22' },
      { id: '1-02', unit: 'Notation', title: 'Pieces', hook: '', minutes: 5 },
    ],
  });
  assertMatch(text, /1 of 2 topics done/);
  assertMatch(text, /### Notation\n- ✓ 1-01 Files and ranks\n- ○ 1-02 Pieces/);
});
