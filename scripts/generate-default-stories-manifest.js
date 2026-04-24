#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const storiesDir = path.join(root, 'public', 'defaultstories');
const manifestPath = path.join(storiesDir, 'index.json');

function toLabel(fileName) {
  const raw = String(fileName || '')
    .replace(/\.html$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  return raw
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function isStoryHtml(fileName) {
  const name = String(fileName || '');
  if (!/\.html$/i.test(name)) return false;
  if (/\.with-messaging\.html$/i.test(name)) return false;
  if (/^debug_/i.test(name)) return false;
  return true;
}

function compareStories(a, b) {
  const aTemplate = /template\.html$/i.test(a.file);
  const bTemplate = /template\.html$/i.test(b.file);
  if (aTemplate && !bTemplate) return -1;
  if (!aTemplate && bTemplate) return 1;
  return a.file.localeCompare(b.file, 'en', { sensitivity: 'base' });
}

function main() {
  if (!fs.existsSync(storiesDir)) {
    throw new Error(`Missing directory: ${storiesDir}`);
  }

  const stories = fs
    .readdirSync(storiesDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && isStoryHtml(entry.name))
    .map((entry) => ({ file: entry.name, label: toLabel(entry.name) }))
    .sort(compareStories)
    .map((entry) => ({
      label: entry.label || 'Story',
      url: `defaultstories/${entry.file}`,
    }));

  const payload = {
    generatedAt: new Date().toISOString(),
    stories,
  };

  fs.writeFileSync(manifestPath, JSON.stringify(payload, null, 2) + '\n');
  console.log(`Generated ${path.relative(root, manifestPath)} (${stories.length} stories)`);
}

main();
