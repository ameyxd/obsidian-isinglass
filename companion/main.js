'use strict';
// The macOS vibrancy material (and Windows Mica) follows the WINDOW's
// effective appearance, which normally follows the SYSTEM appearance — not
// Obsidian's theme. Running Obsidian light on a dark system therefore puts a
// wrong-polarity material behind every pane, and the Isinglass theme clamps
// itself opaque because no readable glass exists in that state.
//
// This plugin removes the mismatch at the source: it pins the window's
// nativeTheme to Obsidian's current mode, on load and on every theme change,
// so the material always agrees with the theme.
const { Plugin } = require('obsidian');

module.exports = class IsinglassCompanion extends Plugin {
  async onload() {
    this.sync();
    // css-change fires on light/dark toggles (and theme swaps).
    this.registerEvent(this.app.workspace.on('css-change', () => this.sync()));
  }

  sync() {
    try {
      const nt = require('@electron/remote')?.nativeTheme;
      if (!nt) return;
      const want = document.body.classList.contains('theme-dark') ? 'dark' : 'light';
      if (nt.themeSource !== want) nt.themeSource = want;
    } catch (e) {
      // No @electron/remote (mobile, future sandboxing): nothing to sync.
    }
  }

  onunload() {
    try {
      const nt = require('@electron/remote')?.nativeTheme;
      if (nt) nt.themeSource = 'system';
    } catch (e) {}
  }
};
