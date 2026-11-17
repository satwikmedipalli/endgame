import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { flattenSyllabus, topicCard } from '../../../shared/course.ts';
import type { Card, DayFeed } from '../../../shared/types.ts';
import { blocksToText } from '../../../shared/cardText.ts';
import { chatPrompt } from '../chat.ts';
import type { Reaction } from '../db.ts';
import { historyCard } from '../discover/history.ts';
import { alreadySeen, describe as describeTaste, pick, score, signal } from '../discover/taste.ts';
import { keyOfCard, nextType, verdicts, watchCard, type Title } from '../discover/watch.ts';
import { lessonPrompt } from '../lessons/lesson.ts';
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

  it('keeps content written on tap, even on an untouched card', () => {
    const lesson = [{ type: 'text' as const, text: 'written' }];
    const existing = feed([card('code-1-01', { kind: 'code', blocks: lesson }), card('watch-film-x', { kind: 'watch', blocks: lesson, openedAt: 'y' })]);
    const built = feed([card('code-1-01', { kind: 'code' }), card('watch-film-x', { kind: 'watch' })]);
    const out = mergeRebuild(built, existing);
    assert.deepEqual(out.cards.map((c) => c.blocks), [lesson, lesson]);
    assert.equal(out.cards[1].openedAt, 'y');
  });

  it('replaces a day the phone built: skipped placeholders go, a carried card keeps its state', () => {
    const existing: DayFeed = { day: '2026-10-23', builtAt: '', cards: [card('[placeholder]', { status: 'skip' }), card('chess-drill-3', { kind: 'chess', openedAt: 'x' })] };
    const built = feed([card('n-new'), card('chess-drill-3', { kind: 'chess' })]);
    const out = mergeRebuild(built, existing);
    assert.deepEqual(out.cards.map((c) => c.id), ['n-new', 'chess-drill-3']);
    assert.equal(out.cards[1].openedAt, 'x');
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

describe('lesson prompt', () => {
  const course = {
    course: 'stocks' as const,
    summary: 'Shares: a share is a slice of a company.',
    syllabus: flattenSyllabus([{ title: 'Basics', topics: ['Shares', 'Exchanges', 'Orders', 'Indexes'].map((title) => ({ title, hook: 'h', minutes: 15 })) }]),
  };
  const lesson = topicCard('stocks', course.syllabus[2], course.syllabus);

  it('sends the position, the notes and what comes next, never past chats', () => {
    const { system, prompt } = lessonPrompt(course, { ...lesson, chat: [{ id: '1', role: 'user', text: 'old chat', at: '' }] });
    assert.match(prompt, /lesson 3 of 4/);
    assert.match(prompt, /- Exchanges/);
    assert.match(prompt, /do not teach these yet\):\n- Indexes/);
    assert.match(prompt, /a share is a slice/);
    assert.doesNotMatch(prompt + system, /old chat/);
    assert.match(system, /candle/);
    assert.match(system, /about 15 minutes/);
  });

  it('the chat tutor gets the course notes too', () => {
    const { system } = chatPrompt(lesson, 'why?', course.summary);
    assert.match(system, /already covered in this course:\nShares: a share is a slice/);
    assert.match(system, /not been written yet/);
  });
});

describe('taste', () => {
  it('scores eras and themes from what you open, finish and skip', () => {
    const s = score([
      { traits: ['1800s', 'war'], signal: signal({ status: 'done', opened: true }) },
      { traits: ['1800s', 'science'], signal: signal({ status: 'open', opened: true }) },
      { traits: ['Medieval (500–1500)', 'sport'], signal: signal({ status: 'skip', opened: false }) },
      { traits: ['Since 2000', 'money'], signal: signal({ status: 'open', opened: false }) },
    ]);
    assert.equal(s.get('1800s'), 3);
    assert.equal(s.get('sport'), -1);
    assert.equal(describeTaste(s), 'Likes: 1800s (+3), war (+2), science (+1). Less keen on: sport (-1), Medieval (500–1500) (-1).');
    assert.equal(describeTaste(new Map()), '');
  });

  it('never repeats a story, even reworded', () => {
    const seen = [{ title: 'The Great Emu War' }, { title: 'The dancing plague of Strasbourg in 1518' }];
    assert.ok(alreadySeen('The great emu war!', seen));
    assert.ok(alreadySeen('Strasbourg 1518: the dancing plague', seen));
    assert.ok(!alreadySeen('The man who sold the Eiffel Tower', seen));
  });

  it('picks one by taste and the rest at random', () => {
    const c = [{ t: 'a', tr: ['sport'] }, { t: 'b', tr: ['war'] }, { t: 'c', tr: ['science'] }];
    const s = new Map([['war', 3]]);
    const out = pick(c, 2, (x) => x.tr, s, () => 0);
    assert.deepEqual(out.map((x) => x.t), ['b', 'a']);
    // No taste yet: all random.
    assert.deepEqual(pick(c, 1, (x) => x.tr, new Map(), () => 0.99).map((x) => x.t), ['c']);
  });
});

describe('watch', () => {
  const r = (id: string, extra: Partial<Reaction> = {}): Reaction => ({ id, day: '2026-10-23', status: 'open', opened: false, watch: null, ...extra });

  it('folds teaser, pitch and follow-up rating into one verdict', () => {
    const vs = verdicts([
      r('watch-film-arrival', { opened: true, watch: { stage: 'decided', willWatch: true } }),
      r('watch-film-arrival-followup', { status: 'done', opened: true, watch: { stage: 'rated', rating: 9, comment: 'loved it' } }),
      r('watch-book-dune', { status: 'skip', opened: true, watch: { stage: 'teaser' } }),
      r('watch-tv-lost', { status: 'skip', watch: { stage: 'teaser' } }),
      r('watch-tv-fargo', { opened: true, watch: { stage: 'pitch' } }),
    ]);
    const by = Object.fromEntries(vs.map((v) => [v.key, v]));
    assert.deepEqual([by['film-arrival'].signal, by['film-arrival'].comment, by['film-arrival'].willWatch], [4, 'loved it', true]);
    assert.deepEqual([by['book-dune'].signal, by['book-dune'].interested], [-2, false]);
    assert.equal(by['tv-lost'].signal, -1);
    assert.equal(by['tv-fargo'].signal, 1);
  });

  it('ids and the follow-up map back to one title', () => {
    const card = watchCard({ title: 'Arrival', type: 'film', year: 2016, byline: 'Directed by Denis Villeneuve', genres: ['sci-fi'] });
    assert.equal(card.id, 'watch-film-arrival');
    assert.equal(card.tag, 'Film · 2016');
    assert.equal(keyOfCard(`${card.id}-followup`), 'film-arrival');
  });

  it('rotates films, shows and books', () => {
    const seen = (types: string[]) => types.map((type, i) => ({ key: String(i), created_at: '', meta: { type } as Title }));
    assert.equal(nextType(seen(['film', 'tv', 'film', 'tv'])), 'book');
    assert.equal(nextType(seen([]), () => 0), 'film');
  });

  it('history card ids come from the title', () => {
    assert.equal(historyCard({ title: 'The Great Emu War', hook: 'h', era: '1900–1945', theme: 'war', place: 'Australia', year: '1932' }).id, 'history-the-great-emu-war');
  });
});
