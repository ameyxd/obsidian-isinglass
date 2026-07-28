'use strict';
// Two jobs, both about REAL window behaviour the theme's CSS cannot reach:
//
// 1. Appearance sync: the OS material follows the WINDOW appearance, not
//    Obsidian's theme. Pin nativeTheme to the current mode so they never
//    fight (the mismatch made each mode unreadable in turn).
//
// 2. Real transparency: Obsidian's window is created without per-pixel
//    transparency (upstream regression since 1.8.9), so vibrancy renders a
//    static wash and CSS alpha can never reveal the desktop. The one
//    mechanism that still works is WHOLE-WINDOW opacity (window-server
//    compositing, macOS + Windows). The theme publishes --ig-window-opacity;
//    this plugin applies it. Everything fades together — text included —
//    which is the honest physics of real see-through today.
const { Plugin } = require('obsidian');

const MIN_OPACITY = 0.8; // below this, text legibility collapses

module.exports = class IsinglassCompanion extends Plugin {
  async onload() {
    this.sync();
    this.registerEvent(this.app.workspace.on('css-change', () => this.sync()));
  }

  win() {
    try {
      return require('@electron/remote')?.getCurrentWindow() ?? null;
    } catch (e) {
      return null;
    }
  }

  sync() {
    const w = this.win();
    if (!w) return;
    try {
      const nt = require('@electron/remote')?.nativeTheme;
      if (nt) {
        const want = document.body.classList.contains('theme-dark') ? 'dark' : 'light';
        if (nt.themeSource !== want) nt.themeSource = want;
      }
    } catch (e) {}
    try {
      // The OS "reduce transparency" preference wins over everything.
      const reduced = window.matchMedia('(prefers-reduced-transparency: reduce)').matches;
      const raw = parseFloat(
        getComputedStyle(document.body).getPropertyValue('--ig-window-opacity')
      );
      const target = reduced || Number.isNaN(raw) ? 1 : Math.min(1, Math.max(MIN_OPACITY, raw));
      if (w.getOpacity() !== target) w.setOpacity(target);
    } catch (e) {}
  }

  onunload() {
    const w = this.win();
    try {
      if (w) w.setOpacity(1);
      const nt = require('@electron/remote')?.nativeTheme;
      if (nt) nt.themeSource = 'system';
    } catch (e) {}
  }
};
