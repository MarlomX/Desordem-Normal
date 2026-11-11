import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRollModel,
  emptySelection,
  evaluateSelection,
  selectionToOptions,
} from '../scripts/rolls/roll-dialog.js';

const base = (overrides = {}) =>
  buildRollModel({
    skillKey: 'luta',
    attrDie: 8,
    skillDie: 6,
    has: { impeto: true, sorrateiro: true },
    resources: { impeto: 2, pd: 10 },
    ...overrides,
  });

test('a sorrateira só aparece em Crime e Furtividade', () => {
  assert.deepEqual(
    base().abilities.map((a) => a.key),
    ['impetoDado'],
  );
  assert.deepEqual(
    base({ skillKey: 'furtividade' }).abilities.map((a) => a.key),
    ['impetoDado', 'sorrateiro'],
  );
});

test('só mostra habilidades que o personagem tem', () => {
  assert.deepEqual(base({ has: {} }).abilities, []);
});

test('habilidade sem recurso fica indisponível com o motivo', () => {
  const model = base({
    skillKey: 'crime',
    resources: { impeto: 0, pd: 2 },
  });
  assert.deepEqual(
    model.abilities.map((a) => [a.key, a.available, a.reason]),
    [
      ['impetoDado', false, 'impeto'],
      ['sorrateiro', false, 'pd'],
    ],
  );
});

test('sem pavor, o modelo não tem seção de pavor; testes que ignoram pavor também não', () => {
  assert.equal(base().fear, null);
  assert.equal(base({ fearDie: 8, ignoreFear: true }).fear, null);
});

test('modelo de pavor: controlar reduz um passo e d4 não reduz', () => {
  const six = base({ fearDie: 6 }).fear;
  assert.equal(six.controlPossible, true);
  assert.equal(six.controlledDie, 4);
  const four = base({ fearDie: 4 }).fear;
  assert.equal(four.controlPossible, false);
  assert.equal(four.controlledDie, 4);
});

test('sem escolhas, nada é gasto e os dados são atributo + perícia', () => {
  const result = evaluateSelection(base());
  assert.equal(result.pdCost, 0);
  assert.equal(result.impetoCost, 0);
  assert.deepEqual(result.rolledSides, [8, 6]);
  assert.equal(result.valid, true);
});

test('dado de ímpeto e sorrateira somam custos e dados extras', () => {
  const model = base({ skillKey: 'crime' });
  const result = evaluateSelection(model, {
    ...emptySelection(),
    active: ['impetoDado', 'sorrateiro'],
  });
  assert.equal(result.impetoCost, 1);
  assert.equal(result.pdCost, 3);
  assert.deepEqual(result.rolledSides, [8, 6, 4, 8]);
  assert.equal(result.pdLeft, 7);
  assert.equal(result.impetoLeft, 1);
});

test('habilidade indisponível é ignorada na avaliação', () => {
  const model = base({ resources: { impeto: 0, pd: 10 } });
  const result = evaluateSelection(model, { ...emptySelection(), active: ['impetoDado'] });
  assert.deepEqual(result.selection.active, []);
  assert.equal(result.impetoCost, 0);
});

test('controlar e abraçar o pavor juntos: custo 6 PD e o dado reduzido vira bônus', () => {
  const model = base({ fearDie: 8 });
  const result = evaluateSelection(model, {
    ...emptySelection(),
    controlFear: true,
    embraceFear: true,
  });
  assert.equal(result.pdCost, 6);
  assert.deepEqual(result.fear, { die: null, bonusDie: 6 });
  assert.deepEqual(result.rolledSides, [8, 6, 6]);
});

test('só controlar: o pavor continua e custa 1 PD', () => {
  const result = evaluateSelection(base({ fearDie: 8 }), {
    ...emptySelection(),
    controlFear: true,
  });
  assert.equal(result.pdCost, 1);
  assert.deepEqual(result.fear, { die: 6, bonusDie: null });
  assert.deepEqual(result.rolledSides, [8, 6]); // o pavor não conta nos dados rolados
});

test('controlar em d4 não custa nada', () => {
  const result = evaluateSelection(base({ fearDie: 4 }), {
    ...emptySelection(),
    controlFear: true,
  });
  assert.equal(result.pdCost, 0);
  assert.equal(result.selection.controlFear, false);
});

test('PD insuficiente marca erro', () => {
  const model = base({ fearDie: 8, resources: { impeto: 2, pd: 4 } });
  const result = evaluateSelection(model, { ...emptySelection(), embraceFear: true });
  assert.deepEqual(result.errors, ['pd']);
  assert.equal(result.valid, false);
});

test('mais de 4 dados: os extras finais são descartados e só 3 somam', () => {
  const model = base({ baseExtraDice: [6] });
  const result = evaluateSelection(model, {
    bonus: [10, 12],
    active: ['impetoDado'],
    controlFear: false,
    embraceFear: false,
  });
  assert.deepEqual(result.rolledSides, [8, 6, 6, 10]);
  assert.deepEqual(result.discardedExtras, [12, 4]);
  assert.equal(result.summedDice, 3);
});

test('selectionToOptions entrega só o que as rolagens aceitam', () => {
  const model = base({ fearDie: 6, skillKey: 'furtividade' });
  const options = selectionToOptions(model, {
    bonus: [8, 0],
    active: ['sorrateiro', 'inexistente'],
    controlFear: true,
    embraceFear: false,
  });
  assert.deepEqual(options, {
    extraDice: [8],
    active: ['sorrateiro'],
    controlFear: true,
    embraceFear: false,
  });
});
