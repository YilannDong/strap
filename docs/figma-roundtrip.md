# Figma round-trip runbook — proving the loop

> The one milestone left after launch. This proves Strap's headline: **design ⇄ code stays
> consistent.** Tokens and components sync *from* Figma and enforce in code; code components link
> *back* to their Figma masters via Code Connect. Run this when your Figma MCP isn't rate-limited.

## Status

- ✅ **Enforcement engine** — proven (tests + CI + audit).
- ✅ **Code → Figma generation** — proven live: a Checkout frame was generated into Figma via
  `create_new_file` + `use_figma`, with the token set created as **bound Figma Variables** (the
  button fill references `color/blue`, not a hardcoded hex). Screenshot in the README.
- ◻️ **Figma → code via MCP** (`get_variable_defs` on a live selection) — still to run on a file
  you own; the `strap import` path already covers the same outcome from an export.
- ⚠️ **Native Code Connect publish** (`add_code_connect_map`) — requires a Dev/Full seat on an
  **Org/Enterprise** plan. Strap caches the link locally in `.strap/code-connect.json` regardless.

## Preconditions

- [ ] **Figma plan with MCP budget** — the Starter tier exhausts its MCP call quota in a few
      calls. Upgrade, or do this on an org/full-seat file. (`whoami` shows your plans/tiers.)
- [ ] **Figma desktop app open** on the design-system file. `get_variable_defs` reads the **live
      canvas selection**, not just the URL node id.
- [ ] A file that actually contains: **Variables** (color/spacing/radius/type), **published
      Components**, and ideally some existing **Code Connect**.
- [ ] Figma MCP connected in Claude Code. Read the `/figma-use` skill before any `use_figma`.

## Part A — Design → Code (pull, then enforce)

Run the **strap-preflight** skill, or these MCP calls directly:

1. `whoami` — confirm auth + that the file's plan has MCP budget.
2. **Select the Variables frame/page in the desktop app**, then `get_variable_defs(fileKey, nodeId)`
   → colors, spacing, radius, fonts.
3. `get_libraries(fileKey)` → library keys; `search_design_system(query, fileKey, includeLibraryKeys)`
   → the published component set (names, variants, node ids).
4. `get_code_connect_map(fileKey, nodeId)` → existing Figma-node ↔ code links.
5. Write the results into the artifacts (keys must match the scanner):
   - `.strap/tokens.json` — `colors` (token→hex), `spacing[]`, `radius[]`, `fonts[]`.
     `get_variable_defs` returns a flat `{ "group/name": "#hex" }`; split nested groups on `/`.
   - `.strap/registry.json` — `components[]` with `name`, `variants`, `figma` node id.
   - `.strap/code-connect.json` — `map` of `{ "12:340": { name, source } }`.
6. `strap tokens` then `strap audit` — proves the **Figma-sourced** cache drives enforcement.

## Part B — Code → Design (link back)

1. For each code component (`src/components/Button.tsx` …) find its Figma master:
   `get_code_connect_suggestions` / `get_context_for_code_connect`.
2. Write the link: `add_code_connect_map` (or `send_code_connect_mappings`).
3. Confirm it persists with `get_code_connect_map`, and mirror it into `.strap/code-connect.json`.
4. *(Optional, the full code→design push)* build a screen in code and materialize it in Figma as
   **instances** with `use_figma` / `generate_figma_design`. Read `/figma-use` first.

## Part C — Prove consistency (the actual loop)

- **Token change in Figma → code stays honest:** change a color value in Figma, re-run preflight,
  re-run `strap tokens`. The CSS var updates everywhere; any code that hardcoded the old hex is
  flagged by `strap audit`.
- **Component change in code → master stays linked:** rename/move a code component; Code Connect
  keeps the Figma node mapped to the new source.
- Capture `get_screenshot` before/after, the `strap audit` output, and the populated
  `code-connect.json`.

## Acceptance criteria — what "proven" means

- [ ] `.strap/tokens.json` populated from **real Figma variables** (not an import file).
- [ ] `.strap/registry.json` from **real published components**.
- [ ] `.strap/code-connect.json` has ≥1 real `node → source` mapping that round-trips.
- [ ] A deliberate off-spec edit is **blocked** against the Figma-sourced tokens.
- [ ] Before/after screenshots + audit logs captured for the README "The loop" section.

## Gotchas (hit these in dev — don't re-learn them)

- **Starter-plan quota:** `search_design_system` / `get_code_connect_map` returned *"reached the
  MCP tool call limit on the Starter plan."* Batch reads, never retry blindly, upgrade if needed.
- **`get_variable_defs` needs a live selection** in the **desktop** app — a browser tab or a bare
  URL node id returns *"nothing selected."*
- **Community / view-only files:** duplicate to your drafts so you can select/edit.
- **Don't commit licensed assets** that come back from Figma (fonts, proprietary tokens) — keep
  them under the gitignored `private/` and regenerate artifacts locally.

## After it's proven

- Add a **"The loop"** section + a short GIF to the README (this is the money shot).
- Wire `strap sync` to orchestrate Part A (it currently prints guidance).
