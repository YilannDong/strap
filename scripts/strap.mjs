#!/usr/bin/env node
// Strap CLI — the enforcement engine behind the 4 skills.
//
//   strap validate <files...>   Validate specific files (exit 1 on error).
//   strap audit                 Validate the whole project against the DS.
//   strap check                 Hook mode: read a PostToolUse payload on stdin,
//                                validate the edited file, exit 2 to block on error.
//   strap init                  Scaffold strap.config.json + .strap/ artifacts.
//   strap sync                  Print the steps to refresh artifacts from Figma.
//
// Pure Node, zero dependencies.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative, extname } from 'node:path';
import { loadConfig, findProjectRoot } from './lib/config.mjs';
import { importDesignSystem } from './lib/import.mjs';
import { scanFile, maxSeverity, SEV_RANK } from './lib/scan.mjs';
import { formatFile, formatSummary } from './lib/report.mjs';

const cmd = process.argv[2];
const rest = process.argv.slice(3);

const VALID_EXT = new Set(['.js', '.jsx', '.ts', '.tsx', '.css', '.scss', '.sass', '.less', '.vue', '.svelte']);

function walk(dir, cfg, acc = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = relative(cfg.root, full);
    if (cfg.exclude.some((p) => rel.includes(p.replace(/\*\*?\//g, '').replace(/\/\*\*/g, '')) || name === 'node_modules')) {
      continue;
    }
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      if (name === 'node_modules' || name.startsWith('.git') || name === '.strap') continue;
      walk(full, cfg, acc);
    } else if (VALID_EXT.has(extname(name))) {
      acc.push(full);
    }
  }
  return acc;
}

function validateFiles(files, cfg) {
  const results = [];
  for (const f of files) {
    if (!existsSync(f) || !VALID_EXT.has(extname(f))) continue;
    let text;
    try { text = readFileSync(f, 'utf8'); } catch { continue; }
    const violations = scanFile(f, text, cfg);
    if (violations.length) results.push({ file: relative(cfg.root, f), violations });
  }
  return results;
}

function printResults(results) {
  for (const r of results) {
    const out = formatFile(r.file, r.violations);
    if (out) console.log(out + '\n');
  }
  const summary = formatSummary(results);
  console.log(summary.line);
  return summary;
}

// ---- check (hook mode) -------------------------------------------------------
function readStdin() {
  try { return readFileSync(0, 'utf8'); } catch { return ''; }
}

function checkHook() {
  const raw = readStdin();
  let payload = {};
  try { payload = JSON.parse(raw || '{}'); } catch { /* not JSON, ignore */ }
  const ti = payload.tool_input || {};
  const filePath = ti.file_path || ti.path || (rest[0] || '');
  if (!filePath) process.exit(0);
  let cfg;
  try { cfg = loadConfig(); } catch { process.exit(0); } // no strap project -> stay out of the way
  if (!VALID_EXT.has(extname(filePath)) || !existsSync(filePath)) process.exit(0);

  const text = readFileSync(filePath, 'utf8');
  const violations = scanFile(filePath, text, cfg);
  const errors = violations.filter((v) => v.severity === 'error');
  const warns = violations.filter((v) => v.severity === 'warn');

  if (!errors.length) {
    if (warns.length) console.error(`Strap: ${warns.length} off-spec warning(s) in ${relative(cfg.root, filePath)} — run \`strap audit\` to review.`);
    process.exit(0);
  }

  // Block: exit code 2 makes Claude Code surface stderr to the model for correction.
  const lines = [
    `⛔ Strap blocked this write — ${errors.length} Design System violation(s) in ${relative(cfg.root, filePath)}:`,
    '',
  ];
  for (const v of errors) {
    lines.push(`  ${v.line}:${v.col}  ${v.message}${v.fix ? `  → use: ${v.fix}` : ''}`);
  }
  lines.push('', 'Fix these to stay on DS rails: bind values to tokens (.strap/tokens.json) and use registry components (.strap/registry.json). Then re-apply the edit.');
  console.error(lines.join('\n'));
  process.exit(2);
}

// ---- init --------------------------------------------------------------------
function scaffold() {
  const root = process.cwd();
  const cfgPath = join(root, 'strap.config.json');
  if (!existsSync(cfgPath)) {
    writeFileSync(cfgPath, JSON.stringify({
      $schema: './.strap/config.schema.json',
      include: ['**/*.{js,jsx,ts,tsx,css,scss,vue,svelte}'],
      artifacts: '.strap',
      rules: {
        rawHex: 'error', rawRgb: 'error', rawFont: 'error',
        offScaleSpacing: 'warn', offScaleRadius: 'warn', unlinkedComponent: 'error',
      },
    }, null, 2) + '\n');
    console.log('created strap.config.json');
  }
  const art = join(root, '.strap');
  if (!existsSync(art)) mkdirSync(art, { recursive: true });
  const stub = (name, obj) => {
    const p = join(art, name);
    if (!existsSync(p)) { writeFileSync(p, JSON.stringify(obj, null, 2) + '\n'); console.log('created .strap/' + name); }
  };
  stub('tokens.json', { _note: 'Run `strap sync` (figma) to populate.', colors: {}, spacing: [], radius: [], fonts: [] });
  stub('registry.json', { _note: 'Component registry from your Figma library.', components: [] });
  stub('code-connect.json', { _note: 'Figma node <-> code component map.', map: {} });
  console.log('\nStrap initialized. Next: run the strap-preflight skill to populate artifacts from Figma.');
}

// ---- tokens (codegen) --------------------------------------------------------
// Emit CSS custom properties from .strap/tokens.json so code has real vars to bind to.
function tokenVarName(token) {
  return '--' + String(token)
    .replace(/([a-z])([A-Z])/g, '$1-$2')   // camelCase -> camel-Case
    .replace(/([a-zA-Z])(\d)/g, '$1-$2')    // letter|digit boundary: blue700 -> blue-700
    .replace(/[^a-zA-Z0-9]+/g, '-')          // slashes/spaces/parens -> dash
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function generateTokensCss(cfg) {
  const t = cfg.tokens;
  const lines = [':root {', '  /* generated by `strap tokens` from .strap/tokens.json — do not edit by hand */'];
  const group = (title, entries, fmt) => {
    const items = Object.entries(entries || {}).filter(([k]) => k !== '_note');
    if (!items.length) return;
    lines.push('', `  /* ${title} */`);
    for (const [name, value] of items) lines.push(`  ${fmt(name, value)}`);
  };

  group('color', t.colors, (name, hex) => `${tokenVarName(name)}: ${hex};`);

  // Optional Tier-2 semantic aliases (present only if the source defines them).
  const semColor = (t.semantic && t.semantic.color) || {};
  group('color — semantic (intent → primitive)', semColor,
    (name, primitive) => `${tokenVarName(name)}: var(${tokenVarName(primitive)});`);

  if ((t.spacing || []).length) {
    lines.push('', '  /* spacing (numeric scale) */');
    for (const px of t.spacing) lines.push(`  --space-${px}: ${px}px;`);
  }
  if ((t.radius || []).length) {
    lines.push('', '  /* radius (numeric scale) */');
    for (const px of t.radius) lines.push(`  --radius-${px >= 9999 ? 'full' : px}: ${px >= 9999 ? '9999px' : px + 'px'};`);
  }
  group('radius (named)', t.radiusNamed, (name, value) => `--radius-${tokenVarName(name).slice(2)}: ${value};`);
  group('elevation', t.shadows, (name, value) => `--shadow-${tokenVarName(name).slice(2)}: ${value};`);
  group('gradient', t.gradients, (name, value) => `--gradient-${tokenVarName(name).slice(2)}: ${value};`);
  group('motion', t.motion, (name, value) => `--motion-${tokenVarName(name).slice(2)}: ${value};`);
  group('type', t.fontStacks, (name, value) => `--font-${tokenVarName(name).slice(2)}: ${value};`);

  lines.push('}', '');
  return lines.join('\n');
}

function tokensCmd() {
  const cfg = loadConfig();
  const out = rest[0] ? resolve(rest[0]) : join(cfg.root, 'src/styles/tokens.css');
  const css = generateTokensCss(cfg);
  if (rest.includes('--stdout')) { process.stdout.write(css); return; }
  mkdirSync(join(out, '..'), { recursive: true });
  writeFileSync(out, css);
  console.log('wrote ' + relative(cfg.root, out) + ` (${Object.keys(cfg.tokens.colors || {}).length} colors, ${(cfg.tokens.spacing||[]).length} spacing, ${(cfg.tokens.radius||[]).length} radius)`);
}

function syncHelp() {
  console.log(`Strap sync — refresh .strap/ artifacts from your Figma library.

This is driven by the strap-preflight skill, which uses the Figma MCP:
  1. get_variable_defs      -> tokens.json   (colors, spacing, radius, fonts)
  2. get_libraries + search_design_system -> registry.json (components)
  3. get_code_connect_map   -> code-connect.json (figma node <-> code)

Run the skill, or wire these tools yourself, then validate with: strap audit

Full bidirectional runbook (pull + Code Connect link-back): docs/figma-roundtrip.md`);
}

// ---- dispatch ----------------------------------------------------------------
try {
  if (cmd === 'check') {
    checkHook();
  } else if (cmd === 'init') {
    scaffold();
  } else if (cmd === 'import') {
    const root = findProjectRoot() || process.cwd();
    const r = importDesignSystem(root, rest[0] ? resolve(rest[0]) : undefined);
    console.log(`Strap import: ${r.colorCount} colors, ${r.componentCount} components.`);
    console.log(`  spacing scale: [${r.spacing.join(', ')}]`);
    console.log(`  radius scale:  [${r.radius.join(', ')}]`);
    console.log('Next: `strap tokens` to regen CSS vars, then `strap audit`.');
  } else if (cmd === 'tokens') {
    tokensCmd();
  } else if (cmd === 'sync') {
    syncHelp();
  } else if (cmd === 'validate') {
    const cfg = loadConfig();
    const files = rest.map((f) => resolve(f));
    const results = validateFiles(files, cfg);
    const { errors } = printResults(results);
    process.exit(errors ? 1 : 0);
  } else if (cmd === 'audit') {
    const cfg = loadConfig();
    const files = walk(cfg.root, cfg);
    const results = validateFiles(files, cfg);
    const { errors } = printResults(results);
    process.exit(errors ? 1 : 0);
  } else {
    console.log(`Strap — Design System enforcement engine

Usage:
  strap init               Scaffold config + .strap/ artifacts
  strap import             Build tokens.json + registry.json from .strap/source/
  strap tokens [out]       Generate CSS variables from tokens.json (--stdout to print)
  strap sync               How to refresh artifacts from Figma
  strap validate <files>   Validate specific files
  strap audit              Validate the whole project
  strap check              Hook mode (reads PostToolUse payload on stdin)`);
    process.exit(0);
  }
} catch (e) {
  console.error('Strap: ' + e.message);
  process.exit(1);
}
