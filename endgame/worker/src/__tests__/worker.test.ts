import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Card, DayFeed } from '../../../app/src/lib/types.ts';
import { blocksToText, chatPrompt } from '../chat.ts';
import { cluster, similarity, tokens } from '../news/cluster.ts';
import { parseFeed, type Item } from '../news/rss.ts';
import type { Source } from '../news/sources.ts';
import { choose, type Story } from '../news/write.ts';
import { mergeRebuild, targetDay } from '../sync.ts';

const src = (name: string, region: Source['region'] = 'US', url = `https://${name}.example/rss`): Source => ({ name, url, region });
const item = (title: string, outlet: string, region: Source['region'] = 'US', published = Date.now()): Item => ({
  title,
  summary: '',
  link: '',
  outlet,
  published,
  source: src(outlet, region),
});

describe('rss parsing', () => {
  it('reads RSS 2.0 with CDATA and entities', () => {
    const xml = `<rss><channel><item><title><![CDATA[Fed holds rates &amp; signals cut]]></title><description>&lt;p&gt;Markets rose.&lt;/p&gt;</description><pubDate>Thu, 22 Oct 2026 14:00:00 GMT</pubDate><link>https://x/1</link></item></channel></rss>`;
    const [it] = parseFeed(xml, src('X'));
    assert.equal(it.title, 'Fed holds rates & signals cut');
    assert.equal(it.summary, 'Markets rose.');
    assert.equal(it.published, Date.parse('2026-10-22T14:00:00Z'));
  });

  it('splits the publisher off Google News titles', () => {
    const xml = `<rss><channel><item><title>Big storm hits the coast tonight - The Hindu</title><source url="https://thehindu.com">The Hindu</source><pubDate>Thu, 22 Oct 2026 14:00:00 GMT</pubDate></item></channel></rss>`;
    const [it] = parseFeed(xml, { name: 'Google News', url: 'https://news.google.com/rss', region: 'IN' });
    assert.equal(it.title, 'Big storm hits the coast tonight');
    assert.equal(it.outlet, 'The Hindu');
  });

  it('reads Atom entries', () => {
    const xml = `<feed><entry><title>Atom headline here</title><link href="https://x/a"/><updated>2026-10-22T10:00:00Z</updated></entry></feed>`;
    const [it] = parseFeed(xml, src('A'));
    assert.equal(it.link, 'https://x/a');
  });
});

describe('dedupe', () => {
  it('rewrites of the same story share key words', () => {
    const a = tokens('Trump says Musk has restored access to Ukraine’s Starlink network');
    const b = tokens('Trump says Musk restored Ukraine’s Starlink access amid Russia war');
    assert.ok(similarity(a, b) >= 0.6);
    assert.ok(similarity(a, tokens('Bears beat Patriots with a late field goal')) < 0.2);
  });

  it('groups duplicates and counts distinct outlets', () => {
    const cs = cluster([
      item('Trump says Musk has restored access to Ukraine’s Starlink network', 'BBC'),
      item('Trump says Musk has restored access to Ukraine’s Starlink network', 'BBC'),
      item('Trump says Musk restored Ukraine’s Starlink access amid Russia war', 'Al Jazeera', 'World'),
      item('Bears beat Patriots with a late field goal', 'ESPN'),
    ]);
    assert.equal(cs.length, 2);
    const star = cs.find((c) => c.items.length === 3)!;
    assert.deepEqual(star.outlets.sort(), ['Al Jazeera', 'BBC']);
    assert.equal(star.region, 'US');
  });

  it('drops stale items', () => {
    const old = Date.now() - 48 * 3600_000;
    assert.equal(cluster([item('An old story about something else entirely', 'X', 'US', old)]).length, 0);
  });
});

