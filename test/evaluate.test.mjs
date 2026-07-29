import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../scripts/lib/config.mjs';
import { evaluate } from '../scripts/lib/evaluate.mjs';

const cfg = loadConfig(process.cwd()); // starter registry: button, input, card, badge

// A 3-token footprint that matches NO starter component (the warn palette).
const warnRule = '.x{color:var(--warn);background:var(--warn-tint);border-color:var(--warn-ink)}';

// --- promotion --------------------------------------------------------------
test('promotes a footprint that recurs >= promoteMin and matches no component', () => {
  const files = [
    { path: 'a.css', text: warnRule },
    { path: 'b.css', text: warnRule },
    { path: 'c.css', text: warnRule },
  ];
  const { promotions } = evaluate(files, [], cfg);
  assert.equal(promotions.length, 1);
  assert.equal(promotions[0].count, 3);
  assert.ok(promotions[0].tokens.includes('color.warn'));
});

test("does NOT promote a footprint that already matches a component (radar's job)", () => {
  const cardRule = '.p{background:var(--white);border:1px solid var(--line);border-radius:var(--radius-card);box-shadow:var(--shadow-md)}';
  const files = [{ path: 'a.css', text: cardRule }, { path: 'b.css', text: cardRule }, { path: 'c.css', text: cardRule }];
  assert.equal(evaluate(files, [], cfg).promotions.length, 0);
});

test('does NOT promote below promoteMin', () => {
  const files = [{ path: 'a.css', text: warnRule }, { path: 'b.css', text: warnRule }];
  assert.equal(evaluate(files, [], cfg).promotions.length, 0);
});

test('promotion clusters Figma frames too', () => {
  const mk = (id) => ({ id, name: `Banner ${id}`, type: 'FRAME', tokens: ['color.ink3', 'color.blue', 'color.line'] });
  const frames = [mk('1:1'), mk('1:2'), mk('1:3')];
  const { promotions } = evaluate([], frames, cfg);
  assert.equal(promotions.length, 1);
  assert.equal(promotions[0].count, 3);
});

// --- retirement -------------------------------------------------------------
test('retires a component at/below retireMax; keeps a used one', () => {
  const files = [{ path: 'app.tsx', text: '<Card/>\n<Card/>' }]; // card used twice
  const names = evaluate(files, [], cfg).retirements.map((r) => r.name);
  assert.ok(!names.includes('card'), 'card used twice -> not retired');
  assert.ok(names.includes('badge'), 'badge unused -> retired');
});

test('Figma instances count toward usage (prevents false retirement)', () => {
  const files = [{ path: 'app.tsx', text: '<Badge/>' }];            // code: 1
  const frames = [{ id: '1:1', name: 'Badge', type: 'INSTANCE', tokens: [] }]; // figma: 1 -> total 2
  const names = evaluate(files, frames, cfg).retirements.map((r) => r.name);
  assert.ok(!names.includes('badge'), 'badge total 2 -> not retired');
});

// --- temporal axis ----------------------------------------------------------
const NOW = Date.parse('2026-07-01T00:00:00Z');
const monthsBackIso = (m) => new Date(NOW - m * 30.44 * 24 * 3600 * 1000).toISOString();

test('flags a stale-but-present component as a retirement candidate', () => {
  const files = [{ path: 'app.tsx', text: '<Card/>\n<Card/>\n<Card/>' }]; // used 3× -> not low-use
  const extra = { now: NOW, componentDates: { card: monthsBackIso(8) } };  // last used 8mo ago
  const r = evaluate(files, [], cfg, extra).retirements.find((x) => x.name === 'card');
  assert.ok(r, 'card should be a candidate via staleness despite 3 uses');
  assert.equal(r.stale, true);
  assert.equal(r.lowUse, false);
  assert.ok(r.ageMonths >= 7);
});

test('does NOT flag a recently-used, well-used component', () => {
  const files = [{ path: 'app.tsx', text: '<Card/>\n<Card/>\n<Card/>' }];
  const extra = { now: NOW, componentDates: { card: monthsBackIso(1) } }; // last used 1mo ago
  assert.ok(!evaluate(files, [], cfg, extra).retirements.some((x) => x.name === 'card'));
});

test('missing git dates degrade gracefully (no recency, still counts-based)', () => {
  const files = [{ path: 'app.tsx', text: '<Card/>\n<Card/>' }]; // card used 2× -> not low-use
  const r = evaluate(files, [], cfg, {}).retirements.find((x) => x.name === 'card');
  assert.equal(r, undefined); // no dates, not low-use -> not a candidate
});

test('respects configured thresholds', () => {
  const files = [{ path: 'a.css', text: warnRule }, { path: 'b.css', text: warnRule }];
  const loose = { ...cfg, evaluate: { promoteMin: 2, retireMax: 1, minFootprint: 3 } };
  assert.equal(evaluate(files, [], loose).promotions.length, 1); // 2 now clears the bar
});
