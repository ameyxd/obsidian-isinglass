// ---------------------------------------------------------------------------
// Contrast verification
// ---------------------------------------------------------------------------
// A translucent surface has no fixed colour: what the user actually sees is the
// surface composited over whatever is behind it. In tier A that is the desktop
// wallpaper, which we cannot know. So every text/surface pair is checked
// against both extremes — a pure-black and a pure-white wallpaper — and must
// clear WCAG AA at both.
//
// Reads the compiled theme.css rather than the SCSS source, so what is verified
// is exactly what ships.
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'theme.css'), 'utf8');

// --- CSS parsing ------------------------------------------------------------

// Pulls the declaration body of every rule whose selector matches exactly, and
// concatenates them — the theme declares `body` several times, once per concern.
// Anchored per-line because sass's expanded output starts each rule at column 0;
// a `}`-based boundary would consume the brace and skip adjacent rules.
function block(selector) {
  const re = new RegExp(
    `^${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`,
    'gm'
  );
  let body = '';
  let m;
  while ((m = re.exec(css)) !== null) body += m[1] + '\n';
  if (!body) throw new Error(`contrast-check: no rule found for "${selector}"`);
  return body;
}

function decl(body, prop) {
  const m = body.match(new RegExp(`${prop}\\s*:\\s*([^;]+);`));
  return m ? m[1].trim() : null;
}

// `calc(1 - 0.2 * var(--ig-translucency))` -> 0.2
function transparencyAllowance(body, prop) {
  const v = decl(body, prop);
  if (!v) throw new Error(`contrast-check: missing ${prop}`);
  const m = v.match(/1\s*-\s*([\d.]+)\s*\*/);
  if (!m) throw new Error(`contrast-check: could not parse ${prop}: ${v}`);
  return parseFloat(m[1]);
}

// --- Colour maths -----------------------------------------------------------

function hslToRgb(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

function parseHsl(str) {
  const m = str.match(/hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*\)/);
  if (!m) throw new Error(`contrast-check: cannot parse colour "${str}"`);
  return hslToRgb(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]));
}

// Source-over compositing of a translucent surface onto an opaque backdrop.
function composite(fg, alpha, bg) {
  return fg.map((c, i) => c * alpha + bg[i] * (1 - alpha));
}

