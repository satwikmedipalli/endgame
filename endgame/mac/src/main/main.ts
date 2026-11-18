// Endgame for Mac: the window, the menu bar item, and the helper that used to run as a
// separate launchd service (Sync, lessons, chat replies through `claude -p`).
import { app, BrowserWindow, clipboard, ipcMain, Menu, nativeImage, nativeTheme, shell, Tray, type MenuItemConstructorOptions } from 'electron';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { startHelper, type Helper } from '../../../worker/src/helper.ts';
import type { Command, EndgameConfig, HelperState } from '../api';
import { Config } from './config';
import { findClaude, fixPath } from './shellPath';
import { checkForUpdate, onUpdateState, running, updateState } from './updater';

const DEV_URL = process.env.VITE_DEV_URL;
// This bundle's own folder: inside Endgame.app, or the downloaded update (see boot.ts).
const DIST = __dirname;
const asset = (name: string) => join(app.getAppPath(), 'assets', name);
const BG = { light: '#E8E8E3', dark: '#121212' } as const;

if (!app.requestSingleInstanceLock()) app.quit();

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let mode: 'light' | 'dark' = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
let progress = { left: 0, total: 0, finished: false };

// ---------- log ----------
const logDir = app.getPath('logs');
mkdirSync(logDir, { recursive: true });
const logFile = join(logDir, 'helper.log');
const recent: string[] = [];
function log(line: string) {
  recent.push(line);
  if (recent.length > 300) recent.shift();
  try {
    appendFileSync(logFile, line + '\n');
  } catch {}
}
// claude.ts and the helper's modules write to the console; keep that in the log too.
for (const level of ['log', 'warn', 'error'] as const) {
  const orig = console[level].bind(console);
  console[level] = (...args: unknown[]) => {
    orig(...args);
    log(args.map((a) => (a instanceof Error ? a.stack ?? a.message : typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
  };
}

// ---------- settings + helper ----------
fixPath();
const config = new Config(app.getPath('userData'));
config.apply();

let helper: Helper | null = null;
let helperState: HelperState = { state: 'off', claude: findClaude() };
function setHelperState(s: HelperState) {
  helperState = { ...s, claude: findClaude() };
  win?.webContents.send('helper:state', helperState);
  updateTray();
}

async function runHelper() {
  if (helper || !config.complete) return;
  setHelperState({ state: 'starting' });
  try {
    helper = await startHelper({ log });
    setHelperState({ state: 'running' });
  } catch (e) {
    const msg = (e as Error).message;
    log(`helper could not start: ${msg}`);
    setHelperState({ state: 'error', error: msg });
    // Usually offline at login; try again in a minute.
    setTimeout(runHelper, 60_000);
  }
}

// ---------- window ----------
function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 700,
    title: 'Endgame',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 20, y: 20 },
    backgroundColor: BG[mode],
    show: false,
    webPreferences: { preload: join(DIST, 'preload.cjs'), contextIsolation: true, sandbox: true, spellcheck: true },
  });
  win.once('ready-to-show', () => win?.show());
  // Links open in your browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (DEV_URL && url.startsWith(DEV_URL)) return;
    e.preventDefault();
    if (/^https?:/.test(url)) shell.openExternal(url);
  });
  // Closing the window keeps Endgame in the menu bar so the helper can keep working.
  win.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    win?.hide();
  });
  if (DEV_URL) win.loadURL(DEV_URL);
  else win.loadFile(join(DIST, 'renderer/index.html'));
}

function show(cmd?: Command) {
  if (!win) createWindow();
  win!.show();
  win!.focus();
  if (cmd) win!.webContents.send('command', cmd);
}

// ---------- menu bar ----------
function updateTray() {
  if (!tray) return;
  tray.setTitle(progress.total === 0 ? ' E.' : progress.finished ? ' ✓' : ` ${progress.left} left`);
  tray.setToolTip(progress.finished ? 'Endgame: done for today' : `Endgame: ${progress.left} of ${progress.total} cards left`);
  const helperLine =
    helperState.state === 'running'
      ? helper?.busy() ?? 'Helper ready'
      : helperState.state === 'starting'
        ? 'Helper starting…'
        : helperState.state === 'error'
          ? 'Helper offline, retrying'
          : 'Helper not set up';
  const up = updateState();
  const updateItem: MenuItemConstructorOptions =
    up.status === 'ready'
      ? { label: `Restart to update (build ${up.remote})`, click: restartToUpdate }
      : up.status === 'checking' || up.status === 'downloading'
        ? { label: up.status === 'checking' ? 'Checking for updates…' : 'Downloading update…', enabled: false }
        : { label: 'Check for updates', click: () => update(true) };
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Endgame', click: () => show('front') },
      updateItem,
      { label: 'Sync now', enabled: !!helper, click: () => helper?.requestSync().catch((e) => log(`sync request failed: ${e.message}`)) },
      { type: 'separator' },
      { label: helperLine, enabled: false },
      { label: 'Show helper log', click: () => shell.openPath(logFile) },
      { label: 'Open at login', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin, click: (i) => app.setLoginItemSettings({ openAtLogin: i.checked }) },
      { type: 'separator' },
      { label: 'Quit Endgame', role: 'quit' },
    ]),
  );
}

