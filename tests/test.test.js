import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTest, planDice } from '../scripts/rolls/test.js';
import { fixedRng } from './helpers.js';

test('soma atributo e perícia e compara com a DT padrão 7', () => {
  const r = resolveTest({ attrDie: 6, skillDie: 8, rng: fixedRng([4, 5]) });
  assert.equal(r.total, 9);
  assert.equal(r.dt, 7);
  assert.equal(r.success, true);
});

test('igual à DT é sucesso', () => {
  const r = resolveTest({ attrDie: 6, skillDie: 6, rng: fixedRng([3, 4]) });
  assert.equal(r.total, 7);
  assert.equal(r.success, true);
});

test('abaixo da DT é falha', () => {
  const r = resolveTest({ attrDie: 6, skillDie: 6, rng: fixedRng([3, 3]) });
  assert.equal(r.success, false);
});

test('DT personalizada', () => {
  const r = resolveTest({ attrDie: 8, skillDie: 8, dt: 10, rng: fixedRng([4, 5]) });
  assert.equal(r.success, false);
});

test('RA e RB são valores tirados, não o tipo de dado (d6=6, d8=3)', () => {
  const r = resolveTest({ attrDie: 6, skillDie: 8, rng: fixedRng([6, 3]) });
  assert.equal(r.highRoll, 6);
  assert.equal(r.lowRoll, 3);
  assert.equal(r.total, 9);
});

test('sucesso crítico: dois dados iguais com 6 ou mais passam mesmo com DT alta', () => {
  const r = resolveTest({ attrDie: 8, skillDie: 10, dt: 99, rng: fixedRng([6, 6]) });
  assert.equal(r.criticalSuccess, true);
  assert.equal(r.success, true);
  assert.equal(r.highSum, 12);
});

test('dois dados iguais abaixo de 6 não são crítico', () => {
  const r = resolveTest({ attrDie: 8, skillDie: 8, dt: 99, rng: fixedRng([5, 5]) });
  assert.equal(r.criticalSuccess, false);
  assert.equal(r.success, false);
  assert.equal(r.highSum, 5);
});

test('falha crítica: todos os dados 1 falham mesmo com DT baixa', () => {
  const r = resolveTest({ attrDie: 6, skillDie: 6, dt: 2, rng: fixedRng([1, 1]) });
  assert.equal(r.criticalFailure, true);
  assert.equal(r.success, false);
});

test('um 1 e um 2 não é falha crítica', () => {
  const r = resolveTest({ attrDie: 6, skillDie: 6, rng: fixedRng([1, 2]) });
  assert.equal(r.criticalFailure, false);
});

test('com 4 dados rolados somam-se os 3 maiores e o menor fica só para exibição', () => {
  const r = resolveTest({ attrDie: 6, skillDie: 8, extraDice: [6, 4], rng: fixedRng([2, 5, 6, 4]) });
  assert.equal(r.dice.length, 4);
  assert.equal(r.total, 15);
  assert.equal(r.highRoll, 6);
  assert.equal(r.lowRoll, 4); // o 2 ignorado não conta para a RB
  assert.deepEqual(
    r.dice.map((d) => d.counted),
    [false, true, true, true],
  );
});

test('dados extras além do limite de 4 rolados são descartados', () => {
  const rng = fixedRng([3, 3, 3, 3]);
  const r = resolveTest({ attrDie: 6, skillDie: 6, extraDice: [6, 6, 8], rng });
  assert.equal(r.dice.length, 4);
  assert.deepEqual(r.discardedExtras, [8]);
  assert.equal(rng.calls.length, 4);
});

test('falha crítica com extras exige que todos os dados rolados sejam 1', () => {
  const todos = resolveTest({ attrDie: 6, skillDie: 6, extraDice: [6], rng: fixedRng([1, 1, 1]) });
  assert.equal(todos.criticalFailure, true);
  const nem = resolveTest({ attrDie: 6, skillDie: 6, extraDice: [6], rng: fixedRng([1, 1, 2]) });
  assert.equal(nem.criticalFailure, false);
});

test('redução de passo só na perícia', () => {
  const rng = fixedRng([3, 3]);
  const r = resolveTest({ attrDie: 8, skillDie: 8, stepMods: [{ target: 'skill', steps: -1 }], rng });
  assert.deepEqual(rng.calls, [8, 6]);
  assert.equal(r.base.skill.final, 6);
  assert.equal(r.base.attribute.final, 8);
});

test('aumento de passo só no atributo', () => {
  const rng = fixedRng([3, 3]);
  resolveTest({ attrDie: 6, skillDie: 6, stepMods: [{ target: 'attribute', steps: 1 }], rng });
  assert.deepEqual(rng.calls, [8, 6]);
});

test('efeito em ambos os dados e passos acumulados com limite na escada', () => {
  const rng = fixedRng([2, 2]);
  resolveTest({
    attrDie: 6,
    skillDie: 10,
    stepMods: [
      { target: 'both', steps: -1 },
      { target: 'both', steps: -1 },
    ],
    rng,
  });
  assert.deepEqual(rng.calls, [4, 6]);
});

test('alvo de passo inválido gera erro', () => {
  assert.throws(
    () => resolveTest({ attrDie: 6, skillDie: 6, stepMods: [{ target: 'x', steps: 1 }], rng: fixedRng([1, 1]) }),
    RangeError,
  );
});

test('planDice aplica passos, limita a 4 dados e não rola nada', () => {
  const plano = planDice({
    attrDie: 8,
    skillDie: 8,
    extraDice: [6, 6, 10],
    stepMods: [{ target: 'skill', steps: -1 }],
  });
  assert.deepEqual(plano.rolledSides, [8, 6, 6, 6]);
  assert.deepEqual(plano.discardedExtras, [10]);
  assert.equal(plano.attrFinal, 8);
  assert.equal(plano.skillFinal, 6);
});

test('resolveTest com valores pré-rolados dá o mesmo resultado que o plano', () => {
  const opts = { attrDie: 6, skillDie: 8, extraDice: [6] };
  const plano = planDice(opts);
  const r = resolveTest({ ...opts, rng: fixedRng([4, 5, 2]) });
  assert.deepEqual(
    r.dice.map((d) => d.sides),
    plano.rolledSides,
  );
});
test('modificador fixo soma ao total, mas não muda RA, RB nem críticos', () => {
  const r = resolveTest({ attrDie: 6, skillDie: 8, modifier: -2, rng: fixedRng([4, 5]) });
  assert.equal(r.total, 7);
  assert.equal(r.modifier, -2);
  assert.equal(r.highRoll, 5);
  assert.equal(r.lowRoll, 4);
  assert.equal(r.success, true);

  const falha = resolveTest({ attrDie: 6, skillDie: 8, modifier: -3, rng: fixedRng([4, 5]) });
  assert.equal(falha.success, false);

  const critico = resolveTest({ attrDie: 8, skillDie: 8, modifier: -9, dt: 99, rng: fixedRng([6, 6]) });
  assert.equal(critico.success, true);
});