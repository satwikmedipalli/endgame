// Dummy content for milestone 1. Sync replaces all of this from milestone 3 on.
import { numberGrid } from '../crossword';
import { levelFor, makeSudoku } from '../sudoku';
import type { Block, Card, DayFeed } from '../types';
import demoNews from './demo-news.json';

type Draft = Omit<Card, 'status' | 'chat'> & Partial<Pick<Card, 'status' | 'chat'>>;
const card = (d: Draft): Card => ({ status: 'open', chat: [], ...d });

const NEWS_SLOTS: [string, string, number][] = [
  ['US · Politics', 'Top US story', 9],
  ['US · Economy', 'US economy story', 6],
  ['US · Tech', 'US tech story', 5],
  ['US · Sports', 'US sports story', 4],
  ['IN · Politics', 'Top India story', 8],
  ['IN · Cricket', 'India cricket story', 5],
  ['IN · Business', 'India business story', 4],
  ['IN · Science', 'India science story', 3],
  ['World · Europe', 'Europe story', 7],
  ['World · Asia', 'Asia story', 5],
  ['World · Climate', 'Climate story', 4],
  ['World · Health', 'Health story', 3],
];

// The sample day in the Mac app shows 12 real cards from a Sync on 2026-11-11 instead of
// placeholders (tests, which run without a window, keep the placeholders). The paper you
// sign into never uses them.
const DEMO = typeof window !== 'undefined';

const newsCards = (day: string): Card[] =>
  DEMO
    ? (demoNews as Omit<Draft, 'id' | 'kind'>[]).map((c, i) => card({ ...c, id: `news-${day}-${i + 1}`, kind: 'news' }))
    : NEWS_SLOTS.map(([tag, what, n], i) =>
      card({
        id: `news-${day}-${i + 1}`,
        kind: 'news',
        title: `[${what} — the headline pulled at Sync]`,
        hook: `[Source] · ${7 + Math.floor(i / 4)}:${String((i * 13) % 60).padStart(2, '0')} AM`,
        tag,
        cta: 'Deep dive',
        sources: n,
        blocks: [
          { type: 'text', text: `This is where the deep dive for the ${what.toLowerCase()} goes. Sync writes it ahead of time from all ${n} sources, so it opens even with the Mac off.` },
          { type: 'callout', label: 'Covered by', text: `${n} sources. Duplicates are merged before you ever see them.` },
        ],
      }),
    );

const coding1: Block[] = [
  { type: 'text', text: "A computer can't guess what you mean. It reads your instructions one line at a time, top to bottom, and does exactly what each line says." },
  { type: 'callout', label: 'Analogy', text: 'A variable is a labeled box. The label is its name. Whatever you put inside is its value.' },
  { type: 'heading', text: 'What the computer is doing' },
  {
    type: 'diagram',
    rows: [
      { code: 'age = 27', label: 'age', value: '27' },
      { code: 'name = "Satwik"', label: 'name', value: '"Satwik"' },
      { code: 'print(name, age)', value: 'Satwik 27' },
    ],
    caption: "Lines 1 and 2 fill two boxes. Line 3 opens both boxes and shows what's inside on the screen.",
  },
  { type: 'heading', text: 'Predict the output' },
  {
    type: 'quiz',
    question: 'What does this print?',
    code: 'x = 5\nx = x + 2\nprint(x)',
    options: ['5', '7', 'x + 2', 'Error'],
    answer: 1,
    explain: "Line 2 takes what's in x (5), adds 2, and stores 7 back in the same box.",
  },
];

const coding2: Block[] = [
  { type: 'text', text: 'Programs get interesting when they can choose. An if statement checks something, and only runs the indented lines below it when the check is true.' },
  { type: 'code', language: 'python', code: 'temp = 31\nif temp > 30:\n    print("Hot day")\nprint("Done")' },
  { type: 'callout', label: 'Analogy', text: 'A bouncer at a door. If you are on the list, you go in. Everyone continues down the street either way.' },
  {
    type: 'quiz',
    question: 'If temp = 20, what prints?',
    options: ['Hot day, then Done', 'Only Done', 'Nothing', 'Error'],
    answer: 1,
    explain: '20 > 30 is false, so the indented line is skipped. "Done" is not indented, so it always runs.',
  },
];

