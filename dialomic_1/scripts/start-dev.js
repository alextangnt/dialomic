#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync, spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'public', 'story.html');
const out = path.join(root, 'public', 'story.with-messaging.html');
const addScript = path.join(__dirname, 'add-messaging-script.js');

const addResult = spawnSync(process.execPath, [addScript, src, out], {
  stdio: 'inherit',
});
if (addResult.status !== 0) {
  process.exit(addResult.status || 1);
}

const viteBin = path.join(
  root,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'vite.cmd' : 'vite'
);

function cleanup() {
  if (fs.existsSync(out)) {
    try {
      fs.unlinkSync(out);
    } catch (err) {
      console.error(`Failed to remove ${out}: ${err.message}`);
    }
  }
}

process.on('exit', cleanup);
process.on('SIGINT', () => {
  cleanup();
  process.exit(0);
});
process.on('SIGTERM', () => {
  cleanup();
  process.exit(0);
});

const viteProc = spawn(viteBin, {
  stdio: 'inherit',
});

viteProc.on('exit', (code) => {
  cleanup();
  process.exit(code ?? 0);
});
