#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

/**
 * Small wrapper used by npm scripts to run local Vite from node_modules.
 */
const root = path.resolve(__dirname, '..');
const viteBin = path.join(
  root,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'vite.cmd' : 'vite'
);

if (!fs.existsSync(viteBin)) {
  console.error('vite not found; run npm install first');
  process.exit(1);
}

const viteProc = spawn(viteBin, {
  stdio: 'inherit',
});

viteProc.on('exit', (code) => {
  process.exit(code ?? 0);
});