const history1: Block[] = [
  { type: 'text', text: 'In late 1932, farmers in Western Australia were losing their wheat to roughly 20,000 emus that had moved inland after breeding season.' },
  { type: 'text', text: 'The government sent Major G.P.W. Meredith of the Royal Australian Artillery with two soldiers, two Lewis machine guns and 10,000 rounds of ammunition.' },
  { type: 'callout', label: 'The twist', text: 'The emus scattered into small groups whenever the guns opened up, and could outrun the trucks. After weeks of effort the operation was withdrawn.' },
  { type: 'text', text: "Meredith later compared the birds to tanks for how much damage they could take. The 'war' became a lasting joke about how nature does not follow military plans." },
];

const history2: Block[] = [
  { type: 'text', text: 'In July 1518, a woman in Strasbourg began dancing in the street and did not stop for days. Within weeks, dozens of others had joined her.' },
  { type: 'callout', label: 'The twist', text: 'Authorities thought the cure was more dancing. They built a stage and hired musicians, which only drew more people in.' },
  { type: 'text', text: 'Historians still argue about the cause. Leading ideas include stress-induced mass hysteria after years of famine and disease.' },
];

const stocks = (n: number, title: string, body: Block[]): Card =>
  card({
    id: `stocks-${n}`,
    kind: 'stocks',
    course: 'stocks',
    title,
    hook: (body[0] as { text: string }).text.split('. ')[0] + '.',
    tag: `Lesson ${n} · ~${12 + n} min`,
    cta: 'Explain',
    blocks: [...body, { type: 'callout', label: 'Note', text: 'Education, not financial advice.' }],
  });

const watchPitch: Block[] = [
  { type: 'text', text: 'A linguist is asked to talk to visitors who communicate in a way nobody understands. The film is about how language shapes the way you think about time.' },
  { type: 'callout', label: 'Why you might like it', text: 'Quiet, thoughtful science fiction where the puzzle is understanding, not fighting.' },
];

/** A sample sudoku (made in code, like the real one) and a hand-clued mini crossword. */
const CLUES: Record<string, string> = {
  SLAB: 'Thick, flat piece of stone',
  HOME: 'Where the heart is',
  OVEN: 'Pizza ___',
  TEND: 'Look after, as a garden',
  SHOT: 'Espresso serving',
  LOVE: 'Zero, in tennis',
  AMEN: 'Last word of a prayer',
  BEND: 'Curve, as a river does',
};
function puzzleCards(day: string): Card[] {
  const s = makeSudoku(day, levelFor(day));
  const grid = 'SLABHOMEOVENTEND';
  return [
    card({ id: `puzzle-sudoku-${day}`, kind: 'puzzle', title: 'Sudoku', hook: `${s.level} · ${[...s.givens].filter((c) => c === '0').length} squares to fill.`, tag: `Sudoku · ${s.level}`, cta: 'Play', blocks: [{ type: 'sudoku', givens: s.givens, solution: s.solution, level: s.level }] }),
    card({ id: `puzzle-crossword-${day}`, kind: 'puzzle', title: 'Mini crossword', hook: '4 across, 4 down.', tag: 'Crossword · 4×4', cta: 'Play', blocks: [{ type: 'crossword', size: 4, grid, clues: numberGrid(4, grid).map((e) => ({ ...e, clue: CLUES[e.answer] })) }] }),
  ];
}

