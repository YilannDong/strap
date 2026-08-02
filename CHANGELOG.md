# Changelog

All notable changes to Strap. Versions follow [SemVer](https://semver.org/).

## [0.2.0] — 2026-07

Design-system rails grew from "block off-spec values" to "watch the component library over time."

### Added

- **Duplicate radar (code)** — a `warn`-only `duplicateComponent` rule that flags a hand-written
  look-alike whose token footprint matches a registry component but was never named/imported as one
  (the `<div>`-that's-really-a-`Card` case). Scans four surfaces: CSS/SCSS rules, styled-components /
  `css``` templates, inline `style={{}}`, and `className` / Tailwind utilities (gated to
  DS-defined tokens). Shared match core in `scripts/lib/fingerprint.mjs`.
- **Figma duplicate radar** — `strap figma-audit` + the `strap-figma-audit` skill. Walks the canvas
  via the Figma MCP (`get_metadata` + `get_design_context`) and flags raw frames that are really a
  library component (`figmaDuplicateComponent`) and clusters of near-identical frames
  (`figmaDuplicateFrame`). MCP-driven — no Figma plugin.
- **Component lifecycle** — `strap evaluate`: advisory radar proposing **promotions** (a recurring
  pattern that isn't a component yet) and **retirements** (a barely-used component). Includes
  git-dated recency + a rolling "uses in the last N months" window, `--since <ref>` to scope to what
  shipped, `--md` output, a GitHub Action that runs on every PR / weekly and posts a **sticky PR
  comment**, and `strap scaffold <Name> --tokens …` to turn an approved promotion into a token-bound
  starter component (new files only — never edits call-sites or deletes).
- **Config**: new rules `duplicateComponent`, `figmaDuplicateComponent`, `figmaDuplicateFrame`
  (default `warn`); an `evaluate` block (`promoteMin`, `retireMax`, `minFootprint`, `windowMonths`).

### Fixed

- CI (`ci.yml`) now runs the full test suite via `npm test` — previously it hard-coded two files and
  silently skipped the figma + evaluate tests.
- `evaluate` retirement triggers on **low usage only** — a stable, well-used but long-untouched
  component is no longer falsely flagged (low recent *activity* ≠ low *usage*).

### Design principles held

- Every radar is advisory (`warn`): Strap **surfaces and proposes; the human decides**. The one
  "act" step (`scaffold`) is deliberately narrow — it never rewrites call-sites or removes code.

## [0.1.0]

- Enforcement engine: `validate` / `audit` / blocking `check` hook, tested + CI on Node 18/20/22.
- Token + component import from a DTCG-style design system (`strap import`); CSS-var codegen
  (`strap tokens`).
- Code → Figma via the MCP, with the token set bound as Figma Variables.
