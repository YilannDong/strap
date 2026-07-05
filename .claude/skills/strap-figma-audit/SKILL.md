---
name: strap-figma-audit
description: Duplicate radar for the Figma canvas — walk a Figma file via the MCP, fingerprint each frame's structure + token usage, and flag raw frames that are really a library component (never made an instance) or copy-pasted near-identical frames that should be one component. Run when the user wants to lint/dedupe a Figma file, asks "find duplicate frames", "is this already a component?", or after a design sprint. Trigger phrases: "audit the Figma", "find duplicate frames", "figma duplicate radar", a pasted figma.com URL + "duplicates".
---

# Strap Figma Audit — the canvas-side duplicate radar

The code-side radar (`duplicateComponent`) catches a hand-written CSS rule that's really a
registry component. This is its Figma analog: it catches a **raw frame** that's really the
`Card` component (never made an instance), and **near-identical frames** that should be one
component. Advisory (`warn`) by design — you surface look-alikes for a human to judge, you
never auto-change the canvas.

You do the Figma MCP I/O and normalize it; the deterministic engine
(`node scripts/strap.mjs figma-audit`) does the fingerprinting + matching offline.

## When to run
- The user asks to lint / dedupe a Figma file, or "find duplicate frames / is this a component?".
- A pasted `figma.com` URL with intent to check for duplicates.
- After a design sprint, before componentizing.

## Prerequisite
`.strap/registry.json` must be populated (the component footprints to match against). If it's
empty or stale, run **strap-preflight** first.

## Step 1 — resolve the file + walk the canvas (Figma MCP)
Read `/figma-use` before any `use_figma`. From the `figma.com/design/:fileKey/...` URL, extract
`fileKey` (and `nodeId` if present).

1. `get_metadata` (no `nodeId`) → list top-level pages.
2. For each page, `get_metadata(nodeId=pageId)` → the frame tree (ids, types, names, x/y/w/h,
   nesting). Collect **candidate frames**: top-level frames on each page (and notable nested
   container frames). Record each frame's direct `children` as `{ type, name }`.

## Step 2 — enrich each candidate with its token footprint (Figma MCP)
For each candidate frame, `get_design_context(nodeId)` and extract:
- **`type`** — is it a component `INSTANCE`, a `COMPONENT` master, or a raw `FRAME`? (Only raw
  `FRAME`s are flagged; instances/masters are correct usage.) If the context can't disambiguate,
  record `"FRAME"` (may over-flag — a documented limitation).
- **bound variables / styles** → map each to a token name using `.strap/tokens.json`
  (a color/radius/shadow/font variable → `color.line`, `radius.card`, `shadow.md`, `font.body`…).
  These become the frame's `tokens` array in canonical `group.leaf` form.

**Cap the work.** Enrich at most ~60 candidate frames per run to respect Figma rate limits. If
there are more, process the largest/top-level ones first and **`log` how many were skipped** —
never silently truncate.

## Step 3 — write the snapshot
Write `.strap/figma-frames.json` (overwrite). Shape:
```json
{
  "_source": { "figmaFileKey": "<key>", "syncedAt": "<today ISO>" },
  "frames": [
    { "id": "1:8", "name": "Checkout card", "page": "Page 1", "type": "FRAME",
      "componentId": null, "width": 300, "height": 145,
      "children": [ { "type": "TEXT", "name": "CHECKOUT" }, { "type": "FRAME", "name": "Button / primary" } ],
      "tokens": ["color.white", "color.line", "radius.card", "shadow.md"] }
  ]
}
```
- `type`: `FRAME` | `INSTANCE` | `COMPONENT`. Set `componentId` when `INSTANCE`.
- `tokens`: canonical `group.leaf` keys from bound variables — leave empty if a frame binds none.
- Never invent tokens; if a variable is unresolved, omit it.

## Step 4 — run the engine
```bash
node "$CLAUDE_PROJECT_DIR/scripts/strap.mjs" figma-audit
```
It reports:
- **`figmaDuplicateComponent`** — a raw frame whose tokens match a registry component ("Frame X
  looks like the card component but isn't an instance").
- **`figmaDuplicateFrame`** — clusters of near-identical raw frames ("N frames … componentize").

## Output to the user
A short summary: N frames scanned, M look-alikes of library components, K duplicate clusters —
each with frame names + node ids, and the concrete next action (make it an instance / componentize).
Be honest that it's advisory and heuristic: it surfaces candidates, it doesn't prove duplication.
For catching duplicates *inside* Figma continuously, note that dedicated Figma lint plugins
(Design Lint, etc.) complement this.
