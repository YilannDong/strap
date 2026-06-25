---
name: straps-bind
description: Keep every visual value bound to a design token — never hardcoded. Use for ANY color, font, spacing, or radius operation: writing CSS/Tailwind/styled-components, setting fills or typography in Figma, or theming. Maps raw values to the nearest token in the Token Map, binds Figma layers to Variables/Styles, and runs post-write QA so off-spec values are caught and corrected automatically.
---

# Straps Bind — tokens, not literals

Hardcoded `#4f46e5`, `rgba(…)`, `font-family: Arial`, `padding: 17px` are off-spec by
definition. Your job: resolve every value to a token before it lands, and verify after.

## Preconditions
`.straps/tokens.json` must be populated (run **straps-preflight** if not).

## Binding workflow
1. **Before writing**, for each value resolve it against `.straps/tokens.json`:
   - Color → find the token whose hex matches (or is nearest). Use the token, not the hex.
   - Spacing → snap to the `spacing` scale. If a needed step is missing, propose adding a token
     rather than using an off-scale px.
   - Font → must be in `fonts`. Otherwise it's not in the type system — stop and ask.
   - Radius → snap to the `radius` scale.
2. **In code**, reference tokens the project's way — CSS variables (`var(--color-brand-primary)`),
   a `tokens.*` object, Tailwind theme keys, etc. The scanner treats `var(...)`, `$...`,
   `tokens.*`, and `theme(...)` as already-bound.
3. **In Figma** (`use_figma`), bind fills/strokes/text to **Variables/Styles**, never paste a raw
   hex onto a layer. A layer with a detached value is the design equivalent of a hardcoded literal.

## Mapping table to keep handy
Pull the current tokens for reference:
```bash
node -e "const t=require('./.straps/tokens.json');console.log(JSON.stringify(t,null,2))"
```
Match observed hex to `colors`, px to `spacing`/`radius`, family to `fonts`.

## Post-write QA (this is the enforcement)
After any edit, the **PostToolUse hook** runs `straps check` automatically and **blocks** writes
that contain off-spec `error`-level values, returning the exact line + the token to use. You can
also run it yourself:
```bash
node "$CLAUDE_PROJECT_DIR/scripts/straps.mjs" validate <files>   # or: audit (whole project)
```
When the hook bounces an edit:
1. Read each violation — it names the literal and the suggested token.
2. Replace the literal with the token reference.
3. Re-apply the edit. Do not silence the rule to get past it; fix the value or add a real token
   to `.straps/tokens.json` (and sync it to Figma).

Severity is configured in `straps.config.json` (`rules`): `rawHex`/`rawRgb`/`rawFont` are errors
by default; `offScaleSpacing`/`offScaleRadius` are warnings until you tighten them.
