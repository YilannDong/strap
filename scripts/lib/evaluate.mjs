// Strap evaluate: the component-lifecycle radar (v1, counts-only).
// Given the shipped code + an optional Figma frame snapshot + the registry, it
// PROPOSES two lifecycle moves — the human decides:
//   • promotion  — a token-footprint pattern that recurs but isn't a component yet
//   • retirement — a registry component that's barely used
// Pure + offline: the command gathers inputs, this just analyzes. Advisory only.
import { canonFromConsumes, matchFootprint, DUP_MIN_CONSUMES } from './fingerprint.mjs';
import { cssRuleFootprints, jsxElementFootprints, styledFootprints, locate } from './scan.mjs';

const DEFAULTS = { promoteMin: 3, retireMax: 1, minFootprint: 3, staleMonths: 6 };
const opts = (cfg) => ({ ...DEFAULTS, ...((cfg && cfg.evaluate) || {}) });

const pascal = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const MS_PER_MONTH = 30.44 * 24 * 3600 * 1000;
function monthsAgo(iso, now) {
  const t = Date.parse(iso);
  if (Number.isNaN(t) || !now) return null;
  return Math.max(0, (now - t) / MS_PER_MONTH);
}

// Resolve a registry component's code name (prefer Code Connect, else PascalCase).
// PascalCase names never collide with HTML tags, so `<Name` counting is safe.
export function resolveCodeName(comp, cfg) {
  const ccNames = Object.values((cfg.codeConnect && cfg.codeConnect.map) || {})
    .map((v) => v && v.name).filter(Boolean);
  return ccNames.find((n) => n.toLowerCase() === comp.name.toLowerCase()) || pascal(comp.name);
}

// Every token-footprint "unit" a file contributes (CSS rules + JSX elements + styled).
function codeUnitsFromFile(relPath, text, allKeys) {
  const units = [];
  const isStyle = /\.(css|scss|sass|less)$/.test(relPath);
  const isJsx = /\.(jsx|tsx|vue|svelte)$/.test(relPath);
  const at = (index) => `${relPath}:${locate(text, index).line}`;
  if (isStyle) for (const r of cssRuleFootprints(text)) units.push({ tokens: r.tokens, label: at(r.index) });
  if (isJsx) {
    for (const e of jsxElementFootprints(text, allKeys)) units.push({ tokens: e.tokens, label: at(e.index) });
    for (const s of styledFootprints(text)) if (s.tokens.size) units.push({ tokens: s.tokens, label: at(s.index) });
  }
  return units;
}

// Count code usages of a component: <Name …>, <Name/>, styled(Name).
function countCodeUsage(name, files) {
  const useRe = new RegExp(`<${esc(name)}(?=[\\s/>])|styled\\(\\s*${esc(name)}\\s*\\)`, 'g');
  let count = 0; const sites = [];
  for (const f of files) {
    let m; useRe.lastIndex = 0;
    while ((m = useRe.exec(f.text))) { count++; sites.push(`${f.path}:${locate(f.text, m.index).line}`); }
  }
  return { count, sites };
}

/**
 * @param {Array<{path:string,text:string}>} files  the shipped code corpus
 * @param {Array} frames  optional Figma frame snapshot (see .strap/figma-frames.json)
 * @param {object} cfg     loaded Strap config (uses cfg.registry, cfg.codeConnect, cfg.evaluate)
 * @param {{componentDates?:Object, now?:number}} extra  optional git recency: registry-name → ISO
 *        last-used date, plus a `now` timestamp. Passed in (not read) so evaluate stays pure.
 * @returns {{promotions:Array, retirements:Array}}
 */
export function evaluate(files, frames, cfg, extra = {}) {
  const o = opts(cfg);
  const components = (cfg.registry && cfg.registry.components) || [];
  const footprints = components
    .map((c) => ({ comp: c, keys: new Set((c.consumes || []).map(canonFromConsumes).filter(Boolean)) }))
    .filter((f) => f.keys.size >= DUP_MIN_CONSUMES);
  const allKeys = new Set();
  for (const f of footprints) for (const k of f.keys) allKeys.add(k);
  const matchesComponent = (used) => footprints.some((f) => matchFootprint(used, f.keys).isMatch);

  // ---- Promotion: recurring footprints that aren't already a component ----
  const codeUnits = [];
  for (const f of files || []) codeUnits.push(...codeUnitsFromFile(f.path, f.text, allKeys));
  const frameUnits = (frames || [])
    .filter((fr) => String(fr.type || 'FRAME').toUpperCase() === 'FRAME') // instances aren't "new patterns"
    .map((fr) => ({
      tokens: new Set((fr.tokens || []).map(canonFromConsumes).filter(Boolean)),
      label: `Figma "${fr.name}" (${fr.id})`,
    }));

  const groups = new Map();
  for (const u of [...codeUnits, ...frameUnits]) {
    if (u.tokens.size < o.minFootprint) continue;
    if (matchesComponent(u.tokens)) continue; // "use the existing component" is the duplicate radar's job
    const key = [...u.tokens].sort().join('|');
    if (!groups.has(key)) groups.set(key, { tokens: [...u.tokens].sort(), sites: [] });
    groups.get(key).sites.push(u.label);
  }
  const promotions = [];
  for (const g of groups.values()) {
    if (g.sites.length >= o.promoteMin) promotions.push({ tokens: g.tokens, count: g.sites.length, sites: g.sites });
  }
  promotions.sort((a, b) => b.count - a.count);

  // ---- Retirement: barely-used OR stale registry components ----
  // A candidate is low-use (<= retireMax total usages) OR stale (last used longer
  // ago than staleMonths) — the temporal axis catches "still there but nobody's
  // touched it in months." Recency comes from git via `extra.componentDates`.
  const dates = extra.componentDates || {};
  const now = extra.now || null;
  const retirements = [];
  for (const comp of components) {
    const codeName = resolveCodeName(comp, cfg);
    const code = countCodeUsage(codeName, files || []);
    const nameRe = new RegExp(`\\b${esc(comp.name)}\\b`, 'i');
    const figma = (frames || []).filter(
      (fr) => String(fr.type || '').toUpperCase() === 'INSTANCE' && nameRe.test(fr.name || '')
    ).length;
    const total = code.count + figma;
    const ageMonths = monthsAgo(dates[comp.name], now);
    const lowUse = total <= o.retireMax;
    const stale = ageMonths != null && ageMonths >= o.staleMonths;
    if (lowUse || stale) {
      retirements.push({
        name: comp.name, codeName, total, code: code.count, figma,
        sites: code.sites, sawFigma: (frames || []).length > 0,
        lastUsed: dates[comp.name] || null, ageMonths, lowUse, stale,
      });
    }
  }
  // Oldest/least-used first: stale before low-use, then by age, then by count.
  retirements.sort((a, b) => (b.ageMonths || 0) - (a.ageMonths || 0) || a.total - b.total);

  return { promotions, retirements };
}
