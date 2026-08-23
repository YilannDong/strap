// Strap HTML report: a shareable, visual view of the same findings the terminal
// prints. Pure + offline + zero-dependency, like the rest of the engine — it takes
// findings in and returns a self-contained HTML string.
//
// Thumbnails are optional. The engine can't talk to Figma, so the strap-figma-audit
// skill may drop PNGs in `.strap/figma-thumbs/<nodeId>.png`; the CLI passes them in
// as data URIs and the report embeds them. Without them the report still works.

const esc = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Actions offered per rule. The last entry is always a dismissal — a report you
 *  can't dismiss becomes noise people stop opening. */
const ACTIONS = {
  rawHex:                  [['bind', 'Bind to the token'], ['token', 'Add as a new token'], ['ignore', 'Ignore']],
  rawRgb:                  [['bind', 'Bind to the token'], ['token', 'Add as a new token'], ['ignore', 'Ignore']],
  rawFont:                 [['bind', 'Use the system font'], ['token', 'Add as a new font token'], ['ignore', 'Ignore']],
  offScaleSpacing:         [['bind', 'Snap to the scale'], ['token', 'Add this step'], ['ignore', 'Ignore']],
  offScaleRadius:          [['bind', 'Snap to the scale'], ['token', 'Add this step'], ['ignore', 'Ignore']],
  unlinkedComponent:       [['merge', 'Use the library component'], ['new', 'Register as new'], ['ignore', 'Ignore']],
  duplicateComponent:      [['merge', 'Merge into the existing one'], ['new', 'Create a new component'], ['ignore', 'Ignore']],
  figmaDuplicateComponent: [['merge', 'Merge into the component'], ['new', 'Create a new component'], ['ignore', "Ignore — it's intentional"]],
  figmaDuplicateFrame:     [['new', 'Componentize these'], ['merge', 'Merge into an existing one'], ['ignore', 'Ignore']],
};
const DEFAULT_ACTIONS = [['fix', 'Fix it'], ['ignore', 'Ignore']];

const SWATCH = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)/;

function actionsFor(rule) {
  return ACTIONS[rule] || DEFAULT_ACTIONS;
}

function findingRow(f, idx, thumbs) {
  const acts = actionsFor(f.rule);
  const swatch = (f.message.match(SWATCH) || [])[0];
  const thumb = f.nodeId && thumbs && thumbs[f.nodeId];
  return `<div class="f" data-id="${esc(f.key || `f${idx}`)}" data-rule="${esc(f.rule)}">
  <div class="fh">
    <span class="rule ${esc(f.severity)}">${esc(f.rule)}</span>
    <span class="loc">${esc(f.loc)}</span>
  </div>
  <div class="fb">
    ${thumb ? `<img class="thumb" src="${esc(thumb)}" alt="">` : ''}
    <div class="msg">${swatch ? `<span class="sw" style="background:${esc(swatch)}"></span>` : ''}${esc(f.message)}</div>
    ${f.fix ? `<div class="fix">→ ${esc(f.fix)}</div>` : ''}
  </div>
  <div class="fa">
    ${acts.map(([a, label]) => `<button data-a="${a}">${esc(label)}</button>`).join('')}
    <span class="state">no decision</span>
  </div>
</div>`;
}

/**
 * @param {object} input
 * @param {Array}  input.code    [{ file, violations:[{line,col,rule,severity,message,fix}] }]
 * @param {Array}  input.figma   [{ rule, severity, loc, message, fix }]
 * @param {object} [input.thumbs] nodeId -> data URI
 * @param {string} [input.project] label for the header
 * @returns {string} self-contained HTML
 */
