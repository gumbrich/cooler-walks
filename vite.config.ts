import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// @ts-expect-error Node build helper is shared with release checks.
import { publicPageHtml } from './scripts/lib/release-config.mjs';
export default defineConfig({
  // The route worker imports this CommonJS dependency outside Vite's entry scan.
  // Prebundle it before the first page so discovery does not reload an active trip.
  optimizeDeps: { include: ['suncalc'] },
  plugins: [
    react(),
    {
      name: 'cooler-public-pages',
      transformIndexHtml: (html, context) => publicPageHtml(html, context.filename),
    },
  ],
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: 'index.html',
        privacy: 'privacy/index.html',
        support: 'support/index.html',
        german: 'de/index.html',
        privacyDe: 'de/privacy/index.html',
        supportDe: 'de/support/index.html',
      },
    },
  },
  server: { port: 5173, strictPort: true },
});
