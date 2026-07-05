// Strap fingerprint core — shared by the code radar (scan.mjs) and the Figma
// radar (figma.mjs). One source of truth for token canonicalization and the
// footprint-match thresholds, so both surfaces agree on what "looks like the
// same component" means. Pure, zero-dependency.

// Canonicalize a token reference to a `group.leaf` key so a CSS var, an SCSS
// var, a `{group.key}` alias, or a Figma bound-variable name can all be compared
// against a registry component's `consumes` list (`color.line`, `radius.card`…).
const TOKEN_GROUP_PREFIXES = ['radius', 'shadow', 'gradient', 'motion', 'font', 'space'];

// A bare var/scss name -> canonical key. Colors are the un-prefixed group in the
// generated CSS (`--line`, `--blue`); everything else carries its group as a
// prefix (`--radius-card`, `--shadow-md`, `--font-body`).
export function canonFromVarName(name) {
  const n = String(name).toLowerCase();
  for (const g of TOKEN_GROUP_PREFIXES) {
    if (n.startsWith(g + '-')) return `${g}.${n.slice(g.length + 1)}`;
  }
  return `color.${n}`;
}

// A `consumes` entry (or any already-grouped `group.leaf` string) -> canonical
// key. Keeps group + leaf; drops deeper nesting. Returns null for ungrouped input.
export function canonFromConsumes(entry) {
  const parts = String(entry).toLowerCase().split('.');
  if (parts.length < 2) return null;
  return `${parts[0]}.${parts.slice(1).join('.')}`;
}

// Footprint-match thresholds — advisory by design, tuned to fire only on a strong
// match. A component must define a real footprint (>=3 tokens), the candidate must
// share most of it (>=60%), and at least 3 tokens must overlap.
export const DUP_MIN_CONSUMES = 3;
export const DUP_MIN_SHARED = 3;
export const DUP_MIN_COVERAGE = 0.6;

/**
 * Compare a used-token set against a component's consumed-token set.
 * @param {Set<string>} used     canonical token keys observed on the candidate
 * @param {Set<string>} consumes canonical token keys the component consumes
 * @returns {{shared:number, coverage:number, isMatch:boolean}}
 */
export function matchFootprint(used, consumes) {
  if (consumes.size < DUP_MIN_CONSUMES) return { shared: 0, coverage: 0, isMatch: false };
  let shared = 0;
  for (const k of consumes) if (used.has(k)) shared++;
  const coverage = shared / consumes.size;
  return {
    shared,
    coverage,
    isMatch: shared >= DUP_MIN_SHARED && coverage >= DUP_MIN_COVERAGE,
  };
}