export function renderHtmlReport({ code = [], figma = [], thumbs = {}, project = '' } = {}) {
  // Flatten code violations into the same finding shape the Figma radar uses, so
  // one renderer handles both surfaces.
  const codeFindings = [];
  for (const r of code) {
    for (const v of r.violations) {
      codeFindings.push({
        rule: v.rule, severity: v.severity, loc: `${r.file}:${v.line}:${v.col}`,
        message: v.message, fix: v.fix || null,
      });
    }
  }
  const figmaFindings = figma.map((v) => ({
    rule: v.rule, severity: v.severity, loc: v.loc, message: v.message,
    fix: v.fix || null, nodeId: (String(v.loc).match(/\(([\d:]+)\)/) || [])[1] || null,
  }));

  const all = [...figmaFindings, ...codeFindings].map((f, i) => ({ ...f, key: `f${i}` }));
  const errors = all.filter((f) => f.severity === 'error').length;
  const warns = all.filter((f) => f.severity === 'warn').length;

  // Group by rule so a hundred rawHex hits read as one decision, not a hundred.
  const groups = new Map();
  for (const f of all) {
    if (!groups.has(f.rule)) groups.set(f.rule, []);
    groups.get(f.rule).push(f);
  }

  const section = (title, blurb, list) => list.length ? `<h2>${esc(title)}</h2>
    <p class="lede">${esc(blurb)}</p>${list.join('')}` : '';

  const figmaHtml = [], codeHtml = [];
  for (const [rule, list] of groups) {
    const target = rule.startsWith('figma') ? figmaHtml : codeHtml;
    target.push(`<section class="grp">
      <div class="gh"><b>${esc(rule)}</b><span>${list.length} finding${list.length === 1 ? '' : 's'}</span></div>
      ${list.map((f, i) => findingRow(f, i, thumbs)).join('')}
    </section>`);
  }

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Strap drift report${project ? ` · ${esc(project)}` : ''}</title>
<style>
 :root{--ink:#111827;--muted:#6B7280;--line:#E5E7EB;--bg:#F7F8FA;--paper:#fff;
   --blue:#2D6CF0;--blue-d:#1D4ED8;--warn:#FBBF24;--warnbg:#FEF6E0;--err:#EF4444;--errbg:#FDECEC;
   --sans:'Inter',-apple-system,system-ui,sans-serif;--mono:'JetBrains Mono',ui-monospace,monospace}
 *{box-sizing:border-box;margin:0;padding:0}
 body{background:var(--bg);color:var(--ink);font-family:var(--sans);line-height:1.55;padding-bottom:80px}
 header{background:var(--paper);border-bottom:1px solid var(--line);padding:18px 28px;position:sticky;top:0;z-index:5}
 .hd{max-width:1020px;margin:0 auto;display:flex;align-items:baseline;gap:14px;flex-wrap:wrap}
 h1{font-size:19px;font-weight:700}
 .sub{font-family:var(--mono);font-size:12px;color:var(--muted)}
 .counts{margin-left:auto;display:flex;gap:7px}
 .pill{font-family:var(--mono);font-size:11.5px;padding:3px 9px;border-radius:999px;background:var(--warnbg);color:#8A5E14}
 .pill.err{background:var(--errbg);color:#9B1C1C}
 main{max-width:1020px;margin:0 auto;padding:28px}
 h2{font-size:16px;font-weight:700;margin:26px 0 3px}h2:first-child{margin-top:0}
 .lede{color:var(--muted);font-size:13.5px;margin-bottom:14px}
 .grp{background:var(--paper);border:1px solid var(--line);border-radius:12px;margin:0 0 14px;overflow:hidden}
 .gh{display:flex;gap:10px;align-items:baseline;padding:11px 16px;border-bottom:1px solid var(--line);background:#FCFCFD}
 .gh b{font-family:var(--mono);font-size:12.5px}
 .gh span{font-size:12px;color:var(--muted)}
 .f{border-bottom:1px solid var(--line)}.f:last-child{border-bottom:0}
 .fh{display:flex;gap:10px;align-items:center;padding:11px 16px 0;flex-wrap:wrap}
 .rule{font-family:var(--mono);font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;
   padding:2px 7px;border-radius:5px;background:var(--warnbg);color:#8A5E14}
 .rule.error{background:var(--errbg);color:#9B1C1C}
 .loc{font-family:var(--mono);font-size:12px;color:var(--muted)}
 .fb{padding:7px 16px 11px;display:flex;gap:12px;align-items:flex-start}
 .thumb{width:132px;border:1px solid var(--line);border-radius:7px;flex-shrink:0}
 .msg{font-size:13.5px}
 .sw{display:inline-block;width:12px;height:12px;border-radius:3px;vertical-align:-1px;
   margin-right:6px;border:1px solid rgba(0,0,0,.12)}
 .fix{font-family:var(--mono);font-size:12px;color:var(--blue-d);margin-top:4px}
 .fa{display:flex;gap:7px;padding:0 16px 12px;flex-wrap:wrap;align-items:center}
 .fa button{font:inherit;font-size:12.5px;padding:6px 12px;border-radius:7px;border:1px solid var(--line);
   background:#fff;cursor:pointer}
 .fa button:hover{border-color:var(--blue)}
 .fa button.sel{background:var(--blue);border-color:transparent;color:#fff}
 .state{font-family:var(--mono);font-size:11.5px;color:var(--muted);margin-left:auto}
 .none{background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:28px;text-align:center;color:var(--muted)}
 #bar{position:fixed;left:0;right:0;bottom:0;background:var(--ink);color:#E5E7EB;
   padding:11px 28px;display:flex;align-items:center;gap:14px;font-family:var(--mono);font-size:12.5px}
 #bar button{margin-left:auto;background:var(--blue);color:#fff;border:0;border-radius:8px;
   padding:8px 16px;font-family:var(--sans);font-size:13px;cursor:pointer}
 dialog{border:0;border-radius:12px;padding:0;max-width:620px;width:92vw}
 dialog .dh{padding:14px 18px;border-bottom:1px solid var(--line);font-weight:600}
 dialog pre{font-family:var(--mono);font-size:12px;padding:18px;white-space:pre-wrap;max-height:58vh;overflow:auto}
 dialog .df{padding:12px 18px;border-top:1px solid var(--line);display:flex;gap:9px;justify-content:flex-end}
 dialog button{font:inherit;padding:7px 14px;border-radius:8px;border:1px solid var(--line);background:#fff;cursor:pointer}
</style></head><body>
<header><div class="hd">
  <h1>Strap drift report</h1>
  ${project ? `<span class="sub">${esc(project)}</span>` : ''}
  <div class="counts">
    ${errors ? `<span class="pill err">${errors} error${errors === 1 ? '' : 's'}</span>` : ''}
    <span class="pill">${warns} warning${warns === 1 ? '' : 's'}</span>
  </div>
</div></header>
<main>
${all.length ? '' : '<div class="none">No drift found. Code and canvas agree.</div>'}
${section('Figma drifted from code', 'Raw frames that match a component you already have, or repeated frames that should be one.', figmaHtml)}
${section('Code drifted from its tokens', 'Literals in source where a token exists, or values with no token at all.', codeHtml)}
</main>
${all.length ? `<div id="bar"><span id="tally">0 of ${all.length} decided</span>
  <button id="emit">Copy decisions for Claude Code</button></div>
<dialog id="dlg"><div class="dh">Paste this into Claude Code</div><pre id="out"></pre>
  <div class="df"><button id="copy">Copy</button><button id="close">Close</button></div></dialog>
<script>
const D = {}, TOTAL = ${all.length};
const LABEL = { bind:'bind to the existing token', token:'add as a new token',
  merge:'merge into the existing component', new:'create a new component',
  fix:'fix it', ignore:'ignore' };
document.querySelectorAll('.f').forEach((f) => {
  f.querySelectorAll('.fa button').forEach((b) => {
    b.onclick = () => {
      f.querySelectorAll('.fa button').forEach((x) => x.classList.remove('sel'));
      b.classList.add('sel');
      D[f.dataset.id] = { rule: f.dataset.rule, action: b.dataset.a,
        loc: f.querySelector('.loc').textContent };
      f.querySelector('.state').textContent = LABEL[b.dataset.a];
      document.getElementById('tally').textContent =
        Object.keys(D).length + ' of ' + TOTAL + ' decided';
    };
  });
});
document.getElementById('emit').onclick = () => {
  const ds = Object.values(D);
  document.getElementById('out').textContent = ds.length
    ? ['Strap drift decisions', '',
       ...ds.map((d) => '- [' + d.rule + '] ' + d.loc + ' → ' + LABEL[d.action]),
       '', 'Apply these. Show me a diff before writing anything, and for any Figma',
       'change show the frame first.'].join('\\n')
    : 'No decisions recorded yet.';
  document.getElementById('dlg').showModal();
};
document.getElementById('copy').onclick = () =>
  navigator.clipboard && navigator.clipboard.writeText(document.getElementById('out').textContent);
document.getElementById('close').onclick = () => document.getElementById('dlg').close();
</script>` : ''}
</body></html>`;
}
