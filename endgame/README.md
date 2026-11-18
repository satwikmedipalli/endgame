# Endgame

A paper that ends. Each day is one front page with a fixed set of cards (news, coding, markets, history, chess, Italian, one thing to watch, a sudoku and a mini crossword). Every card is DONE or Skip, and when they're all cleared the app tells you to close the laptop.

Personal, single-user Mac app. No ads, no infinite scroll, no paid API: all AI work runs on your Claude plan through Claude Code on the same Mac.

## Status

| Milestone | What | State |
|---|---|---|
| 1 | App with dummy data: feed, DONE/Skip, carry-over, lesson screen, done screen, auto theme, tests | ✅ |
| 2 | Supabase: tables, login, row-level security, local-first sync | ✅ |
| 3 | Mac helper + Sync + news pipeline + in-app chat | ✅ |
| 4 | Lesson engine (syllabi, course memory), coding + stocks | ✅ |
| 5 | History + watch recommendations, taste profile | ✅ |
| 6 | Chess (chess.js, Chess.com games, Stockfish Action) | ✅ |
| 7 | Italian (spaced repetition, pronunciation) | ✅ |
| 8 | "Discuss in Claude" connector | ✅ |
| 9 | Mac app: helper inside the app, paper sheets, sudoku + mini crossword, self-update | ✅ (the iPhone app is retired) |
| 10 | Paged newspaper: sections you swipe through, breaks with lessons and puzzles; Salmon and Sepia themes | ✅ |

## Folders

```
mac/       The Mac app (Electron)
  src/main/        main process: window, menu bar item, Dock icon, settings, runs the helper
  src/preload.ts   the small API the window gets
  src/renderer/    the window (React): the paged newspaper, paper sheets, lessons, puzzles, progress, settings
  assets/          day and night Dock icons
  build/           app icon (and the script that drew it)
shared/    pure logic + tests, used by the app, the helper and the connector
           (feed rules, the paper's pages and sections, sync/merge, sun/theme, lesson blocks,
           spaced repetition, sudoku, crossword)
worker/    the helper: Sync (news pipeline), lessons, chat replies, via `claude -p`
supabase/  database migrations, auth config, the MCP connector
design/    the original design canvas files, for reference
DECISIONS.md
```

It's one npm workspace (`shared`, `worker`, `mac`), so a single `npm install` at `endgame/` sets up everything.

## Install the app

You need Node 22+ and Claude Code (`claude`) signed in on this Mac.

First time on this Mac (stops the old launchd helper, switches git to the Command Line Tools, offers to delete Xcode, installs, tests, pushes the puzzles migration, builds and installs):

```bash
zsh ~/endgame/endgame/mac/scripts/setup-mac.sh
```

After that, to update:

```bash
cd ~/endgame/endgame
git pull && npm install    # after pulling changes
npm run install-app        # builds Endgame.app and copies it to /Applications
```

Open Endgame from Spotlight or Launchpad. On first launch it reads your old helper settings from `worker/.env` if they're there; otherwise it asks for the Supabase project URL, the publishable key, and your email and password. They're saved in `~/Library/Application Support/Endgame/endgame.env` (chmod 600), and both the window and the helper sign in with them. Change them any time in Settings.

- **While developing:** `npm run app` opens it with live reload for the window (restart it after changing `src/main`).
- **Closing the window** keeps Endgame in the menu bar ("12 left", then ✓), so lessons and chat still work. ⌘Q quits it, helper included.
- **Open at login** is a checkbox in Settings and in the menu bar item.
- **The helper's log:** Settings → "Open the full helper log", or `~/Library/Logs/Endgame/helper.log`.
- The app is signed ad hoc (no Apple Developer account needed). Because you build it on this Mac, Gatekeeper doesn't block it.

### Keys

