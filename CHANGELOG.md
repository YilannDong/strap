# Changelog

All notable changes to Strap. Versions follow [SemVer](https://semver.org/).

## [0.3.0] — 2026-08

Findings became something you can *share* and *act on*, not just read in a terminal.

### Added

- **Visual drift report** — `strap audit --html report.html` renders the same findings as a
  self-contained page: grouped by rule, colour swatches on raw values, and a decision per finding
  that emits a block to paste back into Claude Code. `audit --html` folds in the Figma snapshot
  when one exists, so a single report covers both surfaces. Thumbnails are opt-in — the engine
  can't call Figma, so it inlines any PNGs the `strap-figma-audit` skill left in
  `.strap/figma-thumbs/`. Every finding is dismissable; a report you can't dismiss becomes noise.
  (`scripts/lib/html-report.mjs`)
- **Merge planning** — `strap merge <frameId> --into "<Component>"` turns "this raw frame is really
  the Card component" into an explicit, reviewable plan at `.strap/merge-plan.json`. Pure and
  offline like the rest of the engine: it decides *what* would happen and what it would **cost** —
  tokens the frame uses that the component doesn't are reported as lost, non-text children with
  nowhere to go are flagged, and a match under 60% is called out as weak.
  (`scripts/lib/merge.mjs`)
- **`strap-figma-merge` skill** — applies a merge plan through the Figma MCP. Screenshots the frame
  first, reads the component's real property names live (the registry knows tokens, not props),
  presents the prop mapping as a correctable guess, and asks with `AskUserQuestion` before writing.
  Merging deletes the frame, so confirmation is mandatory, not a formality.

### Fixed

- `figma-audit` read its snapshot path positionally, so `figma-audit --html out.html` treated
  `--html` as the snapshot and failed. Flags and their values are now skipped; the positional form
  still works.

### Docs

- README: the skills list said **4** and omitted `strap-figma-audit` — it's now **6**, and the
  phantom `strap-evaluate` skill reference is gone (`evaluate` is a command, not a skill).
- New **Human in the loop, by design** section: deterministic detection, human resolution — with
  the block-vs-warn split spelled out per rule.
- Corrected an overstatement: the intro said "off-spec writes are blocked before they land", which
  read as though *everything* blocks. Only `error` rules block (`rawHex`, `rawRgb`, `rawFont`,
  `unlinkedComponent`); the heuristic radars warn by design and the write lands.

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
