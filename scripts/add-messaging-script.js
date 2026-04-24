#!/usr/bin/env node
const fs = require('fs');

/**
 * Inject public/messaging.js script tag into a Twine HTML file.
 * Usage: node scripts/add-messaging-script.js <input> [output]
 */
const args = process.argv.slice(2);
const snippet = '<script src="messaging.js"></script>';

if (args.length === 0 || args.length > 2) {
  console.error('Usage: node scripts/add-messaging-script.js <input> [output]');
  process.exit(1);
}
const inputPath = args[0];
const outputPath = args[1] || args[0];

let input;
try {
  input = fs.readFileSync(inputPath, 'utf8');
} catch (err) {
  console.error(`Failed to read ${inputPath}: ${err.message}`);
  process.exit(1);
}

const bodyCloseRe = /<\/body>/i;
let output = input;

if (!input.includes(snippet)) {
  if (bodyCloseRe.test(input)) {
    output = input.replace(bodyCloseRe, `${snippet}\n</body>`);
  } else {
    output = input + '\n' + snippet + '\n';
  }
}

try {
  fs.writeFileSync(outputPath, output, 'utf8');
  const action = outputPath === inputPath ? 'updated' : 'written';
  console.log(`${outputPath}: ${action}`);
} catch (err) {
  console.error(`Failed to write ${outputPath}: ${err.message}`);
  process.exit(1);
}
