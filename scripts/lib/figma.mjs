// Strap Figma radar: the code-side duplicate radar's canvas analog.
// Given a snapshot of Figma frames (produced by the strap-figma-audit skill via
// the Figma MCP) + the component registry, flag look-alike / duplicate frames.
// Pure + offline: the skill does all MCP I/O, this just fingerprints & compares.
import { canonFromConsumes, matchFootprint, DUP_MIN_CONSUMES } from './fingerprint.mjs';

// Figma-specific: two raw frames are "the same thing" when their structure matches
// and their token footprints substantially overlap.
const DUP_FRAME_TOKEN_JACCARD = 0.6;
const SIZE_BUCKET = 8; // px grid the width/height is rounded to when comparing frames

function sev(cfg, rule) {
  return (cfg.rules && cfg.rules[rule]) || 'off';
}

// Canonical token footprint of a frame. `tokens` arrive as `group.leaf` strings
// (color.line, radius.card…) captured from bound Figma variables/styles.
function tokenSet(frame) {
  return new Set((frame.tokens || []).map(canonFromConsumes).filter(Boolean));
}

// Coarse structure signature: child count + sorted child-type multiset + a size
// bucket. Frames sharing this are candidates for being copy-paste duplicates.
function structureKey(frame) {
  const kids = frame.children || [];
  const types = kids.map((c) => String(c.type || '').toUpperCase()).sort().join(',');
  const w = Math.round((frame.width || 0) / SIZE_BUCKET) * SIZE_BUCKET;
  const h = Math.round((frame.height || 0) / SIZE_BUCKET) * SIZE_BUCKET;
  return `${kids.length}|${types}|${w}x${h}`;
}

function jaccard(a, b) {
  if (!a.size && !b.size) return 1;
  let inter = 0;
  for (const k of a) if (b.has(k)) inter++;
  return inter / (a.size + b.size - inter);
}

// Does the frame's name already claim to be this component? (Figma analog of the
// CSS name-skip: a frame literally named "Card" / "Card / elevated" is intentional.)
function frameNamesComponent(frameName, compName) {
  const re = new RegExp(`\\b${String(compName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  return re.test(String(frameName || ''));
}

function loc(frame) {
  const page = frame.page ? `${frame.page} · ` : '';
  return `${page}${frame.name || '(unnamed)'} (${frame.id})`;
}

/**
 * @param {Array} frames  normalized frame snapshot (see .strap/figma-frames.json)
 * @param {object} cfg     loaded Strap config (uses cfg.registry + cfg.rules)
 * @returns {Array<{rule,severity,loc,message,fix}>}
 */
export function auditFrames(frames, cfg) {
  const out = [];
  const push = (rule, l, message, fix) => {
    const s = sev(cfg, rule);
    if (s === 'off') return;
    out.push({ rule, severity: s, loc: l, message, fix: fix || null });
  };

  const components = (cfg.registry && cfg.registry.components) || [];
  // Only raw frames are candidates — INSTANCE (already the component) and COMPONENT
  // (the master definition) are correct usages, so they're skipped, exactly like
  // the CSS radar skips a component's own named styles.
  const rawFrames = (frames || []).filter((f) => String(f.type || 'FRAME').toUpperCase() === 'FRAME');

  // --- 1. figmaDuplicateComponent: a raw frame that's really a library component.
  if (sev(cfg, 'figmaDuplicateComponent') !== 'off' && components.length) {
    const footprints = components
      .map((c) => ({ comp: c, keys: new Set((c.consumes || []).map(canonFromConsumes).filter(Boolean)) }))
      .filter((f) => f.keys.size >= DUP_MIN_CONSUMES);

    for (const frame of rawFrames) {
      const used = tokenSet(frame);
      let best = null;
      for (const f of footprints) {
        if (frameNamesComponent(frame.name, f.comp.name)) continue; // intentional / its own frame
        const { shared, coverage, isMatch } = matchFootprint(used, f.keys);
        if (!isMatch) continue;
        if (!best || coverage > best.coverage || (coverage === best.coverage && shared > best.shared)) {
          best = { comp: f.comp, keys: f.keys, shared, coverage };
        }
      }
      if (!best) continue;
      const sample = [...best.keys].filter((k) => used.has(k)).slice(0, 3).join(', ');
      push('figmaDuplicateComponent', loc(frame),
        `Frame "${frame.name}" reuses ${best.shared}/${best.keys.size} of the "${best.comp.name}" component's tokens (${sample}${best.shared > 3 ? ', …' : ''}) but is a raw frame, not an instance. Replace it with the library component.`,
        best.comp.figma || null);
    }
  }

  // --- 2. figmaDuplicateFrame: two+ raw frames that are near-identical copies.
  if (sev(cfg, 'figmaDuplicateFrame') !== 'off') {
    // Meaningful candidates only: real containers (>=2 children), so we don't
    // cluster trivial empty/one-child frames into noise.
    const candidates = rawFrames.filter((f) => (f.children || []).length >= 2);
    const groups = new Map();
    for (const f of candidates) {
      const k = structureKey(f);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(f);
    }
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      const rep = group[0];
      const repTokens = tokenSet(rep);
      // Confirm the token footprints agree too (structure alone can coincide).
      const members = group.filter((f) => jaccard(repTokens, tokenSet(f)) >= DUP_FRAME_TOKEN_JACCARD);
      if (members.length < 2) continue;
      const names = members.map((f) => `"${f.name}"`);
      const shown = names.slice(0, 3).join(', ');
      const more = names.length > 3 ? ` +${names.length - 3} more` : '';
      push('figmaDuplicateFrame', loc(rep),
        `${members.length} near-identical frames (${shown}${more}) share the same structure and tokens but aren't one component. Componentize to dedupe.`,
        null);
    }
  }

  return out;
}
