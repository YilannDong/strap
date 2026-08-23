// Strap merge planner: turn "this raw frame is really the Card component" into an
// explicit, reviewable plan.
//
// Pure + offline, like the rest of the engine. It never talks to Figma — it decides
// WHAT should happen and what the risks are; the strap-figma-merge skill performs it
// through the MCP and shows the user the frame before anything is written.
//
// Merging is destructive: the raw frame is replaced. So the plan is the safety rail —
// it surfaces exactly what will be lost before a human confirms.
import { canonFromConsumes, matchFootprint } from './fingerprint.mjs';

const set = (arr) => new Set((arr || []).map(canonFromConsumes).filter(Boolean));

/**
 * @param {object} args
 * @param {object} args.frame      one entry from the figma-frames snapshot
 * @param {object} args.component  one entry from registry.components
 * @returns {object} merge plan
 */
export function planMerge({ frame, component }) {
  if (!frame) throw new Error('planMerge: no frame');
  if (!component) throw new Error('planMerge: no component');

  const frameTokens = set(frame.tokens);
  const compTokens = set(component.consumes);
  const { shared, coverage } = matchFootprint(frameTokens, compTokens);

  const missingInFrame = [...compTokens].filter((t) => !frameTokens.has(t)).sort();
  const extraInFrame = [...frameTokens].filter((t) => !compTokens.has(t)).sort();

  // Text the frame carries. The component's own prop names aren't in the registry,
  // so the skill resolves them live; the plan just says what content must survive.
  const textNodes = (frame.children || [])
    .filter((c) => String(c.type).toUpperCase() === 'TEXT')
    .map((c, i) => ({ order: i, name: c.name }));

  const warnings = [];
  if (String(frame.type || 'FRAME').toUpperCase() !== 'FRAME') {
    warnings.push(`${frame.name} is a ${frame.type}, not a raw FRAME — it may already be correct usage.`);
  }
  if (coverage < 0.6) {
    warnings.push(`Only ${Math.round(coverage * 100)}% of the component's tokens are present — weak match, confirm this is the right target.`);
  }
  if (extraInFrame.length) {
    warnings.push(`The frame uses ${extraInFrame.length} token(s) the component does not (${extraInFrame.join(', ')}). These are lost unless the component gains them.`);
  }
  const nonText = (frame.children || []).filter((c) => String(c.type).toUpperCase() !== 'TEXT');
  if (nonText.length) {
    warnings.push(`${nonText.length} non-text child(ren) (${nonText.map((c) => c.name).join(', ')}) have no obvious home in the component — check before applying.`);
  }

  return {
    action: 'merge',
    frame: { id: frame.id, name: frame.name, page: frame.page || null, type: frame.type || 'FRAME',
             width: frame.width, height: frame.height },
    target: { name: component.name, figma: component.figma || null },
    match: { shared, ofComponent: compTokens.size, coverage: Number(coverage.toFixed(2)) },
    tokens: { shared: [...compTokens].filter((t) => frameTokens.has(t)).sort(), missingInFrame, extraInFrame },
    carryOver: textNodes,
    warnings,
    // The skill fills these in once it has read the component's real properties.
    propMap: null,
    reviewed: false,
  };
}

/** Human-readable preview of a plan — the thing a user actually reads before saying yes. */
export function formatMergePlan(plan) {
  const L = [];
  L.push(`Merge plan — "${plan.frame.name}" (${plan.frame.id}) → ${plan.target.name}`);
  L.push('');
  L.push(`  match      ${plan.match.shared}/${plan.match.ofComponent} of the component's tokens (${Math.round(plan.match.coverage * 100)}%)`);
  if (plan.tokens.shared.length)        L.push(`  shared     ${plan.tokens.shared.join(', ')}`);
  if (plan.tokens.missingInFrame.length) L.push(`  gains      ${plan.tokens.missingInFrame.join(', ')}`);
  if (plan.tokens.extraInFrame.length)   L.push(`  loses      ${plan.tokens.extraInFrame.join(', ')}`);
  if (plan.carryOver.length) {
    L.push('');
    L.push('  content to carry over:');
    for (const t of plan.carryOver) L.push(`    ${t.order + 1}. "${t.name}"`);
  }
  if (plan.warnings.length) {
    L.push('');
    for (const w of plan.warnings) L.push(`  ! ${w}`);
  }
  L.push('');
  L.push('  Nothing has been changed. Run the strap-figma-merge skill to apply it.');
  return L.join('\n');
}
