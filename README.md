# Straps

![ci](https://github.com/OWNER/straps/actions/workflows/ci.yml/badge.svg)

**An enforcement layer for Claude Code + Claude design + Figma.**
4 skills that keep AI on your Design System rails. Components stay linked, tokens stay bound,
nothing goes off-spec.

> Replace `OWNER` in the badge URL with your GitHub org/user after forking.

Straps is inspired by [claude2figma](https://github.com/senlindesign/claude2figma) but adds a
real teeth: a zero-dependency **validation engine** and a **PostToolUse hook that actually blocks
off-spec writes** — enforcement, not just instructions to the model.

---

## Why it's different

| | claude2figma | **Straps** |
|---|---|---|
| Guidance | Skill prompts | Skill prompts **+ executable rules** |
| Token compliance | Asked of the model | **Scanned & blocked** (raw hex / rgb / off-scale px / off-system fonts) |
| Components | "use instances" | Registry-backed; **redefining a DS component is blocked** |
| QA | Prompt-level "verify" | `straps check` runs on every Edit/Write and **fails the write on errors** |
| Linkage | — | Code Connect map cached in `.straps/`, kept in sync |
| Artifacts | Token Map / Registry (described) | **Machine-readable** `.straps/tokens.json`, `registry.json`, `code-connect.json` |
| Config | — | `straps.config.json` — per-rule severity (`error`/`warn`/`off`) |

## The 4 skills

- **straps-preflight** — sync Figma → build the local DS cache (Token Map, Component Registry,
  Code Connect map) and verify the rails are live. *Run first.*
- **straps-compose** — library-first UI construction. Reuse registry components as instances;
  Auto Layout; semantic naming; keep Code Connect links.
- **straps-bind** — every color/font/spacing/radius bound to a token; post-write QA blocks
  literals.
- **straps-intake** — turn a screenshot/URL/description into a token-aware Design Brief before
  building, so downstream work is already on-spec.

## How enforcement works

```
edit a file ──▶ PostToolUse hook ──▶ scripts/straps.mjs check
                                        │
                       reads .straps/tokens.json + registry.json
                                        │
                 ┌──────────────────────┴───────────────────────┐
              no errors                                       errors
                 │                                               │
              write OK                              exit 2 + reasons to Claude
                                                 (raw #hex → use color/brand/primary)
                                                  Claude fixes, re-applies
```

The scanner (`scripts/lib/scan.mjs`) flags: hardcoded hex that duplicates or misses a token,
`rgb()/rgba()` literals, fonts outside the type system, spacing/radius off the scale, and local
re-declaration of a registry component.

## Install

**As a drop-in (any project):**
```bash
# copy these into your project root
CLAUDE.md  straps.config.json  .straps/  .claude/  scripts/
node scripts/straps.mjs init     # if you don't already have config + artifacts
```
The hook in `.claude/settings.json` activates automatically in Claude Code.

**As a Claude Code plugin:** this repo ships `.claude-plugin/plugin.json` exposing all 4 skills.

## Quickstart (60 seconds, no install)

```bash
git clone https://github.com/OWNER/straps && cd straps
node --test test/                  # tests pass on Node 18+
node scripts/straps.mjs audit      # sample library validates clean against the DS
node scripts/straps.mjs tokens     # (re)generate src/styles/tokens.css
```

The repo ships with the open **`examples/starter`** design system already imported, so `audit`
is green out of the box. Then point it at *your* system — see
[Importing an existing design system](#importing-an-existing-design-system).

## Usage in Claude Code

1. Open the project in Claude Code, share your Figma file: *"let's start"* → **straps-preflight**
   syncs tokens + components into `.straps/`.
2. Build: *"add a settings page"* → **straps-compose** reuses registry components; **straps-bind**
   keeps values on tokens. The hook blocks anything off-spec.
3. Audit anytime: `node scripts/straps.mjs audit`

## Token architecture

Straps follows the W3C DTCG / Material-3 model — **primitives → semantic → component**:

- **Primitives** (`tokens.json` `colors`): the raw palette. The validator matches any hardcoded
  hex against these and tells you the token to use instead.
- **Semantic** (optional `tokens.json` `semantic.color`): intent tokens that reference a
  primitive *by name*, never a raw value. When present, the codegen emits
  `--brand-default: var(--mint);` and the validator suggests the **semantic** token over the
  bare primitive — steering you to intent.
- **Component** (`registry.json`): each component + the tokens it consumes, built by `import`
  from your `components.*.json`. This is the library-first layer the skills reuse.

The `examples/starter` system uses a flat **functional** palette (`mint`, `ink`, `line`,
`danger`…) — already intent-named, so it skips the separate semantic tier. Add a `semantic`
block to your tokens when your primitives are pure palette steps (`blue/600`).

## Importing an existing design system

If you already have a token file + component specs (DTCG-style JSON with `{group.key}`
aliases), put them in a folder Straps won't publish (`private/` is gitignored) and point the
importer at it:

```bash
node scripts/straps.mjs import private/my-ds   # -> .straps/tokens.json + registry.json
node scripts/straps.mjs tokens                 # -> src/styles/tokens.css
node scripts/straps.mjs audit
```

`import` flattens colors (incl. nested groups), derives the spacing/radius scales, collects font
families, and builds the component registry from every `components.*.json`. Re-run it whenever
the source changes — the artifacts are generated, not hand-edited. See [examples/](examples/).

`import` flattens colors (incl. nested groups), derives the spacing/radius scales, collects
font families, and builds the **Tier-3 component registry** from every `components.*.json` —
recording each component's source, variants, and the exact tokens it `consumes`. Re-run it
whenever the source changes; the artifacts are generated, not hand-edited.

## Token codegen

`tokens.json` is the source of truth; generate CSS variables your code binds to:

```bash
node scripts/straps.mjs tokens          # writes src/styles/tokens.css
node scripts/straps.mjs tokens --stdout # print instead
```

The generated file is auto-exempted from scanning (it's the one place raw hex/rgba/shadows
legitimately live). Everything else must reference `var(--color-brand-primary)` etc.

## Sample library (working demo)

`src/` ships a token-bound component library that mirrors `.straps/registry.json` —
`Button`, `Input`, `Card`, `Badge` — plus `src/App.tsx`, a screen built the Straps way.
It audits 100% clean; edit any value to a raw hex and watch the hook bounce it.

## Config

`straps.config.json` controls which files are scanned and the severity of each rule:

```json
{
  "rules": {
    "rawHex": "error", "rawRgb": "error", "rawFont": "error",
    "offScaleSpacing": "warn", "offScaleRadius": "warn", "unlinkedComponent": "error"
  }
}
```

Set any rule to `"off"` to disable, `"warn"` to advise, `"error"` to block.

## Requirements

- Node 18+ (the engine is pure Node ESM, no dependencies).
- Figma MCP connected in Claude Code (for `straps-preflight` sync).

## License

MIT.
