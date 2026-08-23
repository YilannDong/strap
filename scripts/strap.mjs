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
import { join, resolve, relative, extname, dirname, basename } from 'node:path';
import { loadConfig, findProjectRoot } from './lib/config.mjs';
import { importDesignSystem } from './lib/import.mjs';
import { scanFile, maxSeverity, SEV_RANK } from './lib/scan.mjs';
import { auditFrames } from './lib/figma.mjs';
import { evaluate, resolveCodeName } from './lib/evaluate.mjs';
import { scaffoldComponent } from './lib/scaffold.mjs';
import { isGitRepo, lastUsedDate, recentUses, changedSince } from './lib/git.mjs';
import { formatFile, formatSummary, formatFigmaFindings, formatEvaluation, formatEvaluationMarkdown } from './lib/report.mjs';
import { renderHtmlReport } from './lib/html-report.mjs';
import { planMerge, formatMergePlan } from './lib/merge.mjs';

const cmd = process.argv[2];
const rest = process.argv.slice(3);

// `--flag value` lookup, shared by every subcommand.
const flag = (n) => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : null; };

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

// --html <path>: write the visual report next to the terminal output. Thumbnails are
// picked up from .strap/figma-thumbs/<nodeId>.png when the figma-audit skill left them.
function writeHtmlReport(cfg, { code = [], figma = [] }, outPath) {
  const thumbs = {};
  const dir = resolve(cfg.artifacts || resolve(cfg.root, '.strap'), 'figma-thumbs');
  if (existsSync(dir)) {
    for (const f of readdirSync(dir)) {
      if (!/\.(png|jpg|jpeg)$/i.test(f)) continue;
      const id = f.replace(/\.[^.]+$/, '').replace(/-/g, ':');
      const mime = /\.png$/i.test(f) ? 'image/png' : 'image/jpeg';
      thumbs[id] = `data:${mime};base64,${readFileSync(resolve(dir, f)).toString('base64')}`;
    }
  }
  const html = renderHtmlReport({ code, figma, thumbs, project: basename(cfg.root) });
  const target = resolve(cfg.root, outPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, html);
  console.log(`Strap: wrote ${relative(cfg.root, target)} (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB)`);
}

// ---- merge (plan only) -------------------------------------------------------
// Decides WHAT a merge would do and writes it to .strap/merge-plan.json. Applying it
// is the strap-figma-merge skill's job — the engine never touches the canvas.
function mergeCmd() {
  const cfg = loadConfig();
  const frameId = rest.find((a) => !a.startsWith('--'));
  const into = flag('--into');
  if (!frameId || !into) {
    console.error('Usage: strap merge <frameId> --into "<Component>" [--out <path>]');
    process.exit(1);
  }
  const snapPath = join(cfg.artifactsDir, 'figma-frames.json');
  if (!existsSync(snapPath)) {
    console.error(`Strap: no frame snapshot at ${relative(cfg.root, snapPath)}.\n` +
      `Run the strap-figma-audit skill first.`);
    process.exit(1);
  }
  const snap = JSON.parse(readFileSync(snapPath, 'utf8'));
  const frames = Array.isArray(snap) ? snap : (snap.frames || []);
  const frame = frames.find((f) => f.id === frameId);
  if (!frame) {
    console.error(`Strap: no frame "${frameId}" in the snapshot. Known ids: ${frames.map((f) => f.id).join(', ') || '(none)'}`);
    process.exit(1);
  }
  const components = (cfg.registry && cfg.registry.components) || [];
  const component = components.find((c) => c.name.toLowerCase() === String(into).toLowerCase());
  if (!component) {
    console.error(`Strap: no component "${into}" in the registry. Known: ${components.map((c) => c.name).join(', ') || '(none)'}`);
    process.exit(1);
  }
  const plan = planMerge({ frame, component });
  console.log(formatMergePlan(plan));
  const out = resolve(cfg.root, flag('--out') || join(cfg.artifactsDir, 'merge-plan.json'));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(plan, null, 2) + '\n');
  console.log(`\n  plan written to ${relative(cfg.root, out)}`);
  process.exit(0);
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

