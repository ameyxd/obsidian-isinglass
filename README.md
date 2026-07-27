# Isinglass

A minimal, translucent theme for Obsidian. Light and dark, for macOS, Windows, and iOS.

*Isinglass* is a thin transparent sheet of mica.

> Under construction — not yet released.

## What makes it different

Obsidian's native translucency is **macOS-only**: the app sets the window background to
`#00000000` and applies an Electron `sidebar` vibrancy, then adds `.is-translucent` to the body —
all gated on `process.platform === "darwin"`. Windows users never even see the toggle.

So "translucent theme" means something different on each platform, and most glass themes only
really work on one. Isinglass renders one design language through three fidelity tiers:

| Tier | Where | How depth is made |
|---|---|---|
| **A** | macOS with translucency on | CSS alpha reveals the real desktop wallpaper through the system vibrancy layer |
| **B** | Windows, Linux, macOS with translucency off | Opaque surfaces separated by luminance steps and hairlines |
| **C** | iOS and Android | As B, plus touch sizing and safe-area insets |

Floating layers — modals, the command palette, suggestions, popovers — use `backdrop-filter` in
every tier, because there it blurs Obsidian's own content and reads as real glass everywhere.

## Built to stay legible

Translucency fights contrast, so contrast is verified rather than eyeballed. Every build
composites each text token over each surface at each tier's alpha, against **both a pure-black
and a pure-white wallpaper**, and asserts WCAG AA. The build fails otherwise.

That verification is what sets the design's limits: base-surface translucency is capped near
10–12%, because anything more cannot clear AA on an unknown wallpaper.

The theme also honours `prefers-reduced-transparency` and `prefers-reduced-motion`, and ships an
opaque high-contrast mode.

## Budgets

Enforced on every build:

| Budget | Limit |
|---|---|
| `backdrop-filter` rules | 12 |
| `!important` | 20 |
| `theme.css` size | 150 KB |

## Development

```bash
npm install
npm run build
```

`npm run build` compiles `src/theme.scss` to `theme.css`, then runs the contrast and budget
checks. Edit the SCSS modules, never `theme.css`.

```bash
npm run watch
```

## Licence

MIT
