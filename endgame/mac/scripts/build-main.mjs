// Bundles the Electron main process (which runs the helper inside it) and the preload script.
// Everything is bundled, so the packaged app needs no node_modules.
import { build, context } from 'esbuild';

const watch = process.argv.includes('--watch');
const common = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  external: ['electron'],
  sourcemap: true,
  logLevel: 'info',
  // The helper's ESM files use import.meta only in the chess CLI; give it a harmless value.
  define: { 'import.meta.url': '"file:///endgame-main"' },
};
const jobs = [
  { ...common, entryPoints: ['src/main/main.ts'], outfile: 'dist/main.cjs' },
  { ...common, entryPoints: ['src/preload.ts'], outfile: 'dist/preload.cjs', sourcemap: false },
];

if (watch) {
  for (const j of jobs) await (await context(j)).watch();
} else {
  await Promise.all(jobs.map((j) => build(j)));
}
