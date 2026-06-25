# Examples

## `starter/` — the open demo design system

A small, **openly-licensed** design system (Inter font + a fresh mint palette derived from
Tailwind-style values) used as the default for this repo. Safe to fork and ship.

```
starter/source/
├── design-tokens.json        # colors, type, spacing, radius, shadows, motion
└── components.starter.json   # a minimal component layer (button/input/card/badge)
```

Regenerate the Straps artifacts from it:

```bash
node ../../scripts/straps.mjs import examples/starter/source   # -> .straps/tokens.json + registry.json
node ../../scripts/straps.mjs tokens                           # -> src/styles/tokens.css
node ../../scripts/straps.mjs audit
```

## Bring your own design system

Drop your `design-tokens.json` (+ any `components.*.json`) into a folder Straps won't publish —
e.g. `private/my-ds/` (already gitignored) — and point the importer at it:

```bash
node scripts/straps.mjs import private/my-ds
node scripts/straps.mjs tokens
```

The importer accepts DTCG-style tokens with `{group.key}` aliases: it flattens colors
(including nested groups), derives the spacing/radius scales, collects font families, and builds
the component registry from every `components.*.json`.
