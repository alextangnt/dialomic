import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { readdirSync, statSync } from 'node:fs';

/**
 * Build every root-level HTML page as a Vite entrypoint.
 * This keeps GitHub Pages deploys automatic when new top-level pages are added.
 */
function getHtmlEntrypoints() {
  const root = __dirname;
  const entries = {};
  for (const name of readdirSync(root)) {
    if (!name.endsWith('.html')) continue;
    const full = resolve(root, name);
    if (!statSync(full).isFile()) continue;
    const key = name.replace(/\.html$/i, '');
    entries[key] = full;
  }
  return entries;
}

export default defineConfig({
  base: process.env.VITE_BASE || '/',
  build: {
    rollupOptions: {
      input: getHtmlEntrypoints(),
    },
  },
});
