# Working on Endgame

## How changes land
1. Make a new branch for the change.
2. Open a pull request for it on GitHub.
3. Merge into `main` only after Satwik says it's OK. Never push straight to `main`.

Merging to `main` is what ships a change: the "App build" GitHub Action builds the Mac app
and publishes it to the `app-build` branch, and Endgame on the Mac offers "Update ready ·
Restart". A change that needs a new Endgame.app (Electron version, `mac/src/main/boot.ts`,
icons, Info.plist) must bump `endgame.shell` in `endgame/mac/package.json`; the app then asks
for `npm run install-app` once instead of downloading it.

## Before opening a pull request
From `endgame/`: `npm test` and `npm run typecheck`.

## Layout
- `endgame/mac`: the Mac app (Electron + React). The helper runs inside its main process.
- `endgame/shared`: pure logic and tests used by the app, the helper and the connector.
- `endgame/worker`: the helper (Sync, lessons, chat via `claude -p`).
- `endgame/supabase`: migrations and the MCP connector.
- `endgame/DECISIONS.md`: why things are the way they are. Add to it with each milestone.
