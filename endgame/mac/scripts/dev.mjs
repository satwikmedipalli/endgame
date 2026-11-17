// npm run dev: the Vite dev server for the window, esbuild in watch mode for the main
// process, and Electron pointed at the dev server. Restart it after changing main-process code.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'vite';

const server = await createServer({ configFile: 'vite.config.ts' });
await server.listen();
const url = server.resolvedUrls.local[0];

const main = spawn(process.execPath, ['scripts/build-main.mjs', '--watch'], { stdio: 'inherit' });
await new Promise((r) => setTimeout(r, 1500));

const electron = createRequire(import.meta.url)('electron');
const app = spawn(electron, ['.'], { stdio: 'inherit', env: { ...process.env, VITE_DEV_URL: url } });
app.on('exit', () => {
  main.kill();
  server.close();
  process.exit(0);
});
