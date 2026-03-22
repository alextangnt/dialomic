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
const useStoryHtml =
  process.env.USE_STORY_HTML === '1' ||
  process.env.USE_STORY_HTML === 'true' ||
  process.env.USE_STORY_HTML === 'TRUE';

const tweeSrc = path.join(root, 'public', 'TweeStory.twee');
const storySrc = path.join(root, 'public', 'story.html');
const debugSrc = path.join(root, 'public', 'debug_story.with-messaging.html');
const out = path.join(root, 'public', 'tweestory.html');
const formatDir = path.join(root, 'formats');

if (!debug) {
  if (useStoryHtml) {
    try {
      fs.copyFileSync(storySrc, out);
    } catch (err) {
      console.error(`Failed to copy ${storySrc} to ${out}: ${err.message}`);
      process.exit(1);
    }
  } else {
    const tweegoArgs = [tweeSrc, '-o', out, '--format', 'sugarcube-2', '--format-dir', formatDir];
    const tweegoResult = spawnSync('tweego', tweegoArgs, {
      stdio: 'inherit',
    });
    if (tweegoResult.error && tweegoResult.error.code === 'ENOENT') {
      console.error('tweego not found in PATH; install it or set USE_STORY_HTML=1');
      process.exit(1);
    }
    if (tweegoResult.status !== 0) {
      process.exit(tweegoResult.status || 1);
    }
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
