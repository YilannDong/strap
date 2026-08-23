# Strap — Design System rails (read me first)

This project uses **Strap** to keep AI-generated UI on the Design System. The rules below are
not suggestions — an automated QA hook (`scripts/strap.mjs check`, wired in
`.claude/settings.json`) runs after every edit and **blocks** writes that go off-spec.

## The four rails
1. **Preflight before building.** If `.strap/tokens.json` / `registry.json` are empty or stale,
   run the **strap-preflight** skill to sync from Figma before touching UI.
2. **Library-first (strap-compose).** Reuse components from `.strap/registry.json` as instances.
   Never re-declare a registry component locally. Layout with Auto Layout / flex, semantic names.
3. **Tokens, not literals (strap-bind).** Every color/font/spacing/radius must reference a token
   from `.strap/tokens.json` (CSS vars, `tokens.*`, Tailwind theme, or Figma Variables/Styles).
   No raw hex, `rgb()`, off-scale px, or off-system fonts.
4. **References → briefs (strap-intake).** Map screenshots/URLs to existing tokens + components
   first; don't pixel-copy. New tokens/components are explicit decisions, not defaults.

## When the hook blocks you
The hook is **deterministic** — it always catches the off-spec write and returns the offending line
plus the token/component to use. How you *resolve* it depends on whether there's a real decision:

- **A matching token/component already exists** (e.g. `#ffffff` → `white`, or the value maps to a
  known token) → just bind to it and re-apply. Don't ask — there's one right answer.
- **No matching token, OR the element looks like a new component** (a raw value with no token; or a
  hand-written element the duplicate radar flags) → this is a genuine design decision. **STOP and
  ask the user with AskUserQuestion before writing anything**, e.g.:
  - **A** — fold into the nearest existing token / reuse the existing component
  - **B** — add a new token to `.strap/tokens.json` / create a new component
  - **C** — (if it's a recurring pattern worth its own component) scaffold it: `strap scaffold <Name> --tokens …`

  When the decision stems from a **Figma design**, first **show the user the actual frame**
  (`get_screenshot` via the Figma MCP) so they decide with the visual in front of them, not blind.
  Wait for the user's pick, then apply it. **Never silently invent a new token, or auto-decide
  "fold in vs. create new" on the user's behalf** — that call is theirs.

Never weaken the rule to get past a block.

## Commands
```bash
node scripts/strap.mjs audit            # validate the whole project against the DS
node scripts/strap.mjs validate <file>  # validate specific files
node scripts/strap.mjs tokens           # generate src/styles/tokens.css from tokens.json
node scripts/strap.mjs figma-audit      # duplicate radar for the Figma canvas (run strap-figma-audit skill first)
node scripts/strap.mjs evaluate         # component-lifecycle radar: propose promotions + retirements
node scripts/strap.mjs scaffold <Name> --tokens <list>  # generate a token-bound starter component
node scripts/strap.mjs audit --html report.html         # same findings as a shareable visual report
node scripts/strap.mjs merge <frameId> --into "<Name>"  # plan a canvas merge (apply via strap-figma-merge)
node scripts/strap.mjs init             # scaffold config + .strap/ artifacts
```

## Figma MCP
Read the `/figma-use` skill before `use_figma`. Sync tokens with `get_variable_defs`, components
with `get_libraries` + `search_design_system`, and links with `get_code_connect_map`.
