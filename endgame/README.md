# Endgame

A feed that ends. Each day is a fixed set of cards (news, coding, markets, history, chess, Italian, one thing to watch). Every card is DONE or Skip, and when they're all cleared the app tells you to close your phone.

Personal, single-user app. No ads, no infinite scroll, no paid API: all AI work runs on your Claude Max plan through Claude Code on your Mac.

## Status

| Milestone | What | State |
|---|---|---|
| 1 | App with dummy data: feed, DONE/Skip, carry-over, lesson screen, done screen, auto theme, tests | ✅ |
| 2 | Supabase: tables, login, row-level security, local-first sync | ✅ |
| 3 | Mac worker + Sync + news pipeline + in-app chat | ✅ |
| 4 | Lesson engine (syllabi, course memory), coding + stocks | ✅ |
| 5 | History + watch recommendations, taste profile | ✅ |
| 6 | Chess (chess.js, Chess.com games, Stockfish Action) | ✅ (the weekly Action runs once the repo is on GitHub) |
| 7 | Italian (spaced repetition, pronunciation) | ✅ |
| 8 | "Discuss in Claude" connector | ✅ |
| 9 | Polish, Xcode, AltStore install on the iPhone | |

## Folders

```
app/       Expo app (iPhone + review website)
  src/app/         screens: feed, card/[id], progress, settings
  src/components/  feed card, header, lesson blocks, chess board, done screen
  src/lib/         pure logic + tests (feed rules, sun/theme, block validation)
  src/store/       local-first feed store, Supabase sync, auth, Mac helper link
  src/data/        sample day used until Sync exists
worker/    Mac helper: Sync (news pipeline), chat replies, via `claude -p` on the Max plan
design/    the approved design canvas files, for reference
supabase/  database migrations, auth config
DECISIONS.md
```

## Run it (review website)

You need Node 20+ (you have 22).

```bash
cd ~/endgame/endgame/app
npm install          # first time only
npx expo start --web
```

Press `w` if a browser doesn't open. For the phone feel, open Chrome DevTools → device toolbar → iPhone.

**On your iPhone (same Wi‑Fi):** run `npx expo start --web --host lan` and open the `http://192.168…:8081` address it prints in Safari.

### Things to try
1. Swipe up through the cards. The one you leave sinks back and dims.
2. Scroll past news without tapping: it counts as skipped. Or tap **Clear all news**.
3. Open the coding lesson (**Explain**), answer the quiz, type a question.
4. The chess drill **"Where does Bg4 go?"** is carried over from a fake yesterday, with its chat.
5. **Did you watch Before Sunrise?** is the follow-up from yesterday's "Yes".
6. **Arrival:** Interested → pitch → Will you watch?
7. Clear every card to see the end screen.
8. Settings → **Reset to sample day** to start over. **Rebuild today's feed** keeps what you marked.
9. The header icon cycles Auto (sunrise/sunset) → Light → Dark.

## Tests

```bash
cd ~/endgame/endgame/app
npm test             # feed rules, carry-over, idempotent rebuild, streak, sun/theme, lesson block validation
npm run typecheck
npx expo lint
```

The connector: `cd supabase/functions/mcp && deno test -A` (fake database, never your data).

## Supabase setup (one time)

1. Create a free project at supabase.com.
2. Copy `app/.env.example` to `app/.env.local` and fill in the project URL and the **publishable** key (Project Settings → API Keys).
3. From `~/endgame/endgame`:
   ```bash
   npx supabase login                                  # opens the browser
   npx supabase link --project-ref <your-project-ref>  # asks for the database password
   npx supabase db push                                # creates the tables + row-level security
   npx supabase config push                            # password login, no confirmation emails
   ```
4. Open the app → "First time? Create the account" → email + password (8+ characters).
5. Signups are already off in `supabase/config.toml` (`npx supabase config push` applies it), and the `single_user` migration blocks any second account at the database level. To create the account on a fresh project, temporarily set `enable_signup = true`, push, sign up, then set it back.

The free project pauses after 7 days without use; restore it from the dashboard with one click.

## Mac helper (worker)

Runs in the background on the Mac, signs in as you (so row-level security applies), and does the jobs the app asks for. Claude runs through `claude -p` on the Max plan; `ANTHROPIC_API_KEY` is stripped so it can never bill the API.

```bash
cd ~/endgame/endgame/worker
npm install
cp .env.example .env        # Supabase URL + publishable key + your email and password
npm run sync                # one Sync now (today before 5 PM Chicago, else tomorrow)
npm run sync -- 2026-10-24 --lessons-only   # refill lessons, keep that day's news (no news Claude calls)
npm run syllabus -- code    # print a syllabus (stocks too); add --regenerate to rewrite it, keeping finished topics
./install.sh                # background service (launchd), starts at login, restarts if it dies
./uninstall.sh              # remove it
tail -f logs/helper.log
npm test && npm run typecheck
```

