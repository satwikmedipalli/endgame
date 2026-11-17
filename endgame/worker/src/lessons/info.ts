import type { CourseId } from '../../../shared/course.ts';

// What each course is for. Used once to write the syllabus and with every lesson.
export const COURSES: Record<CourseId, { name: string; goal: string; path: string; size: string; minutes: [number, number]; style: string }> = {
  code: {
    name: 'Coding',
    goal: 'Start from knowing nothing about coding and become good enough to build my own AI agents with my own code, and eventually build and run my own AI model.',
    path: `1. What programming is
2. Python basics: variables, types, conditions, loops, functions, data structures
3. Files, errors, modules, the terminal, git
4. APIs and JSON, then object-oriented programming
5. Data work with numpy and pandas
6. How LLMs work and how to call them, then prompting and tool use
7. Building agents: tool calls, loops, memory, retrieval (RAG), evaluation
8. Running open models locally, then fine-tuning, then the basics of training a small model`,
    size: 'about 120 topics across those 8 units',
    minutes: [5, 10],
    style: `- Explain every new idea with an everyday analogy before the jargon.
- Include at least one "diagram" block that traces, step by step, what the computer is doing: each row is one line of code (code), what happens (label) and the resulting value (value).
- Code is Python unless the topic is the terminal or git. Keep snippets short and runnable.
- End with exactly one "quiz" block that is a small exercise: "predict the output" or "fill in the blank", with the code in quiz.code, and a clear explanation of the answer.`,
  },
  chess: {
    name: 'Chess',
    goal: 'From knowing very little to around 2500: notation fluency first, then lessons built from my own Chess.com games.',
    path: '1. Notation\n2. My openings, with reviews of my own mistakes',
    size: 'notation (fixed) plus about 18 opening lessons and reviews of real mistakes',
    minutes: [5, 12],
    style: '- Never invent positions or moves; boards come from validated moves only.',
  },
  italian: {
    name: 'Italian',
    goal: 'Start as an absolute beginner and reach fluency (C1): understand, speak and read everyday and professional Italian.',
    path: `Use exactly these five units, titled exactly as written:
A1
A2
B1
B2
C1
Each topic is either a small set of new words around one situation (greetings, the café, numbers, directions, work…) or one grammar point, in a natural order for a beginner. Mix vocabulary and grammar topics.`,
    size: 'about 40 topics in A1, 40 in A2, 40 in B1, 30 in B2 and 30 in C1',
    minutes: [6, 7],
    style: `- The whole daily card must fit in 10 minutes including a word review and a short chat, so this new part takes about 5 minutes: 4–7 new words or one grammar point, never more.
- Use "italianPhrase" blocks for every Italian word or sentence (it, en, and a short note on usage or pronunciation). Set learn: true on each new word or phrase to keep; leave it off example sentences.
- Explain grammar in plain English with a tiny table-like set of italianPhrase examples, and a memory trick.
- Only use Italian the learner has met (see the notes) plus today's new items.
- End with one "quiz" block that checks today's items in context.`,
  },
  stocks: {
    name: 'Stock market',
    goal: 'Start from knowing nothing and fully understand fundamental analysis, then technical analysis, then quantitative trading: statistics, backtesting, factor models, risk and position sizing, and Python for quant work.',
    path: `1. What the stock market is and how it works (shares, exchanges, orders, indexes)
2. Fundamental analysis: financial statements, ratios, valuation, moats, reading a 10-K
3. Technical analysis: charts, candlesticks, trends, support and resistance, volume, indicators, and their limits
4. Quantitative trading: statistics for markets, Python for quant work, backtesting and its traps, factor models, risk and position sizing`,
    size: 'about 150 topics across those units',
    minutes: [10, 20],
    style: `- Explain every new idea with an everyday analogy before the jargon.
- Include at least one "chart" block. Use kind "candle" with OHLC candles for anything about price action or patterns; line or bar for trends and comparisons.
- Work at least one example with real numbers, step by step (a "code" block is fine for the arithmetic). Use a clearly labelled example company unless you are certain of a real company's figures.
- End with exactly one "quiz" block that checks the key idea.
- This is education. Never tell me to buy or sell anything. Do not add a disclaimer block; the app shows one.`,
  },
};
