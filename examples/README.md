# Examples

## `starter/` — the open demo design system

A small, **openly-licensed** design system (Inter font + a confident blue palette derived from
Tailwind-style values) used as the default for this repo. Safe to fork and ship.

```
starter/source/
├── design-tokens.json        # colors, type, spacing, radius, shadows, motion
└── components.starter.json   # a minimal component layer (button/input/card/badge)
```

Regenerate the Strap artifacts from it:

```bash
node ../../scripts/strap.mjs import examples/starter/source   # -> .strap/tokens.json + registry.json
node ../../scripts/strap.mjs tokens                           # -> src/styles/tokens.css
node ../../scripts/strap.mjs audit
```

## Bring your own design system

Drop your `design-tokens.json` (+ any `components.*.json`) into a folder Strap won't publish —
e.g. `private/my-ds/` (already gitignored) — and point the importer at it:

```bash
node scripts/strap.mjs import private/my-ds
node scripts/strap.mjs tokens
```

The importer accepts DTCG-style tokens with `{group.key}` aliases: it flattens colors
(including nested groups), derives the spacing/radius scales, collects font families, and builds
the component registry from every `components.*.json`.
