import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STEP_LIMIT,
  newSteps,
  clampSteps,
  stepBy,
  setSteps,
  resetSteps,
  hasSteps,
  manualStepMods,
  collectStepMods,
  stepIndicator,
  shownDie,
} from '../scripts/rolls/steps.js';
import { planDice } from '../scripts/rolls/test.js';

test('newSteps começa zerado para os três atributos e as perícias', () => {
  assert.deepEqual(newSteps(), { fisico: 0, mente: 0, emocao: 0, pericias: 0 });
});

test('clampSteps limita a ±4 e trata valores inválidos', () => {
  assert.equal(clampSteps(9), STEP_LIMIT);
  assert.equal(clampSteps(-9), -STEP_LIMIT);
  assert.equal(clampSteps('2'), 2);
  assert.equal(clampSteps('abc'), 0);
  assert.equal(clampSteps(1.9), 1);
});

test('stepBy soma sem alterar o original e respeita o limite', () => {
  const base = newSteps();
  const next = stepBy(base, 'fisico', 2);
  assert.equal(next.fisico, 2);
  assert.equal(base.fisico, 0);
  assert.equal(stepBy(next, 'fisico', 10).fisico, STEP_LIMIT);
  assert.equal(stepBy(next, 'fisico', -3).fisico, -1);
});

test('stepBy e setSteps ignoram chaves desconhecidas e completam campos ausentes', () => {
  assert.deepEqual(stepBy({}, 'forca', 1), newSteps());
  assert.deepEqual(setSteps({ mente: 1 }, 'xyz', 2), { ...newSteps(), mente: 1 });
  assert.equal(setSteps({}, 'pericias', 3).pericias, 3);
});

test('resetSteps e hasSteps', () => {
  assert.equal(hasSteps(newSteps()), false);
  assert.equal(hasSteps({ emocao: -1 }), true);
  assert.deepEqual(resetSteps(), newSteps());
});

test('manualStepMods usa só o atributo do teste e o dado das perícias', () => {
  const steps = { fisico: 2, mente: 1, emocao: 0, pericias: -1 };
  assert.deepEqual(manualStepMods(steps, 'fisico'), [
    { target: 'attribute', steps: 2 },
    { target: 'skill', steps: -1 },
  ]);
  assert.deepEqual(manualStepMods(steps, 'emocao'), [{ target: 'skill', steps: -1 }]);
  assert.deepEqual(manualStepMods(newSteps(), 'mente'), []);
});

test('collectStepMods reúne passos manuais e efeitos', () => {
  const effects = [
    { atributo: 'fisico', passos: 1 },
    { atributo: 'mente', passos: 2 },
  ];
  const mods = collectStepMods({ steps: { fisico: 1, pericias: 1 }, effects, attrKey: 'fisico' });
  assert.deepEqual(mods, [
    { target: 'attribute', steps: 1 },
    { target: 'skill', steps: 1 },
    { target: 'attribute', steps: 1 },
  ]);
});

test('o passo manual não transborda: perícia em d12 fica em d12 e o atributo não muda', () => {
  const mods = manualStepMods({ pericias: 3 }, 'fisico');
  const plan = planDice({ attrDie: 8, skillDie: 12, stepMods: mods });
  assert.equal(plan.skillFinal, 12);
  assert.equal(plan.attrFinal, 8);
});

test('passos manuais alteram os dados no planejamento da rolagem', () => {
  const mods = collectStepMods({ steps: { fisico: 2, pericias: 1 }, attrKey: 'fisico' });
  const plan = planDice({ attrDie: 6, skillDie: 6, stepMods: mods });
  assert.equal(plan.attrFinal, 10);
  assert.equal(plan.skillFinal, 8);
});

test('passos positivos e negativos se anulam no saldo líquido', () => {
  const mods = collectStepMods({
    steps: { mente: -1 },
    effects: [{ atributo: 'mente', passos: 1 }],
    attrKey: 'mente',
  });
  assert.equal(planDice({ attrDie: 8, skillDie: 6, stepMods: mods }).attrFinal, 8);
});

test('stepIndicator mostra direção e saldo (manual + efeitos)', () => {
  const effects = [{ atributo: 'fisico', passos: 1 }];
  assert.deepEqual(stepIndicator({ steps: { fisico: 1 }, effects, key: 'fisico' }), {
    net: 2,
    manual: 1,
    effects: 1,
    direction: 'up',
  });
  assert.equal(stepIndicator({ steps: { mente: -1 }, key: 'mente' }).direction, 'down');
  assert.equal(stepIndicator({ steps: {}, key: 'emocao' }).direction, 'none');
  assert.equal(stepIndicator({ steps: { pericias: 2 }, effects, key: 'pericias' }).net, 2);
});

test('shownDie aplica o saldo líquido sem passar de d4 nem de d12', () => {
  assert.equal(shownDie(6, { net: 2 }), 10);
  assert.equal(shownDie(10, { net: 3 }), 12);
  assert.equal(shownDie(6, { net: -3 }), 4);
  assert.equal(shownDie(8, undefined), 8);
  assert.equal(shownDie(20, { net: 1 }), 20);
});
