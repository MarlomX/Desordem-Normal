import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BONUS_SLOTS,
  newBonus,
  normalizeBonus,
  setBonusSlot,
  bonusDice,
  buildBonusSlots,
} from '../scripts/rolls/bonus.js';
import { planDice } from '../scripts/rolls/test.js';

test('newBonus tem dois espaços vazios', () => {
  assert.equal(BONUS_SLOTS, 2);
  assert.deepEqual(newBonus(), [0, 0]);
});

test('normalizeBonus corrige listas inválidas e dados fora da escada', () => {
  assert.deepEqual(normalizeBonus(undefined), [0, 0]);
  assert.deepEqual(normalizeBonus([8]), [8, 0]);
  assert.deepEqual(normalizeBonus([20, 5, 12]), [0, 0]);
  assert.deepEqual(normalizeBonus(['10', 6]), [10, 6]);
});

test('setBonusSlot muda só o espaço pedido e não altera o original', () => {
  const base = [8, 0];
  const next = setBonusSlot(base, 1, 12);
  assert.deepEqual(next, [8, 12]);
  assert.deepEqual(base, [8, 0]);
  assert.deepEqual(setBonusSlot(next, 0, 0), [0, 12]);
});

test('setBonusSlot ignora espaço inválido e trata d20 como vazio', () => {
  assert.deepEqual(setBonusSlot([6, 6], 2, 8), [6, 6]);
  assert.deepEqual(setBonusSlot([6, 6], -1, 8), [6, 6]);
  assert.deepEqual(setBonusSlot([6, 6], 0, 20), [0, 6]);
});

test('bonusDice devolve só os espaços preenchidos, na ordem', () => {
  assert.deepEqual(bonusDice([0, 10]), [10]);
  assert.deepEqual(bonusDice([6, 4]), [6, 4]);
  assert.deepEqual(bonusDice(undefined), []);
});

test('buildBonusSlots traz o seletor com vazio e d4 a d12', () => {
  const [a, b] = buildBonusSlots([8, 0], 'Sem dado');
  assert.equal(a.sides, 8);
  assert.deepEqual(
    a.options.map((o) => o.label),
    ['Sem dado', 'd4', 'd6', 'd8', 'd10', 'd12'],
  );
  assert.equal(a.options.find((o) => o.selected).value, 8);
  assert.equal(b.options.find((o) => o.selected).value, 0);
});

test('dois dados bônus completam 4 dados rolados e entram antes dos extras seguintes', () => {
  const plan = planDice({ attrDie: 6, skillDie: 6, extraDice: [...bonusDice([8, 10]), 4] });
  assert.deepEqual(plan.rolledSides, [6, 6, 8, 10]);
  assert.deepEqual(plan.discardedExtras, [4]);
});
