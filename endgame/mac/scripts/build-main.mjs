// Bundles the Electron main process (which runs the helper inside it), the preload script
// and boot.cjs, and writes dist/version.json. Everything is bundled, so the packaged app
// needs no node_modules, and dist/ (minus boot.cjs) is exactly what an update replaces.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
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
  { ...common, entryPoints: ['src/main/boot.ts'], outfile: 'dist/boot.cjs', sourcemap: false },
];

// The build number is the commit count, so a build on this Mac and the one GitHub publishes
// for the same commit agree, and a newer commit is always a bigger number.
const git = (...a) => {
  try {
    return execFileSync('git', a, { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
};
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const version = {
  version: Number(git('rev-list', '--count', 'HEAD')) || 0,
  commit: git('rev-parse', 'HEAD'),
  message: git('log', '-1', '--format=%s'),
  builtAt: new Date().toISOString(),
  minShell: pkg.endgame?.shell ?? 1,
};

if (watch) {
  for (const j of jobs) await (await context(j)).watch();
} else {
  await Promise.all(jobs.map((j) => build(j)));
  writeFileSync('dist/version.json', JSON.stringify(version, null, 2) + '\n');
  console.log(`build ${version.version} (${version.commit.slice(0, 7)})`);
}
