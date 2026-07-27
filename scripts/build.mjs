// Compiles src/theme.scss -> theme.css at the repo root.
// theme.css is committed: the community gallery loads it directly, so it must
// always be in sync with src/.

import * as sass from 'sass';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const entry = join(root, 'src', 'theme.scss');
const out = join(root, 'theme.css');

function compile() {
  const result = sass.compile(entry, {
    style: 'expanded',
    // Obsidian loads theme.css directly; a source map would just be a dead
    // reference in the user's vault.
    sourceMap: false,
  });
  writeFileSync(out, result.css + '\n');
  const kb = (Buffer.byteLength(result.css) / 1024).toFixed(1);
  console.log(`built theme.css (${kb} KB)`);
}

if (process.argv.includes('--watch')) {
  const { watch } = await import('node:fs');
  compile();
  watch(join(root, 'src'), { recursive: true }, () => {
    try {
      compile();
    } catch (err) {
      console.error(err.message);
    }
  });
  console.log('watching src/');
} else {
  compile();
}
