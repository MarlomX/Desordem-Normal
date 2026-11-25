// Dados bônus: normalização, espaços preenchidos e a ordem entre os dados rolados.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BONUS_SLOTS, normalizeBonus, bonusDice } from '../scripts/rolls/bonus.js';
import { planDice } from '../scripts/rolls/test.js';

test('normalizeBonus corrige listas inválidas e dados fora da escada', () => {
  assert.equal(BONUS_SLOTS, 2);
  assert.deepEqual(normalizeBonus(undefined), [0, 0]);
  assert.deepEqual(normalizeBonus([8]), [8, 0]);
  assert.deepEqual(normalizeBonus([20, 5, 12]), [0, 0]);
  assert.deepEqual(normalizeBonus(['10', 6]), [10, 6]);
});

test('bonusDice devolve só os espaços preenchidos, na ordem', () => {
  assert.deepEqual(bonusDice([0, 10]), [10]);
  assert.deepEqual(bonusDice([6, 4]), [6, 4]);
  assert.deepEqual(bonusDice(undefined), []);
});

test('dois dados bônus completam 4 dados rolados e entram antes dos extras seguintes', () => {
  const plan = planDice({ attrDie: 6, skillDie: 6, extraDice: [...bonusDice([8, 10]), 4] });
  assert.deepEqual(plan.rolledSides, [6, 6, 8, 10]);
  assert.deepEqual(plan.discardedExtras, [4]);
});
