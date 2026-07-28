#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Restores real frosted vibrancy to Obsidian on macOS.
// ---------------------------------------------------------------------------
// Obsidian creates its window with backgroundColor:"#00000000" — alpha zero —
// but without `transparent: true`, and Electron ignores the alpha unless that
// flag is set at creation. Result (a regression since Obsidian 1.8.9,
// staff-reproduced, unfixed): the vibrancy material never samples what is
// behind the window and renders a static wash.
//
// This script rewrites that one option, IN PLACE and at IDENTICAL byte length,
// so the asar's internal offsets stay valid and no repacking is needed:
//
//     backgroundColor:"#00000000",   (28 bytes)
//  -> transparent:!0,opacity:1.00,   (28 bytes)
//
// With `transparent: true`, an absent backgroundColor defaults to transparent,
// the window becomes genuinely non-opaque, and NSVisualEffectView starts
// blurring the real content behind the window — true frosted glass.
//
// Safety:
//   - a full backup is written next to the asar before any byte is touched
//   - the patch only proceeds if the target string occurs EXACTLY once
//   - re-running on a patched file is a no-op (reports "already patched")
//   - revert:  node patch-macos-vibrancy.mjs --revert   (restores the backup)
//
// Caveats (accepted by the owner before first run):
//   - an Obsidian update replaces obsidian.asar; re-run this script after
//   - modifying the bundle breaks its code signature; macOS tolerates this
//     for already-installed apps, but a reinstall cleanly undoes everything
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';

const ASAR = '/Applications/Obsidian.app/Contents/Resources/obsidian.asar';
const BACKUP = ASAR + '.pre-isinglass';

const ORIGINAL = Buffer.from('backgroundColor:"#00000000",');
const PATCHED = Buffer.from('transparent:!0,opacity:1.00,');

if (ORIGINAL.length !== PATCHED.length) {
  console.error('internal error: replacement is not byte-identical in length');
  process.exit(2);
}

if (process.argv.includes('--revert')) {
  if (!existsSync(BACKUP)) {
    console.error(`no backup at ${BACKUP} — nothing to revert`);
    process.exit(1);
  }
  copyFileSync(BACKUP, ASAR);
  console.log('reverted: obsidian.asar restored from backup. Restart Obsidian.');
  process.exit(0);
}

const buf = readFileSync(ASAR);

if (buf.indexOf(PATCHED) !== -1) {
  console.log('already patched — nothing to do.');
  process.exit(0);
}

const first = buf.indexOf(ORIGINAL);
if (first === -1) {
  console.error(
    'target option string not found. Obsidian may have changed its window ' +
      'creation in an update; do not guess — inspect main.js inside the asar.'
  );
  process.exit(1);
}
if (buf.indexOf(ORIGINAL, first + 1) !== -1) {
  console.error('target string occurs more than once; refusing to patch blind.');
  process.exit(1);
}

if (!existsSync(BACKUP)) copyFileSync(ASAR, BACKUP);
PATCHED.copy(buf, first);
writeFileSync(ASAR, buf);
console.log(`patched at byte ${first}. Backup at ${BACKUP}. Restart Obsidian.`);
