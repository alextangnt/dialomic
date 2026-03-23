#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync, spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const addScript = path.join(__dirname, 'add-messaging-script.js');
const debug =
  process.env.DEBUG_STORY === '1' ||
  process.env.DEBUG_STORY === 'true' ||
  process.env.DEBUG_STORY === 'TRUE';
const storySrc = path.join(root, 'public', 'story.html');
const debugSrc = path.join(root, 'public', 'debug_story.with-messaging.html');
const out = path.join(root, 'public', 'story.with-messaging.html');

if (!debug) {
  try {
    fs.copyFileSync(storySrc, out);
  } catch (err) {
    console.error(`Failed to copy ${storySrc} to ${out}: ${err.message}`);
    process.exit(1);
  }

  const addResult = spawnSync(process.execPath, [addScript, out], {
    stdio: 'inherit',
  });
  if (addResult.status !== 0) {
    process.exit(addResult.status || 1);
  }
} else {
  try {
    if (!fs.existsSync(out)) {
      fs.copyFileSync(debugSrc, out);
    }
  } catch (err) {
    console.error(`Failed to prepare ${out} from ${debugSrc}: ${err.message}`);
    process.exit(1);
  }
}

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

function cleanup() {
  if (debug) return;
  if (!fs.existsSync(out)) return;
  try {
    fs.unlinkSync(out);
  } catch (err) {
    console.error(`Failed to remove ${out}: ${err.message}`);
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