function relativeLuminance([r, g, b]) {
  const f = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// --- Theme model ------------------------------------------------------------

const base = block('body');
const allowance = {
  l0: transparencyAllowance(base, '--ig-a-l0'),
  l1: transparencyAllowance(base, '--ig-a-l1'),
  l2: transparencyAllowance(base, '--ig-a-l2'),
  l4: transparencyAllowance(base, '--ig-a-l4'),
};

function readMode(name) {
  const b = block(`body.theme-${name}`);
  const h = parseFloat(decl(b, '--ig-h'));
  const s = parseFloat(decl(b, '--ig-s'));
  const surface = {};
  for (const lvl of ['l0', 'l1', 'l2', 'l3', 'l4']) {
    surface[lvl] = hslToRgb(h, s, parseFloat(decl(b, `--ig-${lvl}-l`)));
  }
  return {
    name,
    surface,
    text: {
      normal: parseHsl(decl(b, '--ig-text-normal')),
      muted: parseHsl(decl(b, '--ig-text-muted')),
      faint: parseHsl(decl(b, '--ig-text-faint')),
    },
  };
}

const WALLPAPER = { black: [0, 0, 0], white: [255, 255, 255] };

// Tier A composites over the unknowable wallpaper. Tiers B and C are opaque at
// the base levels, so their only translucent surface is L4, which composites
// over in-app content — bounded by the mode's own darkest and lightest surface.
const TIERS = [
  { id: 'A', translucency: 1, float: 1, backdrops: WALLPAPER },
  { id: 'B', translucency: 0, float: 1, backdrops: null },
  { id: 'C', translucency: 0, float: 0.7, backdrops: null },
];

// text token -> minimum ratio. Body and UI text must clear AA; `faint` is used
// only for decorative metadata and is held to the large-text threshold.
const REQUIRED = { normal: 4.5, muted: 4.5, faint: 3.0 };

// Which text tokens actually appear on which surfaces.
const PAIRS = [
  ['l0', ['muted', 'faint']],
  ['l1', ['normal', 'muted', 'faint']],
  ['l2', ['normal', 'muted', 'faint']],
  ['l3', ['normal', 'muted']],
  ['l4', ['normal', 'muted']],
];

// --- Run --------------------------------------------------------------------

const failures = [];
const rows = [];

for (const mode of [readMode('light'), readMode('dark')]) {
  for (const tier of TIERS) {
    const alpha = {
      l0: 1 - allowance.l0 * tier.translucency,
      l1: 1 - allowance.l1 * tier.translucency,
      l2: 1 - allowance.l2 * tier.translucency,
      l3: 1,
      l4: 1 - allowance.l4 * tier.float,
    };

    // Backdrops behind a translucent surface in this tier.
    //
    // Base surfaces (L0–L2) sit directly against the unknown wallpaper in tier
    // A, so they are checked against both extremes. Floating layers (L4) do
    // not: a modal or the command palette always appears *over* app content,
    // so its true backdrop is an already-composited base surface. Checking L4
    // against the bare wallpaper would model a case that cannot occur, and
    // would force its alpha needlessly high.
    const baseBackdrops =
      tier.backdrops ?? {
        'darkest in-app': mode.surface.l0,
        'lightest in-app': mode.surface.l2,
      };

    const composited = (lvl, bg) =>
      alpha[lvl] >= 0.999 ? mode.surface[lvl] : composite(mode.surface[lvl], alpha[lvl], bg);

    // What actually sits behind a floating layer, per possible backdrop.
    const floatBackdrops = {};
    for (const [bgName, bg] of Object.entries(baseBackdrops)) {
      for (const under of ['l0', 'l2']) {
        const label = bg ? `${under.toUpperCase()} over ${bgName}` : under.toUpperCase();
        floatBackdrops[label] = composited(under, bg);
      }
    }

    for (const [lvl, tokens] of PAIRS) {
      const a = alpha[lvl];
      const backdrops = lvl === 'l4' ? floatBackdrops : baseBackdrops;
      // An opaque surface has no backdrop dependency — check it once.
      const cases = a >= 0.999 ? { opaque: null } : backdrops;

      for (const [bgName, bg] of Object.entries(cases)) {
        const composed = bg ? composite(mode.surface[lvl], a, bg) : mode.surface[lvl];

        for (const token of tokens) {
          const ratio = contrast(mode.text[token], composed);
          const min = REQUIRED[token];
          const pass = ratio >= min;
          rows.push({
            mode: mode.name,
            tier: tier.id,
            surface: lvl.toUpperCase(),
            backdrop: bgName,
            token,
            ratio,
            min,
            pass,
          });
          if (!pass) {
            failures.push(
              `${mode.name}/tier ${tier.id}/${lvl.toUpperCase()} over ${bgName}: ` +
                `text-${token} is ${ratio.toFixed(2)}:1, needs ${min}:1`
            );
          }
        }
      }
    }
  }
}

// --- Report -----------------------------------------------------------------

const worst = [...rows].sort((a, b) => a.ratio - b.ratio).slice(0, 8);
console.log('contrast: tightest 8 pairs');
for (const r of worst) {
  const mark = r.pass ? 'ok  ' : 'FAIL';
  console.log(
    `  ${mark} ${r.ratio.toFixed(2).padStart(5)}:1 (min ${r.min})  ` +
      `${r.mode}/${r.tier}/${r.surface} over ${r.backdrop} — text-${r.token}`
  );
}

if (failures.length) {
  console.error(`\ncontrast: ${failures.length} of ${rows.length} pairs FAILED`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}

console.log(`\ncontrast: all ${rows.length} pairs pass WCAG AA`);
