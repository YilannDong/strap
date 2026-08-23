---
name: strap-figma-merge
description: Apply a Strap merge plan to the Figma canvas — replace a raw frame with an instance of the library component it duplicates, carrying its content across. Run after `strap merge <frameId> --into "<Component>"` has written .strap/merge-plan.json, or when the user picks "Merge into …" in the HTML drift report. Trigger phrases "apply the merge", "replace that frame with the component", "merge the drift", a decision block pasted from the Strap report.
---

# Strap Figma Merge — apply a merge plan to the canvas

`strap merge` decides **what** should happen and writes `.strap/merge-plan.json`. This skill
does the part the engine deliberately cannot: it reads the plan, shows the user the frame,
gets an explicit yes, and performs the swap through the Figma MCP.

**Merging is destructive** — the raw frame is deleted. Treat confirmation as mandatory, not
a formality.

## Step 0 — load the plan
Read `.strap/merge-plan.json`. If it is missing, stop and tell the user to run:

```bash
node scripts/strap.mjs merge <frameId> --into "<Component>"
```

## Step 1 — show the frame before anything else
Read `/figma-use` before any `use_figma` call. Per the project's rails, a design decision is
made **with the visual in front of the user**, never blind.

1. `get_screenshot(nodeId=plan.frame.id)` — the raw frame as it is today.
2. `get_screenshot(nodeId=plan.target.figma)` if the plan carries a component node id.

## Step 2 — resolve the real prop map
The registry knows the component's *tokens*, not its *properties*. Read them live:

- `use_figma` → find the component set by `plan.target.name`, read
  `componentPropertyDefinitions`.
- Pair `plan.carryOver` (the frame's text, in order) to the component's TEXT properties.
- Order is a **guess**. Show the pairing as a table and let the user correct it.

## Step 3 — confirm with AskUserQuestion
Never apply silently. Present:

- the screenshot(s),
- the proposed prop map,
- everything under `plan.warnings` — especially `tokens.extraInFrame`, which is what gets
  **lost**,
- options: **Apply** · **Apply with my corrections** · **Cancel**.

If `plan.match.coverage < 0.6`, say plainly that this is a weak match and recommend Cancel.

## Step 4 — apply
Only after an explicit yes:

1. Create an instance of the component (`createInstance()`).
2. Set the text props from the confirmed map.
3. Place it at the frame's `x`/`y`; match width where the component allows it.
4. Match the parent and index so layout order is preserved.
5. Remove the raw frame.
6. Write `reviewed: true` and the final `propMap` back into `.strap/merge-plan.json`.

## Step 5 — report
Tell the user what changed, what was lost, and the new instance's node id. Then suggest
re-running `strap figma-audit` to confirm the finding is gone.

## Never
- Apply without a confirmed prop map.
- Merge a frame whose `type` is not `FRAME` — instances and masters are already correct usage.
- Invent a component. If the target is wrong, the answer is a new component
  (`strap scaffold`), not a forced merge.
