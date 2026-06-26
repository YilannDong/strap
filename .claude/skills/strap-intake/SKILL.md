---
name: strap-intake
description: Turn a visual reference into an on-rails, token-aware Design Brief before any building starts. Use when the user shares a screenshot, an image, a website URL, a competitor design, or a freeform description and wants it built. Instead of copying raw pixels, it maps every observed color/spacing/font to the nearest existing design token and every observed element to a registry component, producing a structured brief so downstream construction is already on-spec.
---

# Strap Intake — references become briefs, not pixel copies

A reference is inspiration, not a spec. Copying a screenshot pixel-for-pixel imports off-spec
colors, random spacing, and unknown components. Your job: translate the reference into the
project's Design System language up front.

## Preconditions
Best run after **strap-preflight** so tokens/registry exist to map against. If they don't, note
which mappings are provisional.

## Workflow
1. **Ingest the reference.**
   - Image/screenshot → describe structure top-to-bottom: regions, hierarchy, components, states.
   - URL → fetch and read it (WebFetch / browser MCP); extract layout, type scale, color usage.
   - Description → restate it as concrete UI structure and confirm ambiguities with the user.
2. **Map to the Design System (the key step).** For every observed attribute, resolve to an
   existing asset and record the mapping + confidence:
   - Each color → nearest token in `.strap/tokens.json` `colors` (note the delta).
   - Each spacing/size → nearest `spacing`/`radius` step.
   - Each font → a `fonts` entry (or flag "not in type system").
   - Each UI element → a `.strap/registry.json` component + variant (or "new component needed").
3. **Flag the gaps.** Anything with no good DS match is a decision, not a default: list it as
   "needs a new token" or "needs a new component" for the user to approve — never silently invent.

## Output — the Design Brief
Write a structured brief (and offer to save it under `.strap/briefs/<name>.md`):

```
# Design Brief: <name>   (source: <ref>)
## Layout
- <region>: <structure, Auto Layout direction>
## Components  (mapped to registry)
- Primary CTA  -> Button / variant=primary
- Search field -> Input / size=md
- (NEW) Pricing toggle -> propose component
## Tokens  (mapped, with deltas)
- header bg  #fbfbfd -> color/bg/subtle (Δ small)
- accent     #635bff -> color/brand/primary (Δ visible — confirm)
## Type
- Display 40/48 -> Inter Display
## Open decisions
- [ ] new token for accent? / [ ] new Pricing toggle component?
```

This brief is the contract for **strap-compose** (build the components) and **strap-bind**
(apply the tokens). Because everything is already mapped to the system, downstream construction
passes the QA hook on the first try.
