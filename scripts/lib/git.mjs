// Strap git helpers — the ONE impure corner of `evaluate` (component recency).
// Kept out of evaluate.mjs so the analysis stays pure + testable; the command
// calls these and passes plain dates in.
import { execFileSync } from 'node:child_process';

export function isGitRepo(root) {
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: root, stdio: ['ignore', 'ignore', 'ignore'] });
    return true;
  } catch {
    return false;
  }
}

// Paths (repo-relative) changed since `ref` — i.e. "what shipped this sprint."
// null if the ref can't be resolved / not a repo.
export function changedSince(ref, root) {
  try {
    const out = execFileSync('git', ['diff', '--name-only', `${ref}...HEAD`], { cwd: root, encoding: 'utf8' });
    return out.split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    return null;
  }
}

// ISO date of the most recent commit whose diff touches a usage of `<Name` — a
// proxy for "when was this component last used." null if never / not a repo.
export function lastUsedDate(name, root) {
  const esc = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try {
    const out = execFileSync(
      'git',
      ['log', '-1', '--format=%cI', `-G<${esc}`, '--', '.', ':(exclude)node_modules'],
      { cwd: root, encoding: 'utf8' }
    ).trim();
    return out || null;
  } catch {
    return null;
  }
}

// How many commits since `sinceIso` touched a usage of `<Name` — the rolling
// "activity in the last N months" window. null if not a repo.
export function recentUses(name, sinceIso, root) {
  const esc = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try {
    const out = execFileSync(
      'git',
      ['log', '--since', sinceIso, `-G<${esc}`, '--format=%H', '--', '.', ':(exclude)node_modules'],
      { cwd: root, encoding: 'utf8' }
    );
    return out.split('\n').filter(Boolean).length;
  } catch {
    return null;
  }
}
