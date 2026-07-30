// Human + machine readable reporting for Strap.
const C = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

const TAG = { error: C.red('error'), warn: C.yellow(' warn'), off: C.dim('  off') };

/** Pretty-print one file's violations to a string. */
export function formatFile(filePath, violations) {
  if (!violations.length) return '';
  const lines = [C.bold(filePath)];
  for (const v of violations) {
    const loc = C.dim(`${v.line}:${v.col}`.padEnd(7));
    const fix = v.fix ? C.green(`  → ${v.fix}`) : '';
    lines.push(`  ${loc} ${TAG[v.severity]}  ${v.message}${fix}  ${C.dim(v.rule)}`);
  }
  return lines.join('\n');
}

/** Pretty-print Figma-radar findings (frame-located, no line:col). */
export function formatFigmaFindings(findings) {
  if (!findings.length) return '';
  const lines = [C.bold('Figma canvas')];
  for (const v of findings) {
    const fix = v.fix ? C.green(`  → ${v.fix}`) : '';
    lines.push(`  ${TAG[v.severity]}  ${C.dim(v.loc)}  ${v.message}${fix}  ${C.dim(v.rule)}`);
  }
  return lines.join('\n');
}

/** Pretty-print the component-lifecycle report from `evaluate()`. */
export function formatEvaluation(result) {
  const { promotions, retirements } = result;
  const lines = [C.bold('Component lifecycle report'), ''];

  lines.push(C.bold('Promotion candidates') + C.dim(' — recurring patterns not yet components:'));
  if (!promotions.length) lines.push('  ' + C.dim('none'));
  for (const p of promotions) {
    const more = p.sites.length > 4 ? `, +${p.sites.length - 4} more` : '';
    lines.push(`  ${C.yellow('●')} ${C.bold(p.count + '×')}  {${p.tokens.join(', ')}}`);
    lines.push(`      ${C.dim(p.sites.slice(0, 4).join(', ') + more)}  ${C.green('→ promote to a component?')}`);
  }
  lines.push('');

  lines.push(C.bold('Retirement candidates') + C.dim(' — barely-used or stale components:'));
  if (!retirements.length) lines.push('  ' + C.dim('none'));
  for (const r of retirements) {
    const src = `code: ${r.code}` + (r.sawFigma ? `, figma: ${r.figma}` : '');
    let recency;
    if (r.ageMonths == null) recency = 'recency n/a';
    else if (r.ageMonths < 1) recency = 'used this month';
    else recency = `last used ~${Math.round(r.ageMonths)}mo ago`;
    const flag = r.stale && !r.lowUse ? C.yellow(' [stale]') : '';
    lines.push(`  ${C.yellow('●')} ${C.bold(r.name)}  ${r.total} use${r.total === 1 ? '' : 's'} ${C.dim('(' + src + ')')}  ${C.dim(recency)}${flag}  ${C.green('→ retire?')}`);
  }
  lines.push('');
  lines.push(`${promotions.length} promotion, ${retirements.length} retirement candidate(s). ${C.dim('Strap proposes — you decide.')}`);
  return lines.join('\n');
}

/** Markdown version of the lifecycle report — for CI job summaries / PR comments. */
export function formatEvaluationMarkdown(result) {
  const { promotions, retirements } = result;
  const recency = (r) =>
    r.ageMonths == null ? 'recency n/a' : r.ageMonths < 1 ? 'used this month' : `last used ~${Math.round(r.ageMonths)}mo ago`;
  const out = ['## Component lifecycle report', ''];

  out.push('### Promotion candidates', '_Recurring patterns not yet components:_', '');
  if (!promotions.length) out.push('_none_', '');
  for (const p of promotions) {
    const more = p.sites.length > 5 ? ` _(+${p.sites.length - 5} more)_` : '';
    out.push(`- **${p.count}×** \`{${p.tokens.join(', ')}}\` — promote to a component?`);
    out.push(`  <br>${p.sites.slice(0, 5).map((s) => `\`${s}\``).join(', ')}${more}`);
  }
  out.push('');

  out.push('### Retirement candidates', '_Barely-used or stale components:_', '');
  if (!retirements.length) out.push('_none_', '');
  for (const r of retirements) {
    const src = `code: ${r.code}` + (r.sawFigma ? `, figma: ${r.figma}` : '');
    const flag = r.stale && !r.lowUse ? ' **[stale]**' : '';
    out.push(`- **${r.name}** — ${r.total} use${r.total === 1 ? '' : 's'} (${src}) — ${recency(r)}${flag} — retire?`);
  }
  out.push('');
  out.push(`**${promotions.length} promotion, ${retirements.length} retirement candidate(s).** _Strap proposes — you decide._`);
  return out.join('\n');
}

export function formatSummary(fileResults) {
  let errors = 0;
  let warns = 0;
  for (const { violations } of fileResults) {
    for (const v of violations) {
      if (v.severity === 'error') errors++;
      else if (v.severity === 'warn') warns++;
    }
  }
  const parts = [];
  parts.push(errors ? C.red(`${errors} error${errors === 1 ? '' : 's'}`) : C.green('0 errors'));
  parts.push(warns ? C.yellow(`${warns} warning${warns === 1 ? '' : 's'}`) : C.dim('0 warnings'));
  return { errors, warns, line: `Strap QA: ${parts.join(', ')} across ${fileResults.length} file(s).` };
}
