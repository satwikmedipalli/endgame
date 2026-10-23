# Endgame

A feed that ends. Each day is a fixed set of cards (news, coding, markets, history, chess, Italian, one thing to watch). Every card is DONE or Skip, and when they're all cleared the app tells you to close your phone.

Personal, single-user app. No ads, no infinite scroll, no paid API: all AI work runs on your Claude Max plan through Claude Code on your Mac.

## Status

| Milestone | What | State |
|---|---|---|
| 1 | App with dummy data: feed, DONE/Skip, carry-over, lesson screen, done screen, auto theme, tests | ✅ |
| 2 | Supabase: tables, login, row-level security, local-first sync | ✅ |
| 3 | Mac worker + Sync + news pipeline + in-app chat | next |
| 4 | Lesson engine (syllabi, course memory), coding + stocks | |
| 5 | History + watch recommendations, taste profile | |
| 6 | Chess (chess.js, Chess.com games, Stockfish Action) | |
| 7 | Italian (spaced repetition, pronunciation) | |
| 8 | "Discuss in Claude" connector | |
| 9 | Polish, Xcode, AltStore install on the iPhone | |

## Folders

```
app/       Expo app (iPhone + review website)
  src/app/         screens: feed, card/[id], progress, settings
  src/components/  feed card, header, lesson blocks, chess board, done screen
  src/lib/         pure logic + tests (feed rules, sun/theme, block validation)
  src/store/       on-device store (Supabase replaces it in milestone 2)
  src/data/        sample day used until Sync exists
design/    the approved design canvas files, for reference
supabase/  database migrations, auth config, email template
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

## Secrets

- `app/.env.local` holds the Supabase URL and publishable key. It's git-ignored. The publishable key is designed to ship in apps; row-level security is what protects the data.
- The secret / service-role key never goes in the app or in git. The Mac helper (milestone 3) will keep its own in a git-ignored file.
- There is no Anthropic API key anywhere, by design.
