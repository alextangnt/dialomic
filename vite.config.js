import { defineConfig } from 'vite';
import { resolve } from 'node:path';

/**
 * Build landing, player runtime, and visual editor as separate HTML entrypoints.
 */
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        player: resolve(__dirname, 'player.html'),
        visualEditor: resolve(__dirname, 'visual-editor.html'),
      },
    },
  },
});