| Where | Key | Does |
|---|---|---|
| Newspaper | → ← , two-finger swipe, the edge arrows or the section tabs | Turn the page |
| Newspaper | Click, or Return | Open a story (Return opens the first one still open on the page) |
| Paper | ← → or `[` `]` | Next / previous story |
| Paper | D / S / U | Done / Skip / Undo |
| Paper | ⌘K | Ask about this card |
| Paper | Esc | Put the paper away |
| Anywhere | ⌘1 / ⌘2 / ⌘, | Front page / Progress / Settings |
| Anywhere | ⌘⇧S | Sync now |
| Sudoku | Arrows, 1–9, Delete | Move, fill, clear |
| Crossword | Type, arrows, Space, Tab | Fill, move, switch across/down, next clue |

## Tests

```bash
cd ~/endgame/endgame
npm test            # shared (vitest) and the helper (node:test)
npm run typecheck   # all three packages
```

The connector: `cd supabase/functions/mcp && deno test -A` (fake database, never your data).

## Supabase setup (one time)

1. Create a free project at supabase.com.
2. From `~/endgame/endgame`:
   ```bash
   npx supabase login                                  # opens the browser
   npx supabase link --project-ref <your-project-ref>  # asks for the database password
   npx supabase db push --remote                       # creates the tables + row-level security
   npx supabase config push                            # password login, no confirmation emails
   ```
3. Signups are off in `supabase/config.toml`, and the `single_user` migration blocks any second account at the database level. To create the account on a fresh project, temporarily set `enable_signup = true`, push, sign up once (for example from the Supabase dashboard → Authentication → Add user), then set it back.
4. Open Endgame and fill in the setup screen.

After pulling a change that adds a migration (the puzzles one, `20261117000001_puzzles.sql`, adds the `puzzle` card kind), run `npx supabase db push --remote` again.

The free project pauses after 7 days without use; restore it from the dashboard with one click.

## The helper

It runs inside the app, signs in as you (so row-level security applies), and does the jobs the window asks for. Claude runs through `claude -p` on your plan; `ANTHROPIC_API_KEY` is stripped so it can never bill the API.

**Switching Claude accounts:** the helper uses whatever account the `claude` CLI is logged into. To pin it to one account, run `claude setup-token` (log in with that account), add `CLAUDE_CODE_OAUTH_TOKEN=...` to `~/Library/Application Support/Endgame/endgame.env`, and reopen Endgame. Then re-add the connector (below) on that account.

From the command line (same code, without the app):

```bash
cd ~/endgame/endgame/worker
npm run sync                # one Sync now (today before 5 PM Chicago, else tomorrow); reads worker/.env
npm run sync -- 2026-10-24 --lessons-only   # refill lessons, keep that day's news (no news Claude calls)
npm run syllabus -- code    # print a syllabus (stocks too); add --regenerate to rewrite it, keeping finished topics
npm start                   # the helper on its own, in this terminal (don't run it while the app is open)
```

- **Sync**: 22 RSS feeds → dedupe clusters → Haiku triage (merge duplicates, region, category, importance, drop opinion) → pick 13 US, 13 India, 12 world → Sonnet writes each card from the sources only. About 90 s.
- **Lessons (coding 2/day, stocks 3/day)**: Sync adds teaser cards for the next topics in each stored syllabus (no Claude call). The lesson is written only when you open the card: the app queues a `lesson` job, Sonnet writes it as JSON blocks (validated, one retry, then plain text) in about 15–30 s, and it's stored on the card so reopening never rewrites it.
- **DONE on a lesson** queues a `condense` job: Haiku turns the lesson and your chat into 2–4 lines of course notes, and the topic is marked finished. Every later lesson and chat gets those notes, never the old chats. Sync also records any DONE the helper missed. Skip doesn't advance the course, so a skipped topic comes back.
- **History (2/day)**: one small Haiku call picks teasers, checked in code against every teaser ever shown (the `seen` table), so nothing repeats even when reworded. One pick follows your taste, the other is random. Opening one writes the full story (Sonnet, about 25 s).
- **Movie / TV / book (1/day)**: rotates films, shows and books, learns from Not for me, Interested, Will you watch it? and your 1–10 ratings. 30% of days ignore taste and explore. Titles never repeat.
- **Chess (2/day)**: a full notation unit first, then lessons on the openings you actually play and reviews of your own Stockfish-found mistakes. Claude never supplies a position.
- **Italian (1/day, 10 minutes)**: a syllabus from A1 to C1. Opening the card writes the day: a review of the words due today (SM-2), then 4–7 new words or one grammar point, then a nudge to chat in Italian. Every phrase has a speaker button (the Mac's Italian voice; add one in System Settings → Accessibility → Spoken Content if you don't have it).
- **Puzzles (2/day)**: a sudoku made entirely in code (exactly one solution; Easy Monday–Tuesday, Medium midweek, Hard at the weekend) and a mini crossword whose grid is filled in code from ~2,200 everyday words, with answers from the last ~60 grids kept out. One Haiku call writes the clues; if it fails, that day simply has no crossword. Your progress is saved on the card as you play. Puzzles don't carry over: a new pair comes each day.
- A re-run Sync keeps the day's history, watch and puzzle picks (no new Claude calls) and every card you touched.
- **Chat**: the window writes your question and a `chat` job; the helper answers with Sonnet using the card's content and history, and the reply arrives through Realtime (a few seconds).

