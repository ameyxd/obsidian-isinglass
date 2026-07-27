// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------
// Glass themes fail in predictable ways: unbounded backdrop-filter (paint cost,
// scroll jank on iOS), !important sprayed to win specificity fights (breaks
// user snippets, and the gallery guidelines discourage it), and CSS that grows
// without anyone noticing.
//
// For reference, measured across 30 installed themes:
//   backdrop-filter  Border 76, Blue Topaz 25
//   !important       Blue Topaz 948, Pink Topaz 458, Border 185
//   theme.css size   Fancy-a-Story 12 MB, Primary 1.6 MB, Blue Topaz 1.2 MB
//
// These limits are deliberately tight enough to force a conversation whenever
// one is about to be crossed.
// ---------------------------------------------------------------------------

import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = join(root, 'theme.css');
const css = readFileSync(file, 'utf8');

const count = (re) => (css.match(re) ?? []).length;

const budgets = [
  {
    name: 'backdrop-filter rules',
    // `backdrop-filter: none` disables an effect (the a11y fallbacks); only
    // rules that actually apply a filter carry paint cost.
    // Lookahead before consuming whitespace — `:\s*(?!none)` lets the engine
    // backtrack the \s* and match anyway.
    actual: count(/(?<!-webkit-)backdrop-filter\s*:(?!\s*none)/g),
    max: 12,
    note: 'blur belongs on L4 floating layers only, never on scrolled surfaces',
  },
  {
    name: '!important',
    actual: count(/!important/g),
    max: 20,
    note: 'prefer specificity or variable overrides; user snippets must still win',
  },
  {
    name: 'theme.css size (KB)',
    actual: +(statSync(file).size / 1024).toFixed(1),
    max: 150,
    note: 'ship a theme, not a payload',
  },
];

let failed = false;
console.log('budgets');
for (const b of budgets) {
  const ok = b.actual <= b.max;
  if (!ok) failed = true;
  const pct = Math.round((b.actual / b.max) * 100);
  console.log(
    `  ${ok ? 'ok  ' : 'OVER'} ${String(b.actual).padStart(6)} / ${b.max}  (${pct}%)  ${b.name}`
  );
  if (!ok) console.log(`       ${b.note}`);
}

if (failed) {
  console.error('\nbudget: over limit');
  process.exit(1);
}
console.log('\nbudget: within limits');
