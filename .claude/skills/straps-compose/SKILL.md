---
name: straps-compose
description: Build UI on Design System rails — library-first. Before writing or generating any component, screen, or layout, search the cached Component Registry and reuse existing components as instances instead of hand-rolling new ones. Enforces Auto Layout, semantic naming, and Code Connect linkage so generated UI stays linked to Figma masters. Use for ANY UI construction task (build a screen, add a component, lay out a page) once straps-preflight has run.
---

# Straps Compose — library-first construction

Your default is REUSE, not creation. Every box you draw should be an instance of an existing
Design System component, or a documented, deliberate new one — never an ad-hoc duplicate.

## Preconditions
`.straps/registry.json` must be populated. If it's empty, run **straps-preflight** first.

## The loop (per section of UI)
1. **Search the registry before building.** For each element (button, field, card, badge…),
   look it up in `.straps/registry.json`. If a match exists:
   - Use the `import` line verbatim and render an **instance** — do not redefine the component.
   - Choose existing `variants`/`props`; do not invent new visual states.
   - In Figma (`use_figma`), insert the library component instance, not a fresh frame.
2. **No registry match?** Pause and decide explicitly:
   - Compose from smaller registry primitives if possible, OR
   - Propose a *new* DS component to the user (name, variants, tokens it will consume).
   Only then build it — and add it to the registry so it's reusable.
3. **Layout = Auto Layout / fl-flex.** Structure with Auto Layout in Figma and flex/grid in
   code. No absolute pixel positioning for layout.
4. **Semantic naming.** Name layers and elements by role (`CardHeader`, `PrimaryAction`), never
   by appearance (`Frame 12`, `blue-button`).
5. **Keep it linked.** When you create a code component that maps to a Figma node, record it in
   `.straps/code-connect.json` and (when appropriate) push the mapping with the Figma MCP
   (`add_code_connect_map`). Linked components survive design changes; orphans drift.

## Hard rules (the engine enforces these)
- Re-declaring a registry component locally (`function Button(){…}` when `Button` is in the
  registry) is a **blocked** violation. Import the instance instead.
- All color/spacing/font/radius values must be tokens — that's **straps-bind**'s job; invoke its
  rules as you write so the post-write hook doesn't bounce you.

## Verify before you call it done
```bash
node "$CLAUDE_PROJECT_DIR/scripts/straps.mjs" validate <files you touched>
```
Resolve every `error` (warnings are advisory). Then summarize: which registry components you
reused, any new component proposed, and remaining Code Connect gaps.

Hand off binding-heavy work to **straps-bind**; visual references to **straps-intake**.