describe('choosing stories', () => {
  const story = (region: Story['region'], category: string, importance: number, outlets = 1): Story => ({
    region,
    category,
    importance,
    clusters: [{ key: `${region}${category}${importance}${Math.random()}`, items: [], outlets: Array.from({ length: outlets }, (_, i) => `o${i}`), region, latest: 0, score: 0 }],
  });

  it('orders US, India, world and respects quotas', () => {
    const picked = choose(
      [story('World', 'Politics', 5), story('IN', 'Politics', 4), story('US', 'Politics', 3), story('US', 'Tech', 5)],
      { US: 2, IN: 1, World: 1 },
    );
    assert.deepEqual(
      picked.map((s) => [s.region, s.category]),
      [
        ['US', 'Tech'],
        ['US', 'Politics'],
        ['IN', 'Politics'],
        ['World', 'Politics'],
      ],
    );
  });

  it('caps one category at a third of a region', () => {
    const many = Array.from({ length: 6 }, () => story('US', 'Sports', 5));
    const picked = choose([...many, story('US', 'Politics', 2)], { US: 6, IN: 0, World: 0 });
    assert.equal(picked.filter((s) => s.category === 'Sports').length, 2);
  });
});

const card = (id: string, extra: Partial<Card> = {}): Card => ({ id, kind: 'news', title: id, hook: '', tag: '', cta: '', blocks: [], status: 'open', chat: [], ...extra });
const feed = (cards: Card[]): DayFeed => ({ day: '2026-10-23', builtAt: '', cards, source: 'sync' });

describe('re-running Sync on a started day', () => {
  it('keeps what you touched and replaces the rest', () => {
    const existing = feed([card('n-old-read', { status: 'done' }), card('n-old-untouched'), card('code-1', { kind: 'code', openedAt: 'x' })]);
    const built = feed([card('n-new'), card('code-1', { kind: 'code' }), card('code-2', { kind: 'code' })]);
    const out = mergeRebuild(built, existing);
    assert.deepEqual(
      out.cards.map((c) => c.id),
      ['n-new', 'n-old-read', 'code-1', 'code-2'],
    );
    assert.equal(out.cards.find((c) => c.id === 'code-1')!.openedAt, 'x');
  });

  it('a first build is used as is', () => {
    const built = feed([card('a')]);
    assert.equal(mergeRebuild(built, null), built);
  });
});

describe('targetDay', () => {
  it('builds today before 5 PM Chicago and tomorrow after', () => {
    assert.equal(targetDay(new Date('2026-10-23T14:00:00Z')), '2026-10-23'); // 9 AM CDT
    assert.equal(targetDay(new Date('2026-10-23T23:00:00Z')), '2026-10-24'); // 6 PM CDT
    assert.equal(targetDay(new Date('2026-10-31T23:30:00Z')), '2026-11-01'); // month rollover
  });
});

describe('chat prompt', () => {
  it('includes the card content, the history and the kind rules', () => {
    const c = card('s1', {
      kind: 'stocks',
      tag: 'Lesson 1',
      title: 'Shares',
      blocks: [{ type: 'text', text: 'A share is a slice.' }, { type: 'quiz', question: 'Q?', options: ['a', 'b'], answer: 1, explain: 'because' }],
      chat: [
        { id: '1', role: 'user', text: 'earlier q', at: '' },
        { id: '2', role: 'assistant', text: 'earlier a', at: '' },
        { id: '3', role: 'system', text: 'Mac offline note', at: '' },
      ],
    });
    const { system, prompt } = chatPrompt(c, 'new question');
    assert.match(system, /A share is a slice/);
    assert.match(system, /not financial advice/);
    assert.match(prompt, /Me: earlier q/);
    assert.doesNotMatch(prompt, /Mac offline note/);
    assert.match(prompt, /Me: new question/);
  });

  it('renders every block type to text', () => {
    const text = blocksToText([
      { type: 'chessBoard', fen: '8/8/8/8/8/8/8/8 w - - 0 1' },
      { type: 'italianPhrase', it: 'Ciao', en: 'Hi' },
      { type: 'chart', kind: 'line', points: [1, 2] },
    ]);
    assert.match(text, /FEN/);
    assert.match(text, /Ciao = Hi/);
  });
});
