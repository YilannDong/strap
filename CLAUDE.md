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
It returns the offending line and the token/component to use. Fix the value or add a real token to
`.strap/tokens.json` (then sync to Figma) — do not weaken the rule to get past it.

## Commands
```bash
node scripts/strap.mjs audit            # validate the whole project against the DS
node scripts/strap.mjs validate <file>  # validate specific files
node scripts/strap.mjs tokens           # generate src/styles/tokens.css from tokens.json
node scripts/strap.mjs init             # scaffold config + .strap/ artifacts
```

## Figma MCP
Read the `/figma-use` skill before `use_figma`. Sync tokens with `get_variable_defs`, components
with `get_libraries` + `search_design_system`, and links with `get_code_connect_map`.
