---
name: straps-preflight
description: Connect Claude Code to a Figma library and build the local Design System cache — a Token Map, Component Registry, and Code Connect map under .straps/ — so every later edit can be validated. Run this FIRST whenever a session starts working with Figma, when the user shares a Figma file/URL, when starting a new UI feature, or when tokens/components feel out of date. Trigger phrases: "let's start", "set up the design system", "sync Figma", a pasted figma.com URL.
---

# Straps Preflight — establish the rails

You are the entry gate. Nothing else in Straps works until the Design System is cached
and verified. Be fast and parallel; produce machine-readable artifacts, not prose.

## When to run
- First Figma-related action of a session, or a pasted `figma.com` URL.
- `.straps/tokens.json` / `registry.json` are empty, stale (`_source.syncedAt` old), or the
  user changed the Figma library.
- The user says "let's start", "sync Figma", "set up the design system".

## Step 0 — make sure the project is initialized
If there is no `straps.config.json`, run:

```bash
node "$CLAUDE_PROJECT_DIR/scripts/straps.mjs" init
```

## Step 1 — three parallel reads from Figma (do these in ONE message)
Use the Figma MCP. Run the three independent reads concurrently:

1. **Tokens** → `get_variable_defs` for the file. Capture colors, spacing, radius, font families.
2. **Components** → `get_libraries`, then `search_design_system` to enumerate the component set
   (names, key variants/props, node ids).
3. **Code Connect** → `get_code_connect_map` to learn which Figma nodes already map to code.

Before calling `use_figma`/`generate_*`, read the `/figma-use` skill (mandatory per the Figma MCP).

## Step 2 — write the cache (these power the enforcement engine)
Overwrite the three artifacts. Keep keys exactly as the scanner expects:

`.straps/tokens.json`
```json
{
  "_source": { "figmaFileKey": "<key>", "syncedAt": "<ISO date>" },
  "colors": { "color/brand/primary": "#4f46e5", "...": "#hex" },
  "spacing": [0, 4, 8, 12, 16, 24, 32],
  "radius": [4, 8, 12, 9999],
  "fonts": ["Inter", "JetBrains Mono"]
}
```
- `colors`: token name → resolved hex. The scanner matches hardcoded hex against these.
- `spacing` / `radius`: the allowed numeric scales (px).
- `fonts`: every allowed font family.

`.straps/registry.json`
```json
{ "components": [
  { "name": "Button", "figma": "Button (12:340)",
    "import": "import { Button } from '@/components/Button'",
    "props": ["variant","size"], "variants": ["primary","secondary"] }
] }
```

`.straps/code-connect.json`
```json
{ "map": { "12:340": { "name": "Button", "source": "src/components/Button.tsx" } } }
```

Today's date is available to you — use it for `syncedAt`. Never invent token values; if a
variable is unresolved in Figma, leave it out and note it.

## Step 3 — verify the rails are live
```bash
node "$CLAUDE_PROJECT_DIR/scripts/straps.mjs" audit
```
This proves the engine can read the artifacts and reports current drift. Then confirm the
PostToolUse hook is wired in `.claude/settings.json` (it blocks off-spec writes automatically).

## Output to the user
A short Design System summary:
- token counts (N colors, spacing scale, radius scale, fonts)
- component registry (N components, which are Code-Connected vs. not)
- any gaps ("3 Figma nodes have no code mapping") and the next skill to run.

Then hand off: building UI → **straps-compose**; a reference image/URL → **straps-intake**.
