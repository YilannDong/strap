// Strap scanner: the actual enforcement rules.
// Given file contents + config, return a list of violations.
import { normalizeHex } from './config.mjs';
import {
  canonFromVarName,
  canonFromConsumes,
  matchFootprint,
  DUP_MIN_CONSUMES,
  DUP_MIN_SHARED,
} from './fingerprint.mjs';

const SEV_RANK = { off: 0, warn: 1, error: 2 };

function sev(cfg, rule) {
  return cfg.rules[rule] || 'off';
}

// Build a line index so byte offsets become line/col.
export function locate(text, index) {
  let line = 1;
  let last = 0;
  for (let i = 0; i < index; i++) {
    if (text[i] === '\n') {
      line++;
      last = i + 1;
    }
  }
  return { line, col: index - last + 1 };
}

const HEX_RE = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
const RGB_RE = /\brgba?\(\s*[\d.]+[\s,]+[\d.]+[\s,]+[\d.]+(?:[\s,/]+[\d.%]+)?\s*\)/g;
const PX_RE = /\b(\d+(?:\.\d+)?)px\b/g;
const FONT_FAMILY_RE = /font-family\s*:\s*([^;}\n]+)/gi;
const RADIUS_RE = /border-radius\s*:\s*([^;}\n]+)/gi;
// JSX intrinsic-looking element that matches a registry component name (PascalCase).
function buildJsxRe(names) {
  if (!names.length) return null;
  const alt = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return new RegExp(`<\\s*(${alt})\\b`, 'g');
}

