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

  lines.push(C.bold('Retirement candidates') + C.dim(' — registry components barely used:'));
  if (!retirements.length) lines.push('  ' + C.dim('none'));
  for (const r of retirements) {
    const src = `code: ${r.code}` + (r.sawFigma ? `, figma: ${r.figma}` : '');
    const where = r.sites.length ? C.dim(`  ${r.sites.slice(0, 3).join(', ')}`) : '';
    lines.push(`  ${C.yellow('●')} ${C.bold(r.name)}  ${r.total} use${r.total === 1 ? '' : 's'} ${C.dim('(' + src + ')')}${where}  ${C.green('→ retire?')}`);
  }
  lines.push('');
  lines.push(`${promotions.length} promotion, ${retirements.length} retirement candidate(s). ${C.dim('Strap proposes — you decide.')}`);
  return lines.join('\n');
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
