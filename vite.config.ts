import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import type { Plugin } from 'vite';

// Electron's file:// protocol doesn't support CORS, so crossorigin attributes
// on module scripts/stylesheets cause them to fail to load (white screen).
const removeCrossorigin = (): Plugin => ({
  name: 'remove-crossorigin',
  transformIndexHtml(html: string) {
    return html.replace(/ crossorigin/g, '');
  },
});

export default defineConfig({
  plugins: [react(), removeCrossorigin()],
  root: path.resolve(__dirname, 'src/renderer'),
  base: './',
  css: {
    postcss: {},
  },
  build: {
    outDir: path.resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  },
});