// --- Duplicate radar (CSS-specific extraction) -------------------------------
// The canonicalization + match thresholds live in fingerprint.mjs (shared with
// the Figma radar). This is just the CSS-rule token extractor.
// Collect the set of canonical token keys referenced inside one CSS rule body.
const VAR_REF_RE = /var\(\s*--([a-zA-Z0-9-]+)/g;
const SCSS_REF_RE = /\$([a-zA-Z0-9-]+)/g;
const ALIAS_REF_RE = /\{([a-z]+)\.([a-zA-Z0-9]+)\}/g;
const TOKENS_REF_RE = /tokens?\.([a-zA-Z]+)\.([a-zA-Z0-9]+)/g;
export function tokensInBlock(body) {
  const keys = new Set();
  let r;
  VAR_REF_RE.lastIndex = 0;
  while ((r = VAR_REF_RE.exec(body))) keys.add(canonFromVarName(r[1]));
  SCSS_REF_RE.lastIndex = 0;
  while ((r = SCSS_REF_RE.exec(body))) keys.add(canonFromVarName(r[1]));
  ALIAS_REF_RE.lastIndex = 0;
  while ((r = ALIAS_REF_RE.exec(body))) keys.add(`${r[1]}.${r[2]}`.toLowerCase());
  TOKENS_REF_RE.lastIndex = 0;
  while ((r = TOKENS_REF_RE.exec(body))) keys.add(`${r[1]}.${r[2]}`.toLowerCase());
  return keys;
}

// --- JSX / CSS-in-JS extraction (hardening: catch the raw <div> the CSS pass misses) ---
// Tailwind utility prefix -> token group. A class like `bg-white` -> color.white,
// `rounded-card` -> radius.card, `shadow-md` -> shadow.md, `border-line` -> color.line.
const TW_PREFIX_GROUP = [
  [/^bg-/, 'color'], [/^text-/, 'color'], [/^ring-/, 'color'], [/^fill-/, 'color'],
  [/^stroke-/, 'color'], [/^border-(?=[a-z])/, 'color'],
  [/^rounded-/, 'radius'], [/^shadow-/, 'shadow'], [/^font-/, 'font'],
  [/^(?:gap|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr)-/, 'space'],
];
// Map Tailwind utility classes to canonical token keys, but ONLY keep keys the
// design system actually defines (`allKeys`) — this gates out Tailwind's own
// defaults (rounded-md, shadow-lg…) so the radar stays precise, not noisy.
function tailwindTokens(className, allKeys) {
  const keys = new Set();
  for (const cls of String(className).split(/\s+/)) {
    if (!cls) continue;
    for (const [re, group] of TW_PREFIX_GROUP) {
      const mm = re.exec(cls);
      if (!mm) continue;
      const leaf = cls.slice(mm[0].length).toLowerCase();
      if (leaf && !leaf.startsWith('[')) { // `[var(--x)]` arbitrary values are caught by tokensInBlock
        const key = `${group}.${leaf}`;
        if (allKeys.has(key)) keys.add(key);
      }
      break;
    }
  }
  return keys;
}

// Return the full opening tag `<tag ...>` starting at tagStart, tolerant of `{}`
// expressions and quoted strings in attributes.
function openingTag(text, tagStart) {
  let depth = 0, quote = null;
  for (let i = tagStart; i < text.length; i++) {
    const ch = text[i];
    if (quote) { if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    else if (ch === '>' && depth <= 0) return text.slice(tagStart, i + 1);
  }
  return text.slice(tagStart, Math.min(text.length, tagStart + 4000));
}

// Per-element token footprints from inline style + className (incl. Tailwind).
const CLASSNAME_RE = /className\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*[`"']([^`"']*)[`"']\s*\})/;
const INLINE_STYLE_RE = /style=\{\{([\s\S]*?)\}\}/;
export function jsxElementFootprints(text, allKeys) {
  const out = [];
  const TAG_RE = /<([A-Za-z][\w.]*)/g;
  let t;
  while ((t = TAG_RE.exec(text))) {
    const region = openingTag(text, t.index);
    const tokens = new Set();
    const sm = INLINE_STYLE_RE.exec(region);
    if (sm) for (const k of tokensInBlock(sm[1])) tokens.add(k);
    const cm = CLASSNAME_RE.exec(region);
    const className = cm ? (cm[1] || cm[2] || cm[3] || '') : '';
    if (className) {
      for (const k of tokensInBlock(className)) tokens.add(k);
      for (const k of tailwindTokens(className, allKeys)) tokens.add(k);
    }
    if (tokens.size) out.push({ name: t[1], className, index: t.index, tokens });
  }
  return out;
}

// styled-components / css`` template literals -> token footprint.
const STYLED_RE = /(?:const|let|var)\s+([A-Za-z]\w*)\s*=\s*styled(?:\.[a-z][\w]*|\(\s*([A-Za-z]\w*)\s*\))?[^`]*`([\s\S]*?)`/g;
export function styledFootprints(text) {
  const out = [];
  let s;
  STYLED_RE.lastIndex = 0;
  while ((s = STYLED_RE.exec(text))) {
    out.push({ name: s[1], base: s[2] || null, index: s.index, tokens: tokensInBlock(s[3]) });
  }
  return out;
}

// Per-CSS-rule token footprints (selector + tokens). Comment-stripped selector so a
// token name in a comment can't leak in. Used by the duplicate radar and `evaluate`.
export function cssRuleFootprints(text) {
  const out = [];
  const BLOCK_RE = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = BLOCK_RE.exec(text))) {
    const selector = m[1].replace(/\/\*[\s\S]*?\*\//g, '').split(/[};]/).pop().trim();
    if (!selector || selector.startsWith('@')) continue;
    const tokens = tokensInBlock(m[2]);
    if (tokens.size) out.push({ selector, index: m.index, tokens });
  }
  return out;
}

// Does a name/selector string already claim to be this component?
function namesComponent(str, compName) {
  const re = new RegExp(`\\b${String(compName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  return re.test(String(str || ''));
}

// Stricter check for a className: is the component named as a *standalone class*
// (`card`, `card--elevated`, `card__body`) rather than merely embedded inside a
// token utility like `rounded-card`? Utility classes carry token leaf names, so a
// plain substring match here would wrongly suppress every Tailwind look-alike.
function classClaimsComponent(className, compName) {
  const cn = String(compName).toLowerCase();
  return String(className).split(/\s+/).some((c) => c.toLowerCase().split(/[-_:]/)[0] === cn);
}

function add(out, cfg, rule, text, index, message, fix) {
  const s = sev(cfg, rule);
  if (s === 'off') return;
  const { line, col } = locate(text, index);
  out.push({ rule, severity: s, line, col, message, fix: fix || null });
}

/**
 * @param {string} filePath
 * @param {string} text
 * @param {object} cfg loaded config
 * @returns {Array<{rule,severity,line,col,message,fix}>}
 */
// The generated token file is the one place raw hex/rgba legitimately live.
const GENERATED_MARKER = 'generated by `strap tokens`';

export function scanFile(filePath, text, cfg) {
  const out = [];
  if (text.slice(0, 400).includes(GENERATED_MARKER)) return out;
  const isStyle = /\.(css|scss|sass|less)$/.test(filePath);
  const isJsx = /\.(jsx|tsx|vue|svelte)$/.test(filePath);
  const allowColors = new Set((cfg.allow.colors || []).map((c) => normalizeHex(c)));

  // 1. Raw hex colors -> must map to a token.
  let m;
  HEX_RE.lastIndex = 0;
  while ((m = HEX_RE.exec(text))) {
    const norm = normalizeHex(m[0]);
    if (allowColors.has(norm)) continue;
    const primitive = cfg.colorByHex.get(norm);
    if (primitive) {
      const suggestion = cfg.suggestByHex.get(norm) || primitive;
      add(out, cfg, 'rawHex', text, m.index,
        `Hardcoded ${m[0]} duplicates token "${suggestion}". Bind to the token/variable instead.`,
        suggestion);
    } else {
      add(out, cfg, 'rawHex', text, m.index,
        `Hardcoded color ${m[0]} is off-spec — no matching design token. Add a token or use the nearest approved one.`);
    }
  }

  // 2. rgb()/rgba() literals.
  RGB_RE.lastIndex = 0;
  while ((m = RGB_RE.exec(text))) {
    add(out, cfg, 'rawRgb', text, m.index,
      `Raw color ${m[0].replace(/\s+/g, ' ')} is off-spec. Reference a color token/variable.`);
  }

  // 3. font-family literals (only when a type system is defined — can't validate against nothing).
  FONT_FAMILY_RE.lastIndex = 0;
  while (cfg.fontSet.size && (m = FONT_FAMILY_RE.exec(text))) {
    const decl = m[1].trim();
    // Allow if it references a CSS variable / token.
    if (/var\(|\$|tokens?\.|theme\(|\{[a-z]+\.[a-zA-Z0-9]+/.test(decl)) continue;
    const first = decl.split(',')[0].replace(/['"]/g, '').trim().toLowerCase();
    if (first && !cfg.fontSet.has(first)) {
      add(out, cfg, 'rawFont', text, m.index + m[0].indexOf(m[1]),
        `Font "${first}" is not in the type system (${[...cfg.fontSet].join(', ') || 'none defined'}). Use a font token.`);
    }
  }

  // 4. Spacing px off the scale (style files only; needs a defined scale to check against).
  if (isStyle && cfg.spacingSet.size && sev(cfg, 'offScaleSpacing') !== 'off') {
    PX_RE.lastIndex = 0;
    while ((m = PX_RE.exec(text))) {
      const px = Number(m[1]);
      if ((cfg.allow.spacingPx || []).includes(px)) continue;
      // Skip px in declarations the spacing scale doesn't govern: radius, type sizing, borders.
      const lineStart = text.lastIndexOf('\n', m.index) + 1;
      const before = text.slice(lineStart, m.index);
      if (/border-radius|\bradius\b|font-size|line-height|letter-spacing|\bborder(?:-\w+)?\s*:/.test(before)) continue;
      if (!cfg.spacingSet.has(px)) {
        add(out, cfg, 'offScaleSpacing', text, m.index,
          `${m[0]} is not on the spacing scale [${[...cfg.spacingSet].join(', ')}]. Use a spacing token.`);
      }
    }
  }

  // 5. border-radius off the scale (needs a defined scale).
  if (cfg.radiusSet.size && sev(cfg, 'offScaleRadius') !== 'off') {
    RADIUS_RE.lastIndex = 0;
    while ((m = RADIUS_RE.exec(text))) {
      const val = m[1];
      if (/var\(|\$|tokens?\.|theme\(/.test(val)) continue;
      const pxm = /(\d+(?:\.\d+)?)px/.exec(val);
      if (pxm) {
        const r = Number(pxm[1]);
        if (r !== 0 && !cfg.radiusSet.has(r)) {
          add(out, cfg, 'offScaleRadius', text, m.index,
            `border-radius ${pxm[0]} is off the radius scale [${[...cfg.radiusSet].join(', ')}]. Use a radius token.`);
        }
      }
    }
  }

  // 6. Unlinked components: a registry component re-declared locally instead of imported.
  if (sev(cfg, 'unlinkedComponent') !== 'off' && cfg.registryNames.size) {
    // Only flag when the file LOCALLY defines a function/const with a registry name
    // (i.e. shadowing the design-system component instead of using the instance).
    for (const name of cfg.registryNames) {
      // Only enforce on component-like (PascalCase) names. Registries built from design specs
      // often use camelCase/lowercase names (buttonPrimary, field, chip) that collide with
      // ordinary local identifiers — flagging those would be noise, not signal.
      if (!/^[A-Z]/.test(name)) continue;
      // Skip the component's own source file — defining Button inside Button.tsx is correct.
      const src = cfg.sourceByName.get(name);
      if (src && filePath.replace(/\\/g, '/').endsWith(src.replace(/^\.?\//, ''))) continue;
      const defRe = new RegExp(`\\b(?:function|const|class)\\s+${name}\\b`, 'g');
      let d;
      while ((d = defRe.exec(text))) {
        const entry = (cfg.registry.components || []).find((c) => c.name === name);
        add(out, cfg, 'unlinkedComponent', text, d.index,
          `"${name}" is a Design System component (${entry?.import || entry?.figma || 'registry'}). Import the instance instead of redefining it.`,
          entry?.import || null);
      }
    }
  }

  // 7. Duplicate radar (advisory): something whose token footprint matches an
  //    existing registry component, but that isn't the component (different name).
  //    Catches the "hand-written thing that's really a Card" case that the
  //    `unlinkedComponent` rule — which only spots *named* re-declarations — misses.
  //    CSS pass = rule blocks; JSX pass = styled-components / inline style / Tailwind
  //    (the raw <div> the CSS pass can't see). Heuristic + warn-only by design.
  if ((isStyle || isJsx) && sev(cfg, 'duplicateComponent') !== 'off' && (cfg.registry.components || []).length) {
    // Pre-compute each component's canonical token footprint once.
    const footprints = (cfg.registry.components || [])
      .map((c) => ({
        comp: c,
        keys: new Set((c.consumes || []).map(canonFromConsumes).filter(Boolean)),
      }))
      .filter((f) => f.keys.size >= DUP_MIN_CONSUMES);

    // Best-matching component for a used-token set (highest coverage, then shared).
    const bestMatch = (used) => {
      let best = null;
      for (const f of footprints) {
        const { shared, coverage, isMatch } = matchFootprint(used, f.keys);
        if (!isMatch) continue;
        if (!best || coverage > best.coverage || (coverage === best.coverage && shared > best.shared)) {
          best = { comp: f.comp, keys: f.keys, shared, coverage };
        }
      }
      return best;
    };
    const emit = (used, best, kind, name, idx) => {
      const sample = [...best.keys].filter((k) => used.has(k)).slice(0, 3).join(', ');
      add(out, cfg, 'duplicateComponent', text, idx,
        `${kind} ${name} reuses ${best.shared}/${best.keys.size} of the "${best.comp.name}" component's tokens (${sample}${best.shared > 3 ? ', …' : ''}). If this is a ${best.comp.name}, use the DS component instead of rebuilding it.`,
        best.comp.import || null);
    };

    // 7a. CSS rule blocks.
    if (isStyle && footprints.length) {
      const BLOCK_RE = /([^{}]+)\{([^{}]*)\}/g;
      while ((m = BLOCK_RE.exec(text))) {
        // Strip comments so a token name mentioned in a comment (e.g. "really a Card")
        // can't leak into the selector text or the component-name skip check.
        const selectorRaw = m[1].replace(/\/\*[\s\S]*?\*\//g, '').split(/[};]/).pop().trim();
        if (!selectorRaw || selectorRaw.startsWith('@')) continue; // skip at-rules
        const used = tokensInBlock(m[2]);
        if (used.size < DUP_MIN_SHARED) continue;
        const best = bestMatch(used);
        if (!best || namesComponent(selectorRaw, best.comp.name)) continue;
        const firstTok = selectorRaw.split(/\s/)[0];
        const selPos = firstTok ? m[1].indexOf(firstTok) : -1;
        const idx = m.index + (selPos >= 0 ? selPos : Math.max(0, m[1].search(/\S/)));
        emit(used, best, 'CSS rule', `"${selectorRaw}"`, idx);
      }
    }

    // 7b. JSX / CSS-in-JS: styled-components, inline style, className/Tailwind.
    if (isJsx && footprints.length) {
      const allKeys = new Set();
      for (const f of footprints) for (const k of f.keys) allKeys.add(k);

      for (const s of styledFootprints(text)) {
        if (s.tokens.size < DUP_MIN_SHARED) continue;
        if (s.base && cfg.registryNames.has(s.base)) continue; // styled(Card) extends it — fine
        const best = bestMatch(s.tokens);
        if (!best || namesComponent(s.name, best.comp.name)) continue;
        emit(s.tokens, best, 'styled component', `"${s.name}"`, s.index);
      }

      for (const e of jsxElementFootprints(text, allKeys)) {
        if (e.tokens.size < DUP_MIN_SHARED) continue;
        if (cfg.registryNames.has(e.name)) continue; // already a DS component instance
        const best = bestMatch(e.tokens);
        if (!best || namesComponent(e.name, best.comp.name) || classClaimsComponent(e.className, best.comp.name)) continue;
        emit(e.tokens, best, 'element', `<${e.name}>`, e.index);
      }
    }
  }

  return out;
}

export function maxSeverity(violations) {
  return violations.reduce((acc, v) => (SEV_RANK[v.severity] > SEV_RANK[acc] ? v.severity : acc), 'off');
}

export { SEV_RANK };