// ---- figma-audit -------------------------------------------------------------
// Duplicate radar for the Figma canvas. Reads a frame snapshot (written by the
// strap-figma-audit skill via the Figma MCP) and reports look-alike / duplicate
// frames. Default snapshot: .strap/figma-frames.json.
function figmaAuditCmd() {
  const cfg = loadConfig();
  // Positional snapshot path — skip flags and their values so `figma-audit --html x`
  // doesn't mistake "--html" for the snapshot.
  const FLAGS_WITH_VALUE = new Set(['--html']);
  const positional = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith('--')) { if (FLAGS_WITH_VALUE.has(rest[i])) i++; continue; }
    positional.push(rest[i]);
  }
  const snapPath = positional[0] ? resolve(positional[0]) : join(cfg.artifactsDir, 'figma-frames.json');
  if (!existsSync(snapPath)) {
    console.error(`Strap: no frame snapshot at ${relative(cfg.root, snapPath)}.\n` +
      `Run the strap-figma-audit skill first (it walks Figma via the MCP and writes it).`);
    process.exit(1);
  }
  let snap;
  try { snap = JSON.parse(readFileSync(snapPath, 'utf8')); } catch (e) {
    console.error(`Strap: could not parse ${relative(cfg.root, snapPath)}: ${e.message}`);
    process.exit(1);
  }
  const frames = Array.isArray(snap) ? snap : (snap.frames || []);
  const findings = auditFrames(frames, cfg);
  const out = formatFigmaFindings(findings);
  if (out) console.log(out + '\n');
  const htmlOut = flag('--html');
  if (htmlOut) writeHtmlReport(cfg, { code: [], figma: findings }, htmlOut);
  const errors = findings.filter((v) => v.severity === 'error').length;
  const warns = findings.filter((v) => v.severity === 'warn').length;
  const parts = [
    errors ? `${errors} error${errors === 1 ? '' : 's'}` : '0 errors',
    warns ? `${warns} warning${warns === 1 ? '' : 's'}` : '0 warnings',
  ];
  console.log(`Strap Figma QA: ${parts.join(', ')} across ${frames.length} frame(s).`);
  process.exit(errors ? 1 : 0);
}

// ---- evaluate ----------------------------------------------------------------
// Component-lifecycle radar: proposes promotions (recurring patterns → components)
// and retirements (barely-used components). Advisory — always exits 0.
function evaluateCmd() {
  const cfg = loadConfig();
  const files = walk(cfg.root, cfg)
    .map((f) => { try { return { path: relative(cfg.root, f), text: readFileSync(f, 'utf8') }; } catch { return null; } })
    .filter(Boolean);

  const figIdx = rest.indexOf('--figma');
  const snapPath = figIdx >= 0
    ? (rest[figIdx + 1] ? resolve(rest[figIdx + 1]) : null)
    : join(cfg.artifactsDir, 'figma-frames.json');
  let frames = [];
  if (snapPath && existsSync(snapPath)) {
    try { const snap = JSON.parse(readFileSync(snapPath, 'utf8')); frames = Array.isArray(snap) ? snap : (snap.frames || []); }
    catch { console.error(`Strap: could not parse ${relative(cfg.root, snapPath)} — skipping Figma frames.`); }
  }

  // Temporal axis: date each component's last usage from git history (impure —
  // done here, passed into the pure engine).
  const components = (cfg.registry.components) || [];
  const gitOn = isGitRepo(cfg.root);
  const windowMonths = (cfg.evaluate && cfg.evaluate.windowMonths) || 6;
  const sinceIso = new Date(Date.now() - windowMonths * 30.44 * 24 * 3600 * 1000).toISOString();
  const componentDates = {};
  const componentWindowUses = {};
  if (gitOn) for (const c of components) {
    const codeName = resolveCodeName(c, cfg);
    componentDates[c.name] = lastUsedDate(codeName, cfg.root);
    componentWindowUses[c.name] = recentUses(codeName, sinceIso, cfg.root);
  }

  // --since <ref>: scope the search for NEW patterns to what shipped this sprint.
  const sinceIdx = rest.indexOf('--since');
  let shippedPaths = null;
  if (sinceIdx >= 0 && rest[sinceIdx + 1]) {
    const changed = gitOn ? changedSince(rest[sinceIdx + 1], cfg.root) : null;
    if (changed) shippedPaths = new Set(changed);
    else console.error(`Strap: could not resolve --since ${rest[sinceIdx + 1]} — scanning the whole tree.`);
  }

  const result = evaluate(files, frames, cfg, { componentDates, componentWindowUses, now: Date.now(), shippedPaths });

  if (rest.includes('--md')) {
    console.log(formatEvaluationMarkdown(result));
    process.exit(0);
  }
  console.log(formatEvaluation(result));
  console.log('');
  const scope = shippedPaths ? `${shippedPaths.size} shipped file(s)` : `${files.length} file(s)`;
  console.log(`Scanned ${scope}${frames.length ? ` + ${frames.length} Figma frame(s)` : ''}.` +
    (gitOn ? '' : ' (not a git repo — recency unavailable)'));
  process.exit(0);
}

