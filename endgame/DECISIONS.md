# Decisions

Short log of choices and why. Newest at the bottom of each section.

## Architecture
- **No Anthropic API, ever.** All AI work runs through headless Claude Code (`claude -p`) on the Mac, billed to the Max plan. The model call will sit behind one interface in `worker/` so it could be swapped later.
- **Supabase is the shared memory** (cards, lessons, chats, course notes). The phone reads it; the Mac worker writes it. Arrives in milestone 2.
- **Manual Sync, not a cron.** Sync writes the news and adds teaser cards; lessons, stories and pitches are written only when you open a card (your choice, to save usage), so opening one needs the Mac on. Chat needs the Mac awake too.
- **Mac off → "Discuss in Claude"** through a custom connector (MCP server on Supabase), one Claude project per course.
- **Weekly Stockfish analysis stays in a GitHub Action.** It needs no Claude.
- **No $99 Apple Developer Program.** (Milestone 9 replaced the iPhone app with a Mac app, signed ad hoc and built on the Mac it runs on.)

## Milestone 1 (app + dummy data)
- **Expo SDK 58 + Expo Router + TypeScript.** One codebase for the iPhone app and the review website (Expo web).
- **Feed motion uses Reanimated scroll-driven styles**, not React state per frame, so the card under your finger never lags. Each page is exactly the scroller height and `pagingEnabled` snaps one card at a time. The card you leave pins, scales to about 0.9 and dims while the next slides over it, matching the approved canvas.
- **On the web the feed motion is CSS scroll-driven animation** (`feedMotion.ts`), the same technique as the canvas. It runs on the browser's compositor, so nothing runs in JavaScript per frame; the Reanimated version lagged on web. The pin is linear (the old card stays exactly put) and only the shrink is eased. Browsers without support fall back to Reanimated.
- **Long jumps are instant** (Clear all news, the end-page list); only neighbour moves animate. A 12-card smooth scroll looked like doomscrolling.
- **Storage is on-device (AsyncStorage) for now.** The store API (`mark`, `undo`, `opened`, `addChat`, `rebuild`…) stays the same when Supabase replaces it.
- **Day boundary is the Chicago calendar day.** Checked every minute and when the app returns to the foreground.
- **Building a day is idempotent.** An existing day is never rebuilt on launch. "Rebuild today's feed" re-runs the build but keeps each surviving card's status, chat and opened time.
- **Carry-over rule:** a non-news card that was opened but not marked DONE comes back the next day with its chat and a "Continued from yesterday" badge. It sits just before the fresh card of the same course. Cards never opened do not carry over (the course pointer simply doesn't advance; that's the worker's job).
- **Watch follow-up:** saying "Yes" to "Will you watch?" creates a "Did you watch …?" card the next day with a 1–10 rating.
- **Scrolling past a news card counts as Skip.** Lessons are never auto-skipped.
- **Lessons are typed blocks** (heading, text, code, callout, diagram, chart, chessBoard, quiz, italianPhrase). `parseBlocks` validates model output; `fallbackBlocks` turns raw text into paragraphs if validation still fails after a retry.
- **Every chess position goes through chess.js** before it can render. An invalid FEN shows a message instead of a board.
- **Auto theme** uses the NOAA sunrise/sunset formula for Richardson, TX (32.95, −96.73). Manual Light/Dark overrides it; tapping the header icon cycles Auto → Light → Dark.
- **Fonts:** Instrument Serif (headlines), Bricolage Grotesque (everything else), IBM Plex Mono (code only). No Inter Tight, Geist or Geist Mono; no monospaced uppercase labels.
- **Chat without the Mac** saves the question and says it will be answered once the helper connects (milestone 3).
- **Chess pieces are Unicode glyphs for now.** They render a little small on web; swap for SVG pieces in the chess milestone. (Done in milestone 6: the cburnett set.)
- **The done-screen "Replay" from the canvas became "Look back"**, which just hides the overlay so you can review today's cards. It returns on the next launch.

## Milestone 2 (Supabase)
- **Local-first sync.** The device copy is what the UI reads and writes, so every tap is instant and the app works offline. Signed in, changes push to Supabase about 1.5 s later; the server copy is merged on launch, on sign-in and whenever the app returns to the foreground.
- **Only changed rows are sent.** A JSON snapshot of what the server already has is kept on the device; a failed push leaves rows pending and they go on the next try.
- **Merge rule:** days and cards from either side survive; for a card on both sides the newer `updatedAt` wins; chat is a union by message id. Card order follows whichever copy of the day was built later (so the Mac's Sync will lead once it exists).
- **Card ids are content identities.** The same id on two days is the same lesson carried over, so chat is stored by card id, not by day. News ids include the day.
- **Login is email + password, with no emails sent.** The plan was a 6-digit email code, but the free Supabase tier can't customise auth emails without your own SMTP server. Password login needs no email at all (no rate limits, nothing in spam), and the session is stored on the device and refreshes itself, so you stay logged in. Email confirmation is off; signups are closed after the first account instead.
- **Single user, two locks.** Signups are off in Auth settings, and a database trigger on `auth.users` refuses any insert once one account exists (the settings toggle took a minute to apply, and a toggle can be flipped by mistake; the trigger can't). Every table also has row-level security (`user_id = auth.uid()`), so only that login can read or write.
- **Tables for later milestones are created now** (`courses`, `seen`, `ratings`, `jobs`) so the schema is reviewed once. `jobs` and `chat_messages` are in the Realtime publication for the Mac helper.
- **Without `.env.local` the app runs on-device only**, so the review website still works without an account.
- **Reset to sample day also deletes the server copy**, otherwise the next merge would restore it.

## Milestone 3 (Mac helper, Sync, news, chat)

- **The helper logs in as you instead of using the service-role key.** Same row-level security as the phone, and no all-powerful key on disk. The password sits in `worker/.env` (git-ignored, chmod 600).
- **Jobs go through the `jobs` table.** The app inserts; the helper hears it over Realtime and also polls every 20 s (Realtime misses events while the Mac sleeps). A job is claimed with `update … where status = 'queued'`, so it runs once. Jobs run one at a time, chat before Sync.
- **Sync targets today before 5 PM Chicago, tomorrow after**, so the evening "Prepare tomorrow" button builds the next day.
- **A Sync-built day replaces the phone's fallback day** (`days.source = 'sync'`), keeping status on cards both share. A re-run keeps whatever you touched.
- **News: Haiku triages, Sonnet writes.** Word-overlap clustering catches most duplicates cheaply; Haiku then merges the rest, fixes regions (a BBC story about India is India) and ranks importance. Sonnet writes only from the source summaries, says "Still unclear" when sources disagree, and lists who covered it. Stories too close to yesterday's are dropped.
- **Gotcha: `[auth.email] enable_signup = false` turns off email login entirely**, not just signups. Signups are closed with `[auth] enable_signup = false` plus the database trigger; the email provider must stay on.

## Milestone 4 (lesson engine: coding + stocks)

- **Lessons are written only when you open them**, to save Max plan usage, as the spec asked. The cost is that a lesson needs the Mac on the first time; after that it's stored on the card and works offline.
- **Syllabi are written once** (Sonnet, one call per course: 121 coding topics, 158 stocks topics) and stored in `courses`. Topic ids are `unit-nn`, card ids `code-1-03`, so a topic keeps its identity when carried or skipped.
- **"You are here" is the first unfinished topic**, computed from the syllabus, not a stored counter, so it can't drift if a carried lesson is finished out of order. (`courses.pointer` is still written for reading at a glance.)
- **Carried lessons fill their course's slots first**: 2 coding means 2 in total, including yesterday's in-progress one.
- **Course memory is one line per finished topic**, capped at the latest 80, and goes into every lesson and lesson chat for that course.
- **The DONE → notes job is sent by watching the feed**, so DONE from the feed card or the lesson screen both count. Sync re-checks the last 14 days in case a job was missed.
- **The schema the model sees is loose; the app's own `checkBlock` is the validator**, shared by the app and the Mac. Invalid → one retry with the errors → keep the valid blocks (if there are at least 3) → plain text.
- **New chart kind `candle`** (OHLC, validated low ≤ open/close ≤ high). Stocks lessons show "Education, not financial advice" under the lesson rather than in it.
- **Fix: the database now enforces "newer wins" for cards.** A trigger ignores an update whose `updated_at` is older than the stored row. Without it, the phone pushing its stale copy erased a lesson the Mac had just written (found while testing).
- **Fix: a re-run Sync now replaces the phone's untouched cards.** Before, merging two Sync builds of the same day kept both sides' cards.
- **The phone drops an untouched lesson it finished the day before** (the Mac can build tomorrow before you finish today).

## Milestone 5 (history + watch)

- **Teasers are picked at Sync, stories and pitches are written on tap**, the same rule as lessons. Sync adds two Haiku calls a day; a re-run reuses the day's picks.
- **No-repeat is enforced in code, not trusted to the model.** Every teaser shown goes into `seen`. Haiku gets the last 250 (history) / 300 (watch) titles to avoid, and every candidate is then checked against the full list by slug and by word overlap (≥ 0.75), so a reworded repeat is caught too.
- **Taste is a score per trait**, learned only from reactions: history uses era and theme (+2 done, +1 opened, −1 skipped unopened); watch uses type and genres (rating − 5 when rated, else +2 will watch, +1 interested, −2 Not for me, −1 skipped from the feed). Fixed era and theme lists keep the scores comparable.
- **Randomness on purpose:** of the 2 history picks, one is by taste and one random, and Haiku gets a random region and era nudge each day. Watch explores on 30% of days and rotates film / TV / book.
- **Ratings**: the app stores the rating and comment on the follow-up card; Sync copies them into `ratings` (with the comment and the title's details) for the record. Progress reads the cards directly so a rating shows at once.
- **Pitch "Why you might like it" uses your taste profile** once there is one.
- Card ids: `history-<slug>`, `watch-<film|tv|book>-<slug>`; the follow-up is `<id>-followup`.

## Milestone 6 (chess)

- **Weekly analysis runs as a GitHub Action** (your choice over the Mac): Stockfish 19 from the official release, depth 12, up to 150 new games a week, about 1 s per game. It signs in with your Supabase login from repository secrets, so row-level security applies. Locally it ran 210 games in about a minute.
- **Severity is the drop in winning chances** (Lichess's formula and thresholds: ≥10 inaccuracy, ≥20 mistake, ≥30 blunder), so a slip while still completely winning isn't counted as a blunder.
- **Bullet is left out** of analysis and the report; rapid, blitz and daily are studied. The report covers the last 90 days.
- **Claude never supplies a position.** In lessons it names a position we give it (P0, P1… from a validated line or a real game) plus moves; we replay them with chess.js and drop any board that fails. Drills are made in code from your own games. Opening lines in the syllabus are replayed when it's written, and a topic is dropped if its title or hook names a move that isn't in its line (this caught a real mismatch).
- **Evaluations come only from engines**: the weekly Stockfish run (review lessons) and the Lichess cloud evaluation (opening lessons, no token).
- **Lichess opening explorer is skipped** (your choice): it now needs a Lichess API token. Puzzles are left for later too.
- **Full notation course first** (your choice): 18 lessons with six drills each. Square drills sometimes flip the board to Black's side.
- **The syllabus is written once from the report**: notation, then openings you play (extra time on your worst-scoring lines), with a review of one of your real mistakes after every two opening lessons. Opening lessons use the latest report when they're written (your stats, where your games leave the line, your opening mistakes).
- **Openings over several days** use the normal carry-over: open a lesson and don't press DONE, and it comes back tomorrow with its chat.
- **Arrows and highlights are amber**, not the chess accent, which is too close to the lavender board.

## Milestone 7 (Italian)

- **Spaced repetition is SM-2 with four answers** (Again / Hard / Good / Easy, as in Anki), in `app/src/lib/srs.ts` and shared by the phone and the Mac. The phone only records your answers on the card; the Mac schedules the words when you press DONE, so a review you abandon doesn't count.
- **The deck is built from lessons.** Each new word or phrase Claude writes is marked `learn`; DONE adds those to the `vocab` table, due the next day. Example sentences aren't added. A word you already have keeps its schedule.
- **The review is written into the card when you open it** (up to 15 due words), so the 10 minutes hold: about 3 minutes of review, 5 of new material, 2 of chat.
- **The 10 minutes is a countdown, not a lock.** At zero it says to press DONE; nothing is hidden.
- **Pronunciation uses the phone's built-in Italian voice** (expo-speech, it-IT), with a written guide in each phrase's note. There's no speech grading.
- **Chat on an Italian card is in Italian**, with English in brackets and gentle corrections, using only words you've met.
- **After C1, a next language is left for later.** The course just finishes; adding a language means a new course id and syllabus.

## Milestone 8 (Discuss in Claude)
- **The connector is a hand-written MCP server** (Streamable HTTP, stateless JSON replies) in a Supabase Edge Function. Four tools, so no SDK or session store; the official MCP Inspector connects to it.
- **Access is a secret link, not OAuth.** A 48-character random key is the last part of the URL; anything else gets a plain 404. Supabase won't serve web pages, so a sign-in screen would have needed a separate website. The key can be changed at any time.
- **Inside, it signs in as me** (email and password as function secrets) instead of using the service-role key, so row-level security still guards every read and write.
- **It only reads, plus one kind of write:** `save_summary` appends a chat line. It can't edit cards, delete anything or mark DONE, so a leaked link can't damage anything.
- **The summary is an ordinary tutor chat line** ("From the Claude app: …"), so the app shows it through Realtime and the Mac's tutor and course notes see it with no new table.
- **An unwritten lesson is taught by Claude itself** from the title, hook and course goal and style, since the Mac (which writes lessons) is off.
- **The text of a card is shared** (`app/src/lib/cardText.ts`) by the Mac's chat and the connector. The deploy bundler can't follow the app's extensionless imports, so the connector imports only files with none.
- **Projects can't be opened with a prompt filled in**, so with a project link the prompt is copied to the clipboard; without one a new chat opens with it filled in. Claude names its own chats; starting the prompt with the card title makes it name them after the card most of the time.

## Milestone 9 (the Mac app)
- **The iPhone app is retired; Endgame is a Mac app.** The Expo project, the .ipa build script, AltStore and the launchd service are gone. Supabase stays, because the Claude connector and the weekly chess Action read and write it.
- **Electron, not a SwiftUI rewrite.** All the logic was already TypeScript, and it carries over unchanged (`shared/`, moved out of `app/src/lib`). The window is React for the DOM rather than React Native for Web, so it gets real inputs, keyboard handling and CSS transitions. Every dependency is bundled (Vite for the window, esbuild for the main process), so the packaged app needs no node_modules.
- **The helper runs inside the app.** The main process starts the same helper code that used to run under launchd (`worker/src/helper.ts`, now an exported `startHelper`). Jobs still go through the `jobs` table instead of a direct call, so a question asked from the window, the menu bar or another device all work the same way. Closing the window keeps the app (and the helper) in the menu bar; ⌘Q stops both.
- **One settings file for the window and the helper**: `~/Library/Application Support/Endgame/endgame.env`, chmod 600, imported from `worker/.env` on first launch. The window signs in with the same email and password, so there's no separate sign-in screen. Changing the settings restarts the app so the helper picks them up.
- **PATH comes from a login shell.** Apps opened from the Dock get a bare PATH, so `claude` wasn't found; the main process asks the login shell once and adds the usual install folders.
- **Newsprint, chosen from five layouts and four colour themes on the design canvas.** One ink on newsprint grey, rules instead of boxes, red only for the lead story. Light from sunrise to sunset, dark after, as before.
- **A front page instead of a swipe feed.** All of the day is visible at once: the lead (the first story still open), six top stories, more news in columns, then lessons, also-today and puzzles. Scrolling past news no longer counts as Skip; "Clear all news" does it on purpose.
- **Stories open as paper.** A sheet slides up over the front page with the next two pages stacked underneath; turning a page slides it off to the side. Only the current page and its neighbours are drawn. Done and Skip move to the next open card; when none are left the paper goes away and the end screen arrives.
- **The icon follows the sun too.** An italic E with a red full stop between newspaper rules: white by day, ink at night. The Dock icon is swapped at runtime (macOS allows only one icon in Finder, so that one is the day version).
- **Puzzles are a new card kind (`puzzle`).** The sudoku is made entirely in code: a random full grid, then symmetric pairs removed while the solution stays unique (checked by a solver). Same day, same puzzle; Easy early in the week, Hard at the weekend.
- **The crossword grid is filled in code, never by the model**, the same rule as chess positions. A small backtracking filler places everyday words (a hand-made list of ~2,200) into a 5×5 layout, or 4×4 if that fails; Haiku only writes the clues, and a clue that contains its answer is refused. Denser 5×5 layouts need a bigger word list than ours, so only the layouts that fill reliably are used. Answers from the last ~60 grids are kept out.
- **Puzzle progress is stored on the card** (`content.puzzle.entries`), so it syncs like everything else and survives quitting. Puzzles don't carry over to the next day.
- **One npm workspace** (`shared`, `worker`, `mac`) so `chess.js` and friends resolve for all three; the chess Action installs only the helper's packages (`npm ci -w worker`).

## Milestone 10 (the paged newspaper)
- **Changes go branch → pull request → merge after Satwik's OK** (written into CLAUDE.md). Merging to `main` ships the change through the self-updater.
- **The day is a newspaper you page through, not one long front page.** Page 1 is the front page (the top story, then the best from each other region, and an "Inside today" index); swiping turns to sections built from each story's category (`shared/paper.ts`): Politics & world, Business, Tech & science, Sports, and More news for anything else. Sections are by topic, not region, so an India business story is in Business. Five stories to a page; a long section continues on the next page.
- **Lessons, history, puzzles and the watch pick come as "A break" pages between the news**, three to a page and mixed by kind. Breaks go at section changes first, then between a long section's pages; only what's left goes on a back page. Stories on the front page aren't repeated inside.
- **Reading order follows the paper.** Next and Done in a story's sheet go to the next story in page order, and closing the sheet returns to the page that story is on.
- **Salmon by day, Sepia at night**, picked from seven themes on the design canvas. Newsprint's near-black night was too harsh; Sepia keeps the paper feeling at night (dark brown, parchment type, amber accent).
