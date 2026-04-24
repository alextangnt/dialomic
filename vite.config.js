import { defineConfig } from 'vite';
import { resolve } from 'node:path';

/**
 * Build both runtime viewer and visual editor as separate HTML entrypoints.
 */
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        visualEditor: resolve(__dirname, 'visual-editor.html'),
      },
    },
  },
});
