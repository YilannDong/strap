import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planMerge, formatMergePlan } from '../scripts/lib/merge.mjs';

const frame = {
  id: '252:72', name: 'Cash summary', page: 'Test', type: 'FRAME', width: 300, height: 116,
  children: [{ type: 'TEXT', name: 'TOTAL BALANCE' }, { type: 'TEXT', name: '$284,500.00' }],
  tokens: ['color.ink', 'color.line', 'color.neutral-0', 'color.neutral-500', 'radius.lg'],
};
const component = {
  name: 'Stat card',
  consumes: ['color.ink', 'color.line', 'color.neutral-0', 'color.neutral-500', 'color.success'],
};

test('reports the real coverage, not a guess', () => {
  const p = planMerge({ frame, component });
  assert.equal(p.match.shared, 4);
  assert.equal(p.match.ofComponent, 5);
  assert.equal(p.match.coverage, 0.8);
});

test('names what the merge would LOSE', () => {
  const p = planMerge({ frame, component });
  assert.deepEqual(p.tokens.extraInFrame, ['radius.lg']);
  assert.ok(p.warnings.some((w) => w.includes('radius.lg')), 'a lost token must be warned about');
});

test('carries text content across in order', () => {
  const p = planMerge({ frame, component });
  assert.deepEqual(p.carryOver.map((c) => c.name), ['TOTAL BALANCE', '$284,500.00']);
});

test('warns on a weak match rather than proceeding quietly', () => {
  const weak = { ...frame, tokens: ['color.ink'] };
  const p = planMerge({ frame: weak, component });
  assert.ok(p.match.coverage < 0.6);
  assert.ok(p.warnings.some((w) => /weak match/i.test(w)));
});

test('warns when the frame is already an instance', () => {
  const p = planMerge({ frame: { ...frame, type: 'INSTANCE' }, component });
  assert.ok(p.warnings.some((w) => /not a raw FRAME/.test(w)));
});

test('flags non-text children that have nowhere to go', () => {
  const withIcon = { ...frame, children: [...frame.children, { type: 'VECTOR', name: 'Sparkline' }] };
  const p = planMerge({ frame: withIcon, component });
  assert.ok(p.warnings.some((w) => w.includes('Sparkline')));
});

test('plans nothing on its own — the plan is inert until a skill applies it', () => {
  const p = planMerge({ frame, component });
  assert.equal(p.reviewed, false);
  assert.equal(p.propMap, null);
  assert.match(formatMergePlan(p), /Nothing has been changed/);
});

test('refuses to plan without both sides', () => {
  assert.throws(() => planMerge({ frame, component: null }), /no component/);
  assert.throws(() => planMerge({ frame: null, component }), /no frame/);
});
