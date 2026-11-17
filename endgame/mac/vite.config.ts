import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// The window's UI. Built into dist/renderer and loaded from disk by Electron (hence base './').
export default defineConfig({
  root: 'src/renderer',
  base: './',
  plugins: [react()],
  resolve: { alias: { '@shared': fileURLToPath(new URL('../shared', import.meta.url)) } },
  build: { outDir: fileURLToPath(new URL('dist/renderer', import.meta.url)), emptyOutDir: true, target: 'chrome130' },
  server: { port: 5199, strictPort: false },
});
