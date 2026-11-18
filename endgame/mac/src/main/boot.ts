// The app's entry point, and the one piece that never updates itself (like Wellness's
// "shell"). Everything else, the window and the main process with the helper inside, is
// one bundle that can be replaced by a newer build downloaded from GitHub (updater.ts).
// Boot picks the newest bundle this shell can run and falls back to the one shipped
// inside Endgame.app if a download is missing or broken.
import { app } from 'electron';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The shell number (package.json → endgame.shell). Bump it when a change needs a new
 * Endgame.app: a new Electron, boot.ts itself, icons or Info.plist. Builds that need a newer
 * shell are not downloaded; the app says to run `npm run install-app` once instead.
 */
const SHELL: number = (() => {
  try {
    return JSON.parse(readFileSync(join(app.getAppPath(), 'package.json'), 'utf8')).endgame?.shell ?? 1;
  } catch {
    return 1;
  }
})();

type Version = { version: number; commit?: string; builtAt?: string; minShell?: number };
const read = (dir: string): Version | null => {
  try {
    return JSON.parse(readFileSync(join(dir, 'version.json'), 'utf8')) as Version;
  } catch {
    return null;
  }
};

const bundledDir = __dirname;
const downloadedDir = join(app.getPath('userData'), 'app');
const bundled = read(bundledDir) ?? { version: 0 };
const downloaded = read(downloadedDir);
const useDownloaded =
  !!downloaded && downloaded.version > bundled.version && (downloaded.minShell ?? 0) <= SHELL && existsSync(join(downloadedDir, 'main.cjs'));

function start(dir: string, v: Version, source: 'bundled' | 'downloaded') {
  (globalThis as Record<string, unknown>).__endgame = { shell: SHELL, version: v.version, commit: v.commit ?? '', builtAt: v.builtAt ?? '', source, downloadedDir };
  require(join(dir, 'main.cjs'));
}

if (useDownloaded) {
  try {
    start(downloadedDir, downloaded!, 'downloaded');
  } catch (e) {
    // A broken download never locks you out: drop it and run the copy inside the app.
    console.error('downloaded build failed to start, using the bundled one', e);
    rmSync(downloadedDir, { recursive: true, force: true });
    start(bundledDir, bundled, 'bundled');
  }
} else {
  start(bundledDir, bundled, 'bundled');
}
