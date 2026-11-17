// Copies the freshly built Endgame.app into /Applications, replacing the old one.
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';

const built = 'release/mac-arm64/Endgame.app';
const dest = '/Applications/Endgame.app';
if (!existsSync(built)) throw new Error(`${built} not found; run npm run dist first`);
execFileSync('osascript', ['-e', 'if application "Endgame" is running then tell application "Endgame" to quit']);
rmSync(dest, { recursive: true, force: true });
// ditto keeps the bundle's symlinks and code signature intact.
execFileSync('ditto', [built, dest]);
console.log(`Installed ${dest}. Open it from Spotlight or Launchpad.`);