// ---- scaffold ----------------------------------------------------------------
// Turn an approved promotion proposal into a token-bound STARTER component.
// Creates new files only — never edits call-sites or deletes anything.
function scaffoldCmd() {
  const cfg = loadConfig();
  const name = rest.find((a) => !a.startsWith('--'));
  const tokensArg = flag('--tokens');
  if (!name || !tokensArg) {
    console.error('Usage: strap scaffold <Name> --tokens color.line,color.white,radius.card [--out <dir>] [--register]');
    process.exit(1);
  }
  const tokens = tokensArg.split(',').map((s) => s.trim()).filter(Boolean);
  const outDir = resolve(cfg.root, flag('--out') || 'src/components');

  const built = scaffoldComponent(name, tokens);
  mkdirSync(outDir, { recursive: true });
  const written = [];
  for (const f of built.files) {
    const p = join(outDir, `${built.name}.${f.ext}`);
    if (existsSync(p)) { console.error(`Strap: ${relative(cfg.root, p)} already exists — refusing to overwrite.`); process.exit(1); }
    writeFileSync(p, f.content);
    written.push(relative(cfg.root, p));
  }

  if (rest.includes('--register')) {
    const regPath = join(cfg.artifactsDir, 'registry.json');
    const reg = existsSync(regPath) ? JSON.parse(readFileSync(regPath, 'utf8')) : { components: [] };
    reg.components = reg.components || [];
    const src = `${relative(cfg.root, outDir)}/${built.name}.tsx`;
    reg.components.push({ name: built.name, element: 'div', source: src, import: `import { ${built.name} } from '${src.replace(/^src\//, '@/').replace(/\.tsx$/, '')}'`, consumes: built.consumes });
    writeFileSync(regPath, JSON.stringify(reg, null, 2) + '\n');
    written.push(relative(cfg.root, regPath) + ' (registered)');
  }

  console.log(`Scaffolded "${built.name}" — a token-bound starting point:`);
  for (const w of written) console.log('  + ' + w);
  console.log('\nNext: refine the markup/props, then `node scripts/strap.mjs validate ' + written[0] + '` to confirm it stays on-spec.');
  process.exit(0);
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
  } else if (cmd === 'figma-audit') {
    figmaAuditCmd();
  } else if (cmd === 'evaluate') {
    evaluateCmd();
  } else if (cmd === 'scaffold') {
    scaffoldCmd();
  } else if (cmd === 'merge') {
    mergeCmd();
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
    const html = flag('--html');
    if (html) {
      // Fold in the canvas findings when a snapshot is present, so one report
      // covers both surfaces rather than making the user run two commands.
      let figma = [];
      const snapPath = resolve(cfg.artifacts || resolve(cfg.root, '.strap'), 'figma-frames.json');
      if (existsSync(snapPath)) {
        try {
          const snap = JSON.parse(readFileSync(snapPath, 'utf8'));
          figma = auditFrames(Array.isArray(snap) ? snap : (snap.frames || []), cfg);
        } catch { /* a broken snapshot must not fail the code audit */ }
      }
      writeHtmlReport(cfg, { code: results, figma }, html);
    }
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
  strap figma-audit [snap] Duplicate radar for the Figma canvas (.strap/figma-frames.json)
  strap evaluate [opts]    Component-lifecycle radar: propose promotions + retirements
                           opts: --figma <snap>  --since <ref> (scope to what shipped)  --md
  strap merge <frameId> --into "<Component>"  Plan a canvas merge (writes .strap/merge-plan.json;
                           applying it is the strap-figma-merge skill's job)
  strap scaffold <Name> --tokens <list>  Generate a token-bound starter component from a proposal
                           opts: --out <dir> (default src/components)  --register
  strap check              Hook mode (reads PostToolUse payload on stdin)`);
    process.exit(0);
  }
} catch (e) {
  console.error('Strap: ' + e.message);
  process.exit(1);
}