function setDockIcon() {
  const icon = nativeImage.createFromPath(asset(mode === 'dark' ? 'icon-night.png' : 'icon-day.png'));
  if (!icon.isEmpty()) app.dock?.setIcon(icon);
  win?.setBackgroundColor(BG[mode]);
}

function appMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'Endgame',
        submenu: [
          { role: 'about' },
          { label: 'Check for updates…', click: () => update(true).then(() => show('settings')) },
          { type: 'separator' },
          { label: 'Settings…', accelerator: 'Cmd+,', click: () => show('settings') },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
      { role: 'editMenu' },
      {
        label: 'Day',
        submenu: [
          { label: 'Front page', accelerator: 'Cmd+1', click: () => show('front') },
          { label: 'Progress', accelerator: 'Cmd+2', click: () => show('progress') },
          { type: 'separator' },
          { label: 'Sync now', accelerator: 'Cmd+Shift+S', click: () => show('sync') },
        ],
      },
      { role: 'viewMenu' },
      { role: 'windowMenu' },
    ]),
  );
}

// ---------- updates ----------
onUpdateState((s) => {
  win?.webContents.send('update:state', { ...s, current: running() });
  updateTray();
});
async function update(manual: boolean) {
  const s = await checkForUpdate(log);
  if (manual && s.status === 'ready') show();
  return s;
}
function restartToUpdate() {
  quitting = true;
  app.relaunch();
  app.exit(0);
}

// ---------- IPC ----------
ipcMain.handle('config:get', () => config.get());
ipcMain.handle('config:save', (_e, c: EndgameConfig) => {
  config.save(c);
  // The helper reads its settings once; a clean restart picks up the new ones.
  quitting = true;
  app.relaunch();
  app.exit(0);
});
ipcMain.handle('helper:state', () => ({ ...helperState, claude: findClaude() }));
ipcMain.handle('helper:log', () => recent.slice(-120));
ipcMain.on('helper:open-log', () => shell.openPath(logFile));
ipcMain.on('theme', (_e, m: 'light' | 'dark') => {
  if (m === mode) return;
  mode = m;
  setDockIcon();
});
ipcMain.on('progress', (_e, p: typeof progress) => {
  progress = p;
  updateTray();
});
ipcMain.on('open-external', (_e, url: string) => {
  if (/^https?:/.test(url)) shell.openExternal(url);
});
ipcMain.on('copy', (_e, text: string) => clipboard.writeText(text));
ipcMain.on('quit', () => app.quit());
ipcMain.handle('update:state', () => updateState());
ipcMain.handle('update:check', () => update(true));
ipcMain.on('update:restart', () => restartToUpdate());
ipcMain.handle('login-item:get', () => app.getLoginItemSettings().openAtLogin);
ipcMain.on('login-item:set', (_e, on: boolean) => {
  app.setLoginItemSettings({ openAtLogin: on });
  updateTray();
});

// ---------- lifecycle ----------
app.on('second-instance', () => show());
app.on('activate', () => show());
app.on('before-quit', () => {
  quitting = true;
});

app.whenReady().then(() => {
  const me = running();
  app.setAboutPanelOptions({ applicationName: 'Endgame', applicationVersion: `build ${me.version}`, version: me.commit.slice(0, 7), credits: 'A daily feed that actually ends.' });
  appMenu();
  tray = new Tray(nativeImage.createEmpty());
  updateTray();
  setDockIcon();
  createWindow();
  log(`Endgame build ${me.version} (${me.commit.slice(0, 7) || 'local'}, ${me.source}) started; claude: ${findClaude() ?? 'not found'}`);
  runHelper();
  // Like Wellness: look for a newer build shortly after opening, then every 3 hours.
  if (!DEV_URL) {
    setTimeout(() => update(false), 8_000);
    setInterval(() => update(false), 3 * 60 * 60 * 1000);
  }
  // Keep the menu bar line about the helper current.
  setInterval(updateTray, 15_000);
});
