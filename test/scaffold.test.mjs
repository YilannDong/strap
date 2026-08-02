import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../scripts/lib/config.mjs';
import { scanFile } from '../scripts/lib/scan.mjs';
import { scaffoldComponent, tokenToCssVar } from '../scripts/lib/scaffold.mjs';

const cfg = loadConfig(process.cwd());
const cssOf = (b) => b.files.find((f) => f.ext === 'css').content;

test('maps token keys to the generated CSS var names', () => {
  assert.equal(tokenToCssVar('color.line'), '--line');
  assert.equal(tokenToCssVar('radius.card'), '--radius-card');
  assert.equal(tokenToCssVar('shadow.md'), '--shadow-md');
  assert.equal(tokenToCssVar('font.body'), '--font-body');
  assert.equal(tokenToCssVar('space.16'), '--space-16');
});

test('scaffolds a PascalCase, token-bound component with matching files', () => {
  const b = scaffoldComponent('notice card', ['color.white', 'color.line', 'radius.card', 'shadow.md']);
  assert.equal(b.name, 'NoticeCard');
  assert.equal(b.className, 'notice-card');
  const css = cssOf(b);
  assert.match(css, /var\(--white\)/);
  assert.match(css, /var\(--line\)/);
  assert.match(css, /var\(--radius-card\)/);
  assert.match(css, /var\(--shadow-md\)/);
  const tsx = b.files.find((f) => f.ext === 'tsx').content;
  assert.match(tsx, /export function NoticeCard/);
  assert.match(tsx, /className="notice-card"/);
});

test('generated CSS binds tokens — no raw hex (passes the scanner cleanly)', () => {
  const b = scaffoldComponent('Banner', ['color.warn', 'color.warnInk', 'radius.card']);
  const violations = scanFile('Banner.css', cssOf(b), cfg);
  assert.equal(violations.filter((v) => v.severity === 'error').length, 0);
  assert.doesNotMatch(cssOf(b), /#[0-9a-fA-F]{3,6}\b/); // no hardcoded hex
});

test('classifies colors by leaf hint (surface / text / border)', () => {
  const css = cssOf(scaffoldComponent('Thing', ['color.white', 'color.ink', 'color.line']));
  assert.match(css, /background: var\(--white\)/);
  assert.match(css, /color: var\(--ink\)/);
  assert.match(css, /border: 1px solid var\(--line\)/);
});
