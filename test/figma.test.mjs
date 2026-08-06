import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../scripts/lib/config.mjs';
import { auditFrames } from '../scripts/lib/figma.mjs';

const cfg = loadConfig(process.cwd());
const audit = (frames, over) => auditFrames(frames, over ? { ...cfg, rules: { ...cfg.rules, ...over } } : cfg);
const rules = (frames, over) => audit(frames, over).map((v) => v.rule);

// The starter "card" component consumes color.line, color.white, radius.card, shadow.md.
const cardTokens = ['color.white', 'color.line', 'radius.card', 'shadow.md'];
const rawCard = { id: '1:1', name: 'Panel', type: 'FRAME', width: 300, height: 145, tokens: cardTokens, children: [{ type: 'TEXT' }, { type: 'FRAME' }] };

test('flags a raw frame that is really a library component (warn)', () => {
  const v = audit([rawCard]).find((x) => x.rule === 'figmaDuplicateComponent');
  assert.ok(v, 'expected a figmaDuplicateComponent finding');
  assert.equal(v.severity, 'warn');
  assert.match(v.message, /"card"/);
  assert.match(v.loc, /Panel/);
});

test('does NOT flag an INSTANCE of the component', () => {
  const inst = { ...rawCard, type: 'INSTANCE', componentId: '1:20' };
  assert.ok(!rules([inst]).includes('figmaDuplicateComponent'));
});

test('does NOT flag a frame whose name claims the component', () => {
  const named = { ...rawCard, name: 'Card / elevated' };
  assert.ok(!rules([named]).includes('figmaDuplicateComponent'));
});

test('does NOT flag a frame that shares too few of a component\'s tokens', () => {
  const thin = { ...rawCard, name: 'Thin', tokens: ['color.white'] };
  assert.ok(!rules([thin]).includes('figmaDuplicateComponent'));
});

test('clusters two near-identical raw frames as duplicates', () => {
  const a = { id: '2:1', name: 'Tst A', type: 'FRAME', width: 320, height: 120, tokens: ['color.ink', 'font.body'], children: [{ type: 'TEXT' }, { type: 'TEXT' }, { type: 'FRAME' }] };
  const b = { id: '2:2', name: 'Tst B', type: 'FRAME', width: 322, height: 118, tokens: ['color.ink', 'font.body'], children: [{ type: 'TEXT' }, { type: 'TEXT' }, { type: 'FRAME' }] };
  const v = audit([a, b]).find((x) => x.rule === 'figmaDuplicateFrame');
  assert.ok(v, 'expected a figmaDuplicateFrame finding');
  assert.match(v.message, /2 near-identical/);
});

test('does NOT cluster frames with different structure', () => {
  const a = { id: '3:1', name: 'A', type: 'FRAME', width: 320, height: 120, tokens: ['color.ink'], children: [{ type: 'TEXT' }, { type: 'TEXT' }] };
  const b = { id: '3:2', name: 'B', type: 'FRAME', width: 100, height: 400, tokens: ['color.ink'], children: [{ type: 'FRAME' }, { type: 'IMAGE' }, { type: 'TEXT' }] };
  assert.ok(!rules([a, b]).includes('figmaDuplicateFrame'));
});

test('both figma rules can be turned off via config', () => {
  const off = { figmaDuplicateComponent: 'off', figmaDuplicateFrame: 'off', figmaRawValue: 'off' };
  assert.equal(audit([rawCard], off).length, 0);
});

// --- figmaRawValue: on-canvas token compliance ------------------------------
test('flags a raw color that matches a token, and suggests the token', () => {
  const v = audit([{ id: '5:1', name: 'Hero', type: 'FRAME', rawColors: ['#2563EB'] }]).find((x) => x.rule === 'figmaRawValue');
  assert.ok(v, 'expected a figmaRawValue finding');
  assert.equal(v.severity, 'warn');
  assert.match(v.message, /not bound to a Variable/);
  assert.equal(v.fix, 'blue'); // #2563EB is the brand token
});

test('flags an off-system raw color with no matching token', () => {
  const v = audit([{ id: '5:2', name: 'Odd', type: 'FRAME', rawColors: ['#123456'] }]).find((x) => x.rule === 'figmaRawValue');
  assert.ok(v);
  assert.equal(v.fix, null);
});

test('does NOT flag a frame whose values are all bound (no rawColors)', () => {
  const clean = { id: '5:3', name: 'Clean', type: 'FRAME', tokens: ['color.white', 'color.line'], rawColors: [] };
  assert.ok(!rules([clean]).includes('figmaRawValue'));
});
