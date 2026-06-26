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
