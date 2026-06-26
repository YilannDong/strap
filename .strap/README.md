# .strap/ — the Design System cache

These artifacts are the single source of truth the Strap engine validates against. They are
**generated** — by `strap import` (from a DTCG-style source) or `strap-preflight` (from Figma)
— and consumed by the scanner + the blocking PostToolUse hook.

| File | Built by | Used for |
|---|---|---|
| `tokens.json` | `strap import` / `get_variable_defs` | match hardcoded colors/px/fonts → tokens |
| `registry.json` | `strap import` / `search_design_system` | library-first component reuse (Tier 3) |
| `code-connect.json` | `get_code_connect_map` | keep Figma nodes ↔ code linked |
| `config.schema.json` | — | JSON schema for `strap.config.json` |
| `briefs/` | strap-intake | saved Design Briefs from references |

`tokens.json` and `registry.json` are committed and generated from `examples/starter` so the repo
audits clean out of the box. **`source/` is gitignored** — put your own (or proprietary) design
system there or under `private/`, then regenerate:

```bash
node scripts/strap.mjs import examples/starter/source   # or: import private/my-ds
node scripts/strap.mjs tokens
```

Keep the generated artifacts committed — they make Design System compliance reviewable in PRs.