### Weekly chess analysis (GitHub Action)

`.github/workflows/chess-analysis.yml` runs every Monday (and on demand from the Actions tab): it imports your Chess.com games (`2atw1k`, public API, no key), runs Stockfish 19 over up to 150 new games, and saves the report the chess course is built from. It needs these repository secrets: `SUPABASE_URL`, `SUPABASE_KEY` (the publishable key), `ENDGAME_EMAIL`, `ENDGAME_PASSWORD`.

Run it locally instead with a Stockfish binary: `STOCKFISH_BIN=/path/to/stockfish npm run chess-analysis -w worker` (options: `CHESS_MONTHS`, `CHESS_ANALYZE_MAX`, `CHESS_DEPTH`, `CHESS_THREADS`).

## Discuss in Claude (connector)

The link under a card's chat opens the Claude app on that card (handy away from the Mac). Claude reads it through a custom connector: a small MCP server on Supabase (`supabase/functions/mcp`). It has four tools: `today`, `get_card` (the lesson or story, the chat so far, your course notes), `get_course` (syllabus and notes) and `save_summary`, which adds one "From the Claude app: …" line to the card's chat. The app shows it, and the helper's tutor reads it next time. The connector can't edit, delete or mark anything.

**Add it to Claude (once):** claude.ai → Settings → Connectors → Add custom connector → name `Endgame`, URL `https://<project>.supabase.co/functions/v1/mcp/<MCP_KEY>` (the key is in your settings file). It works in every Claude app, since connectors follow your account.

**A project per course (optional):** in Claude, make projects "Endgame · Coding", "Endgame · Stock market", "Endgame · Chess", "Endgame · Italian" (and News, History, Watch, Puzzles if you like), with these instructions:

> This project is for my Endgame <course> cards. At the start of a chat, open the card I name with the Endgame connector (get_card; call today if I don't give an id) and follow its "How to discuss it" section. When we wrap up, call save_summary once.

Then put each project's link in `CLAUDE_PROJECTS` in `shared/discuss.ts`. With a project, the link opens it and copies the prompt for you to paste; without one, it opens a new chat with the prompt filled in.

**Deploy / change the key:**

```bash
cd ~/endgame/endgame
npx supabase secrets set --env-file <file with ENDGAME_EMAIL, ENDGAME_PASSWORD, MCP_KEY>
npx supabase functions deploy mcp --use-api
```

To change the key (if the link ever leaks), put a new `MCP_KEY` in the settings file (`openssl rand -base64 36`), set it again, and update the URL in Claude.

## Secrets

- `~/Library/Application Support/Endgame/endgame.env` holds the Supabase URL, the publishable key, your email and password (and optionally `CLAUDE_CODE_OAUTH_TOKEN` and `MCP_KEY`). It's outside the repo and chmod 600. The publishable key is designed to ship in apps; row-level security is what protects the data.
- `worker/.env` (git-ignored) is only for running the helper from the command line.
- The secret / service-role key never goes in the app or in git. The helper doesn't need it: it logs in as you with the publishable key.
- The connector's key (`MCP_KEY`), email and password are Supabase function secrets. The connector signs in as you, so row-level security still applies.
- There is no Anthropic API key anywhere, by design.