- **Sync**: 22 RSS feeds → dedupe clusters → Haiku triage (merge duplicates, region, category, importance, drop opinion) → pick 13 US, 13 India, 12 world → Sonnet writes each card from the sources only. About 90 s.
- **Lessons (coding 2/day, stocks 3/day)**: Sync adds teaser cards for the next topics in each stored syllabus (no Claude call). The lesson is written only when you open the card: the app queues a `lesson` job, Sonnet writes it as JSON blocks (validated, one retry, then plain text) in about 15–30 s, and it's stored on the card so reopening never rewrites it. Mac off → the job waits and runs when it's on.
- **DONE on a lesson** queues a `condense` job: Haiku turns the lesson and your chat into 2–4 lines of course notes, and the topic is marked finished. Every later lesson and chat gets those notes, never the old chats. Sync also records any DONE the Mac missed. Skip doesn't advance the course, so a skipped topic comes back.
- **History (2/day)**: one small Haiku call picks teasers (heading + one line), checked in code against every teaser ever shown (the `seen` table), so nothing repeats even when reworded. One pick follows your taste (eras and themes you open and finish, minus what you skip), the other is random. Opening one writes the full story (Sonnet, about 25 s).
- **Movie / TV / book (1/day)**: rotates films, shows and books. Starts with no taste; learns from Not for me, Interested, Will you watch it? and your 1–10 ratings (plus the optional one-line comment). 30% of days ignore taste and explore. Interested writes the spoiler-free pitch (about 10 s). Yes → "Did you watch it?" the next day. Titles never repeat.
- A re-run Sync keeps the day's history and watch picks (no new Claude calls).
- **Chess (2/day)**: a full notation unit first (18 lessons, each with interactive tap-the-board drills made in code from positions in your own games), then lessons on the openings you actually play and reviews of your own Stockfish-found mistakes. Claude never supplies a position: boards are built from moves replayed with chess.js (illegal ones are dropped), drills come from real games, and evaluations come from Stockfish or the Lichess cloud.
- **Italian (1/day, 10 minutes)**: a syllabus from A1 to C1 (175 topics, written once). Opening the card writes the day: a review of the words due today (up to 15, scheduled with SM-2: Again / Hard / Good / Easy), then 4–7 new words or one grammar point, then a nudge to chat in Italian. Every Italian phrase has a speaker button (the phone's it-IT voice). A countdown shows the 10 minutes. DONE saves your review grades and adds the new words to your deck, due tomorrow. Progress shows your level, deck size and words due.

### Weekly chess analysis (GitHub Action)

`.github/workflows/chess-analysis.yml` runs every Monday (and on demand from the Actions tab): it imports your Chess.com games (`2atw1k`, public API, no key), runs Stockfish 19 over up to 150 new games, and saves the report the chess course is built from. It needs these repository secrets: `SUPABASE_URL`, `SUPABASE_KEY` (the publishable key), `ENDGAME_EMAIL`, `ENDGAME_PASSWORD`.

Run it locally instead with a Stockfish binary: `STOCKFISH_BIN=/path/to/stockfish npm run chess-analysis` (options: `CHESS_MONTHS`, `CHESS_ANALYZE_MAX`, `CHESS_DEPTH`, `CHESS_THREADS`).
- **Re-running Sync** on a started day keeps every card you touched (done, skipped, opened or chatted) and replaces the rest.
- **Chat**: the app writes your question and a `chat` job; the helper answers with Sonnet using the card's content and history, and the reply arrives through Realtime (a few seconds). Mac off → the question is saved and the app says so.
- The app shows "Mac connected" when the helper's heartbeat (every 30 s) is under 90 s old.

## Discuss in Claude (connector)

With the Mac off, the link under a card's chat opens the Claude app on that card. Claude reads it through a custom connector: a small MCP server on Supabase (`supabase/functions/mcp`). It has four tools: `today`, `get_card` (the lesson or story, the chat so far, your course notes), `get_course` (syllabus and notes) and `save_summary`, which adds one "From the Claude app: …" line to the card's chat. The app shows it, and the Mac's tutor reads it next time. The connector can't edit, delete or mark anything.

**Add it to Claude (once):** claude.ai → Settings → Connectors → Add custom connector → name `Endgame`, URL `https://<project>.supabase.co/functions/v1/mcp/<MCP_KEY>` (the key is in `worker/.env`). It works in the iPhone app too, since connectors follow your account.

**A project per course (optional):** in Claude, make projects "Endgame · Coding", "Endgame · Stock market", "Endgame · Chess", "Endgame · Italian" (and News, History, Watch if you like), with these instructions:

> This project is for my Endgame <course> cards. At the start of a chat, open the card I name with the Endgame connector (get_card; call today if I don't give an id) and follow its "How to discuss it" section. When we wrap up, call save_summary once.

Then put each project's link in `CLAUDE_PROJECTS` in `app/src/lib/discuss.ts`. With a project, the link opens it and copies the prompt for you to paste; without one, it opens a new chat with the prompt filled in. The prompt starts with "Endgame · <card title>", so Claude usually names the chat after the card.

**Deploy / change the key:**

```bash
cd ~/endgame/endgame
npx supabase secrets set --env-file <file with ENDGAME_EMAIL, ENDGAME_PASSWORD, MCP_KEY>
npx supabase functions deploy mcp --use-api
```

To change the key (if the link ever leaks), put a new `MCP_KEY` in `worker/.env` (`openssl rand -base64 36`), set it again, and update the URL in Claude.

## Secrets

- `app/.env.local` holds the Supabase URL and publishable key. It's git-ignored. The publishable key is designed to ship in apps; row-level security is what protects the data.
- The secret / service-role key never goes in the app or in git. The Mac helper doesn't need it: it logs in as you with the publishable key, from `worker/.env` (git-ignored, chmod 600).
- The connector's key (`MCP_KEY`), email and password are Supabase function secrets, copied from `worker/.env`. The connector signs in as you, so row-level security still applies.
- There is no Anthropic API key anywhere, by design.
