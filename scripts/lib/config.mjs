// Straps config + design-system artifact loader.
// Pure Node, zero dependencies. ESM.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const CONFIG_NAMES = ['straps.config.json', '.strapsrc.json'];

/** Walk up from `start` until a straps config is found. Returns project root or null. */
export function findProjectRoot(start = process.cwd()) {
  let dir = resolve(start);
  while (true) {
    for (const name of CONFIG_NAMES) {
      if (existsSync(join(dir, name))) return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function readJSON(path, fallback) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new Error(`Straps: could not parse ${path}: ${e.message}`);
  }
}

const DEFAULTS = {
  // Files the validator inspects.
  include: ['**/*.{js,jsx,ts,tsx,css,scss,vue,svelte}'],
  exclude: ['**/node_modules/**', '**/.straps/**', '**/dist/**', '**/build/**'],
  // Where the cached design-system artifacts live (built by `straps sync`).
  artifacts: '.straps',
  rules: {
    rawHex: 'error', // #fff / #ffffff literals not mapped to a token
    rawRgb: 'error', // rgb()/rgba() literals
    rawFont: 'error', // font-family values outside the allowed set
    offScaleSpacing: 'warn', // px values not on the spacing scale
    offScaleRadius: 'warn', // border-radius values not on the radius scale
    unlinkedComponent: 'error', // JSX element that shadows a registry component
  },
  // Values that are always allowed even if they look "raw".
  allow: {
    colors: ['transparent', 'currentColor', 'inherit', 'none', '#000', '#000000', '#fff', '#ffffff'],
    spacingPx: [0, 1], // hairlines + zero are fine everywhere
  },
};

/** Deep-ish merge of two plain objects (one level of nesting for rules/allow). */
function merge(base, over) {
  const out = { ...base, ...over };
  for (const k of ['rules', 'allow']) {
    out[k] = { ...base[k], ...(over[k] || {}) };
  }
  return out;
}

export function loadConfig(root) {
  const projectRoot = root || findProjectRoot();
  if (!projectRoot) {
    throw new Error(
      'Straps: no straps.config.json found. Run the straps-preflight skill or `straps init` first.'
    );
  }
  let userCfg = {};
  for (const name of CONFIG_NAMES) {
    const p = join(projectRoot, name);
    if (existsSync(p)) {
      userCfg = readJSON(p, {});
      break;
    }
  }
  const cfg = merge(DEFAULTS, userCfg);
  cfg.root = projectRoot;
  cfg.artifactsDir = resolve(projectRoot, cfg.artifacts);

  // Load the design-system artifacts produced by `straps sync`.
  cfg.tokens = readJSON(join(cfg.artifactsDir, 'tokens.json'), {
    colors: {},
    spacing: [],
    radius: [],
    fonts: [],
  });
  cfg.registry = readJSON(join(cfg.artifactsDir, 'registry.json'), { components: [] });
  cfg.codeConnect = readJSON(join(cfg.artifactsDir, 'code-connect.json'), { map: {} });

  // Index primitive colors by normalized hex for fast lookup.
  cfg.colorByHex = new Map();
  for (const [token, value] of Object.entries(cfg.tokens.colors || {})) {
    // First declaration of a hex wins, so a top-level token beats a later nested duplicate.
    if (typeof value === 'string' && value.startsWith('#') && !cfg.colorByHex.has(normalizeHex(value))) {
      cfg.colorByHex.set(normalizeHex(value), token);
    }
  }

  // Tier-2 semantic tokens alias primitives by name. Build name->primitive and reverse,
  // plus a per-hex "preferred suggestion" that favors a semantic token over a bare primitive
  // (best practice: components bind to semantic intent, not raw palette steps).
  cfg.semantic = (cfg.tokens.semantic && cfg.tokens.semantic.color) || {};
  cfg.semanticByPrimitive = new Map();
  for (const [sName, pName] of Object.entries(cfg.semantic)) {
    if (sName === '_note') continue;
    if (!cfg.semanticByPrimitive.has(pName)) cfg.semanticByPrimitive.set(pName, sName);
  }
  cfg.suggestByHex = new Map();
  for (const [hex, pName] of cfg.colorByHex) {
    cfg.suggestByHex.set(hex, cfg.semanticByPrimitive.get(pName) || pName);
  }
  cfg.spacingSet = new Set((cfg.tokens.spacing || []).map(Number));
  cfg.radiusSet = new Set((cfg.tokens.radius || []).map(Number));
  cfg.fontSet = new Set((cfg.tokens.fonts || []).map((f) => f.toLowerCase()));
  cfg.registryNames = new Set((cfg.registry.components || []).map((c) => c.name));

  // Map component name -> its declared source file (from Code Connect or registry),
  // so a component's own definition file is never flagged as "shadowing" itself.
  cfg.sourceByName = new Map();
  for (const v of Object.values(cfg.codeConnect.map || {})) {
    if (v && v.name && v.source) cfg.sourceByName.set(v.name, v.source);
  }
  for (const c of cfg.registry.components || []) {
    if (c.name && c.source && !cfg.sourceByName.has(c.name)) cfg.sourceByName.set(c.name, c.source);
  }
  return cfg;
}

export function normalizeHex(hex) {
  let h = String(hex).trim().toLowerCase();
  if (!h.startsWith('#')) return h;
  h = h.slice(1);
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length === 4) h = h.split('').map((c) => c + c).join(''); // #rgba
  return '#' + h;
}

export { DEFAULTS };
