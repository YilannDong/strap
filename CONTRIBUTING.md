# Contributing to Strap

Thanks for helping keep AI on the rails. Strap is intentionally **zero-dependency** — the
engine runs on plain Node (>=18) with no install step.

## Dev loop

```bash
node --test test/                  # run the unit + CLI tests
node scripts/strap.mjs audit      # validate the sample library against the DS
node scripts/strap.mjs tokens     # regenerate src/styles/tokens.css from tokens.json
```

CI (`.github/workflows/ci.yml`) runs the tests + audit on Node 18/20/22 and fails if
`src/styles/tokens.css` is stale. Run `node scripts/strap.mjs tokens` and commit before pushing.

## Where things live

| Path | What |
|---|---|
| `scripts/strap.mjs` | CLI entry (validate/audit/check/import/tokens) |
| `scripts/lib/scan.mjs` | the enforcement rules — **add new rules here** |
| `scripts/lib/config.mjs` | config + artifact loading |
| `scripts/lib/import.mjs` | DTCG-ish design-system importer |
| `.claude/skills/*` | the 4 skills |
| `.claude/settings.json` | the blocking PostToolUse hook |
| `examples/starter/` | the open demo DS (Inter, confident blue) |

## Adding a rule

1. Add the scan logic in `scanFile()` (`scripts/lib/scan.mjs`), gated on a config key.
2. Add its default severity to `DEFAULTS.rules` in `config.mjs` and the schema in
   `.strap/config.schema.json`.
3. Add a fixture-style test in `test/scan.test.mjs` asserting it fires (and does **not**
   false-positive on a bound value).
4. Keep it dependency-free.

## Never commit

Licensed fonts or proprietary token files. The `.gitignore` blocks `private/` and
`.strap/source/` — keep real/brand design systems there and regenerate artifacts with
`node scripts/strap.mjs import <dir>`.

## PRs

Small, focused, with a test. Describe the rule/behavior change and why it won't bounce
legitimate code.
