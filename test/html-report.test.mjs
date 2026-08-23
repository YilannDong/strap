import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderHtmlReport } from '../scripts/lib/html-report.mjs';

const figma = [{
  rule: 'figmaDuplicateComponent', severity: 'warn', loc: 'Home · Panel (10:1)',
  message: 'Frame "Panel" reuses 4/4 of the "card" component\'s tokens', fix: null,
}];
const code = [{
  file: 'src/a.tsx',
  violations: [{ line: 4, col: 9, rule: 'rawHex', severity: 'error', message: 'Raw hex #10744F', fix: 'use color.brand' }],
}];

test('renders both surfaces into one self-contained page', () => {
  const h = renderHtmlReport({ code, figma, project: 'demo' });
  assert.match(h, /^<!doctype html>/);
  assert.ok(h.includes('figmaDuplicateComponent'));
  assert.ok(h.includes('rawHex'));
  assert.ok(h.includes('src/a.tsx:4:9'));
  assert.ok(!/<script src=|<link rel="stylesheet" href=/.test(h), 'must not reference external assets');
});

test('offers actions matched to the rule', () => {
  const h = renderHtmlReport({ figma, code: [] });
  assert.ok(h.includes('Merge into the component'));
  assert.ok(h.includes('Create a new component'));
  const g = renderHtmlReport({ code, figma: [] });
  assert.ok(g.includes('Bind to the token'));
  assert.ok(g.includes('Add as a new token'));
});

test('every finding can be dismissed', () => {
  const h = renderHtmlReport({ code, figma });
  const rows = h.split('class="fa"').length - 1;
  const ignores = h.split('data-a="ignore"').length - 1;
  assert.equal(rows, 2);
  assert.equal(ignores, 2, 'a report you cannot dismiss becomes noise');
});

test('counts severities in the header', () => {
  const h = renderHtmlReport({ code, figma });
  assert.ok(h.includes('1 error'));
  assert.ok(h.includes('1 warning'));
});

test('empty input renders a clean pass, not an empty shell', () => {
  const h = renderHtmlReport({});
  assert.ok(h.includes('No drift found'));
  assert.ok(!h.includes('Copy decisions'), 'no decision bar when there is nothing to decide');
});

test('escapes hostile content from file paths and messages', () => {
  const h = renderHtmlReport({
    code: [{ file: '<img src=x onerror=alert(1)>', violations: [{ line: 1, col: 1, rule: 'rawHex', severity: 'warn', message: '</script><script>alert(1)</script>', fix: null }] }],
  });
  assert.ok(!h.includes('<img src=x'), 'file path must be escaped');
  assert.ok(!h.includes('</script><script>alert(1)'), 'message must be escaped');
});

test('embeds a thumbnail when the skill left one', () => {
  const thumbs = { '10:1': 'data:image/png;base64,AAAA' };
  const h = renderHtmlReport({ figma, thumbs });
  assert.ok(h.includes('data:image/png;base64,AAAA'));
});
