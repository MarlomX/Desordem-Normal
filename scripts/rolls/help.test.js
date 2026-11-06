import test from 'node:test';
import assert from 'node:assert/strict';
import { canHelp, helpSteps, applyHelp } from '../scripts/rolls/help.js';
import { resolveTest } from '../scripts/rolls/test.js';
import { fixedRng } from './helpers.js';

test('d4 não pode ajudar', () => {
  assert.equal(canHelp(4), false);
  assert.equal(helpSteps(4), 0);
  assert.throws(() => applyHelp({}, 4), RangeError);
});

test('d6 e d8 dão 1 passo; d10 e d12 dão 2 passos', () => {
  assert.deepEqual([6, 8, 10, 12].map(helpSteps), [1, 1, 2, 2]);
});

test('dado inválido lança erro', () => {
  assert.throws(() => canHelp(7), RangeError);
  assert.throws(() => applyHelp({}, 6, [5]), RangeError);
});

test('a ajuda sobe só o dado da perícia e não altera o original', () => {
  const original = { attrDie: 6, skillDie: 6, stepMods: [], extraDice: [] };
  const helped = applyHelp(original, 10);
  assert.deepEqual(helped.stepMods, [{ target: 'skill', steps: 2 }]);
  assert.deepEqual(original.stepMods, []);
  const r = resolveTest({ ...original, ...helped, rng: fixedRng([3, 5]) });
  assert.equal(r.base.attribute.final, 6);
  assert.equal(r.base.skill.final, 10);
});

test('várias ajudas se acumulam e respeitam o teto d12', () => {
  let opts = { attrDie: 6, skillDie: 8 };
  opts = { ...opts, ...applyHelp(opts, 6) };
  opts = { ...opts, ...applyHelp(opts, 12) };
  assert.equal(opts.stepMods.length, 2);
  const r = resolveTest({ ...opts, rng: fixedRng([2, 2]) });
  assert.equal(r.base.skill.final, 12); // d8 + 3 passos, travado em d12
});

test('dados bônus extras (ex.: relação) entram no teste', () => {
  const helped = applyHelp({ attrDie: 6, skillDie: 6 }, 8, [6]);
  assert.deepEqual(helped.extraDice, [6]);
  const r = resolveTest({ attrDie: 6, skillDie: 6, ...helped, rng: fixedRng([1, 2, 3]) });
  assert.equal(r.dice.length, 3);
});

test('ajuda funciona em teste oposto (é só um teste com passo aumentado)', () => {
  const helped = applyHelp({ attrDie: 6, skillDie: 6 }, 6);
  const r = resolveTest({ attrDie: 6, skillDie: 6, ...helped, rng: fixedRng([3, 3]) });
  assert.equal(r.base.skill.final, 8);
});