/** Card ids are content identities, so news ids include the day (lessons repeat their id when carried). */
export function freshCards(day: string): Card[] {
  return [
    ...newsCards(day),
    card({ id: 'code-1', kind: 'code', course: 'code', title: 'What a computer actually does with your code', hook: 'Programs are recipes. The computer is a very fast, very literal cook.', tag: 'Lesson 1 · ~7 min', cta: 'Explain', blocks: coding1 }),
    card({ id: 'code-2', kind: 'code', course: 'code', title: 'Teaching a program to choose', hook: 'One word, if, lets a program react to the world.', tag: 'Lesson 2 · ~8 min', cta: 'Explain', blocks: coding2 }),
    card({ id: 'history-emu', kind: 'history', course: 'history', title: 'The Great Emu War', hook: 'Soldiers with machine guns were sent to fight a flock of birds. The birds won.', tag: 'Australia · 1932', cta: 'Explain', blocks: history1 }),
    card({ id: 'history-dance', kind: 'history', course: 'history', title: 'The summer a city could not stop dancing', hook: 'Hundreds danced for weeks. The cure made it worse.', tag: 'Strasbourg · 1518', cta: 'Explain', blocks: history2 }),
    card({
      id: 'chess-drill-4',
      kind: 'chess',
      course: 'chess',
      title: 'Read this move: Nf3',
      hook: 'Every move is a piece letter plus a square.',
      tag: 'Notation · drill 4',
      cta: 'Start drill',
      preview: { fen: 'rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 1 1' },
      blocks: [
        { type: 'text', text: 'In chess notation, capital letters are pieces: K king, Q queen, R rook, B bishop, N knight. Pawns have no letter.' },
        { type: 'chessBoard', fen: 'rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 1 1', highlight: ['g1', 'f3'], caption: 'After 1. Nf3, the knight jumped from g1 to f3.' },
        { type: 'quiz', question: 'Why is the knight N and not K?', options: ['K is already the king', 'N is for "night"', 'It is random', 'Knights have no letter'], answer: 0, explain: 'K belongs to the king, so the knight takes its second letter, N.' },
      ],
    }),
    stocks(1, 'What you really own when you buy a share', [
      { type: 'text', text: 'A share is a tiny slice of a real company. You own a piece of its profits, its debts and its future.' },
      { type: 'callout', label: 'Analogy', text: 'A pizza shop cut into 1,000 slices. Buy 10 and you own 1% of the shop, including its oven and its loan.' },
      { type: 'chart', kind: 'line', title: 'A made-up share price over 12 months', points: [40, 42, 39, 45, 47, 44, 50, 53, 51, 56, 58, 61], caption: 'Price moves daily, but over years it tends to follow how much the business earns.' },
    ]),
    stocks(2, 'Revenue is not profit', [
      { type: 'text', text: 'Revenue is all the money coming in. Profit is what is left after every bill is paid.' },
      { type: 'chart', kind: 'bar', title: 'Where $100 of revenue goes (example)', points: [100, 60, 25, 15], labels: ['Revenue', 'Costs', 'Wages', 'Profit'] },
      { type: 'quiz', question: 'A shop sells $500 and spends $450. What is the profit?', options: ['$500', '$450', '$50', '$950'], answer: 2, explain: 'Profit = revenue minus costs: 500 − 450 = 50.' },
    ]),
    stocks(3, 'What a P/E ratio is really telling you', [
      { type: 'text', text: 'The price-to-earnings ratio compares a share price to the profit per share. It answers: how many years of today’s profit am I paying for?' },
      { type: 'code', code: 'P/E = share price ÷ earnings per share\n    = $60 ÷ $3\n    = 20' },
      { type: 'callout', label: 'Careful', text: 'A high P/E is not "expensive" by itself. It often means people expect profits to grow.' },
    ]),
    card({
      id: 'italian-a1-1',
      kind: 'italian',
      course: 'italian',
      title: 'Saying hello',
      hook: '3 new words, 4 to review, then a short chat.',
      tag: 'A1 · ~8 min',
      cta: 'Start',
      preview: { phrase: { it: 'Ciao, come stai?', en: 'Hi, how are you?' } },
      blocks: [
        { type: 'italianPhrase', it: 'Ciao, come stai?', en: 'Hi, how are you?', note: 'Informal. Use with friends.' },
        { type: 'italianPhrase', it: 'Buongiorno', en: 'Good morning', note: 'Polite, until early afternoon.' },
        { type: 'italianPhrase', it: 'Sto bene, grazie', en: "I'm fine, thanks" },
        { type: 'quiz', question: 'Your new manager says hello at 9 AM. What do you say?', options: ['Ciao!', 'Buongiorno', 'Grazie', 'Come stai?'], answer: 1, explain: 'Buongiorno is the polite greeting for the morning. Ciao is for friends.' },
      ],
    }),
    card({
      id: 'watch-arrival',
      kind: 'watch',
      course: 'watch',
      title: 'Arrival',
      hook: 'One spoiler-free pitch, only if you want it.',
      tag: 'Film · 2016',
      cta: 'Interested?',
      blocks: watchPitch,
      watch: { stage: 'teaser' },
    }),
    ...puzzleCards(day),
  ];
}

