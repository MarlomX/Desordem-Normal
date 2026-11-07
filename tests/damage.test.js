import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDamage, applyDamage } from '../scripts/rolls/damage.js';
import { resolveTest } from '../scripts/rolls/test.js';
import { fixedRng } from './helpers.js';

test('dano é a rolagem alta mais o modificador da arma', () => {
  const r = resolveTest({ attrDie: 6, skillDie: 8, rng: fixedRng([3, 5]) });
  assert.equal(computeDamage(r, 2), 7);
  assert.equal(computeDamage(r), 5);
});

test('em sucesso crítico o dano soma as duas maiores rolagens', () => {
  const r = resolveTest({ attrDie: 8, skillDie: 8, rng: fixedRng([6, 6]) });
  assert.equal(computeDamage(r, 1), 13);
});

test('o dano nunca fica negativo', () => {
  const r = resolveTest({ attrDie: 6, skillDie: 6, rng: fixedRng([1, 2]) });
  assert.equal(computeDamage(r, -5), 0);
});

test('applyDamage reduz o PV sem passar de 0', () => {
  assert.deepEqual(applyDamage({ current: 10, amount: 4 }), {
    before: 10,
    after: 6,
    needsInjuryTest: false,
  });
  assert.equal(applyDamage({ current: 3, amount: 9 }).after, 0);
});

test('chegar a 0 PV exige teste de lesão', () => {
  assert.equal(applyDamage({ current: 5, amount: 5 }).needsInjuryTest, true);
  assert.equal(applyDamage({ current: 5, amount: 8 }).needsInjuryTest, true);
});

test('sofrer dano já estando com 0 PV exige novo teste de lesão', () => {
  assert.equal(applyDamage({ current: 0, amount: 1 }).needsInjuryTest, true);
});

test('dano 0 nunca exige teste', () => {
  assert.equal(applyDamage({ current: 0, amount: 0 }).needsInjuryTest, false);
  assert.equal(applyDamage({ current: 4, amount: 0 }).needsInjuryTest, false);
});

test('valores inválidos lançam erro', () => {
  assert.throws(() => applyDamage({ current: 5, amount: -1 }), RangeError);
  assert.throws(() => applyDamage({ current: 5, amount: 1.5 }), RangeError);
  assert.throws(() => applyDamage({ current: -1, amount: 1 }), RangeError);
});
