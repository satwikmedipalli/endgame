// Self-update, the Wellness way. A GitHub Action builds the app on every push and publishes
// it to the repo's `app-build` branch with a version.json. Endgame checks that file when it
// opens, every 3 hours, and when you press Update; a newer build is downloaded into the
// app's data folder (~/Library/Application Support/Endgame/app) and used from the next
// start. Your data, settings and login are never touched.
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

import type { UpdateState } from '../api';

const run = promisify(execFile);
const REPO = 'satwikmedipalli/endgame';
const BRANCH = 'app-build';
const VERSION_URL = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/version.json`;
const TARBALL_URL = `https://codeload.github.com/${REPO}/tar.gz/refs/heads/${BRANCH}`;

type Remote = { version: number; commit?: string; builtAt?: string; minShell?: number; message?: string };
export type Running = { shell: number; version: number; commit: string; builtAt: string; source: 'bundled' | 'downloaded'; downloadedDir: string };

export function running(): Running {
  const g = (globalThis as { __endgame?: Running }).__endgame;
  return g ?? { shell: 1, version: 0, commit: '', builtAt: '', source: 'bundled', downloadedDir: '' };
}

let state: UpdateState = { status: 'idle' };
let busy = false;
const listeners = new Set<(s: UpdateState) => void>();
const set = (s: UpdateState) => {
  state = s;
  for (const l of listeners) l(s);
};

export const updateState = () => ({ ...state, current: running() });
export const onUpdateState = (fn: (s: UpdateState) => void) => listeners.add(fn);

/** A build already downloaded but not started yet (survives quitting before a restart). */
function pending(): Remote | null {
  const dir = running().downloadedDir;
  try {
    const v = JSON.parse(readFileSync(join(dir, 'version.json'), 'utf8')) as Remote;
    return v.version > running().version ? v : null;
  } catch {
    return null;
  }
}

export async function checkForUpdate(log: (m: string) => void): Promise<UpdateState> {
  const me = running();
  if (busy) return updateState();
  const ready = pending();
  if (ready) {
    set({ status: 'ready', remote: ready.version, message: ready.message });
    return updateState();
  }
  busy = true;
  set({ status: 'checking' });
  try {
    const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(res.status === 404 ? 'no published build yet' : `GitHub said ${res.status}`);
    const remote = (await res.json()) as Remote;
    if (!remote.version || remote.version <= me.version) {
      set({ status: 'current', checkedAt: new Date().toISOString() });
      return updateState();
    }
    if ((remote.minShell ?? 0) > me.shell) {
      set({ status: 'needs-rebuild', remote: remote.version, message: remote.message });
      return updateState();
    }
    set({ status: 'downloading', remote: remote.version });
    await download(remote, me.downloadedDir);
    log(`update: downloaded build ${remote.version} (${remote.commit?.slice(0, 7) ?? ''}); ready after a restart`);
    set({ status: 'ready', remote: remote.version, message: remote.message });
  } catch (e) {
    const msg = (e as Error).message;
    log(`update check failed: ${msg}`);
    set({ status: 'error', error: msg });
  } finally {
    busy = false;
  }
  return updateState();
}

async function download(remote: Remote, dest: string) {
  // Unpack beside the final folder so the swap below is a plain rename on the same disk.
  const work = join(dirname(dest), `.update-${Date.now()}`);
  mkdirSync(work, { recursive: true });
  try {
    const res = await fetch(TARBALL_URL, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`download failed (${res.status})`);
    const tgz = join(work, 'build.tgz');
    writeFileSync(tgz, Buffer.from(await res.arrayBuffer()));
    const out = join(work, 'out');
    mkdirSync(out);
    // The tarball holds one folder (endgame-app-build/); macOS's tar unpacks it.
    await run('/usr/bin/tar', ['-xzf', tgz, '-C', out, '--strip-components', '1']);
    const got = JSON.parse(readFileSync(join(out, 'version.json'), 'utf8')) as Remote;
    if (got.version !== remote.version) throw new Error('the download was a different build than announced; try again in a minute');
    for (const f of ['main.cjs', 'preload.cjs', 'renderer/index.html']) if (!existsSync(join(out, f))) throw new Error(`the build is missing ${f}`);
    // Swap in one move, so a half-written download is never used.
    const old = `${dest}-old`;
    rmSync(old, { recursive: true, force: true });
    if (existsSync(dest)) renameSync(dest, old);
    renameSync(out, dest);
    rmSync(old, { recursive: true, force: true });
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