/** A fake "yesterday" so carry-over and the watch follow-up show up on first launch. */
export function seedYesterday(day: string): DayFeed {
  return {
    day,
    builtAt: new Date().toISOString(),
    cards: [
      card({
        id: 'chess-drill-3',
        kind: 'chess',
        course: 'chess',
        title: 'Where does Bg4 go?',
        hook: 'Find the square, then say the move out loud.',
        tag: 'Notation · drill 3',
        cta: 'Start drill',
        status: 'skip',
        openedAt: new Date(Date.now() - 86400000).toISOString(),
        preview: { fen: '4k3/8/8/8/8/8/8/3BK3 w - - 0 1' },
        chat: [
          { id: '00000000-0000-4000-8000-000000000001', role: 'user', text: 'Why is it Bg4 and not Bd1g4?', at: new Date(Date.now() - 86000000).toISOString() },
          { id: '00000000-0000-4000-8000-000000000002', role: 'assistant', text: 'Only one white bishop can reach g4, so the starting square is not needed. You add it only when two pieces of the same kind could go there.', at: new Date(Date.now() - 85900000).toISOString() },
        ],
        blocks: [
          { type: 'text', text: 'Files are the letters a to h, left to right from White’s side. Ranks are the numbers 1 to 8, bottom to top.' },
          { type: 'chessBoard', fen: '4k3/8/8/8/8/8/8/3BK3 w - - 0 1', highlight: ['d1'], caption: 'The white bishop is on d1.' },
          { type: 'quiz', question: 'Bg4 moves the bishop to which square?', options: ['Column g, row 4', 'Column 4, row g', 'Four squares forward', 'The g-pawn'], answer: 0, explain: 'The letter is the file (column), the number is the rank (row): g4.' },
        ],
      }),
      card({
        id: 'watch-before-sunrise',
        kind: 'watch',
        course: 'watch',
        title: 'Before Sunrise',
        hook: '',
        tag: 'Film · 1995',
        cta: 'Interested?',
        status: 'done',
        blocks: [],
        watch: { stage: 'decided', willWatch: true },
      }),
    ],
  };
}

/** Placeholder news from the sample day ("[Top US story — …]"). */
const isPlaceholder = (c: Card) => /^\[.*\]$/.test(c.title);

/**
 * Removes sample cards a device saved before this fix: placeholders anywhere, and sample
 * ids on days the app built itself (a Sync-built day can share an id, e.g. a carried drill).
 */
export function stripSamples(feeds: Record<string, DayFeed>): Record<string, DayFeed> {
  const out: Record<string, DayFeed> = {};
  for (const [d, f] of Object.entries(feeds)) {
    const sample = f.source === 'sync' ? new Set<string>() : new Set([...freshCards(d), ...seedYesterday(d).cards].map((c) => c.id));
    const cards = f.cards.filter((c) => !isPlaceholder(c) && !sample.has(c.id));
    if (cards.length === f.cards.length) out[d] = f;
    else if (cards.length || f.source === 'sync') out[d] = { ...f, cards };
  }
  return out;
}
