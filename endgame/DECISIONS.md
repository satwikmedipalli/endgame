# Decisions

Short log of choices and why. Newest at the bottom of each section.

## Architecture
- **No Anthropic API, ever.** All AI work runs through headless Claude Code (`claude -p`) on the Mac, billed to the Max plan. The model call will sit behind one interface in `worker/` so it could be swapped later.
- **Supabase is the shared memory** (cards, lessons, chats, course notes). The phone reads it; the Mac worker writes it. Arrives in milestone 2.
- **Manual Sync, not a cron.** Sync pre-writes every lesson, deep dive, story and pitch, so the phone works with the Mac off. In-app chat needs the Mac awake.
- **Mac off → "Discuss in Claude"** through a custom connector (MCP server on Supabase), one Claude project per course.
- **Weekly Stockfish analysis stays in a GitHub Action.** It needs no Claude.
- **No $99 Apple Developer Program.** Free Apple ID sideload, refreshed by AltStore; OTA updates via EAS Update.

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
- **Chess pieces are Unicode glyphs for now.** They render a little small on web; swap for SVG pieces in the chess milestone.
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

