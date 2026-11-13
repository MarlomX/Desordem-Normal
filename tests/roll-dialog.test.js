import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRollModel,
  emptySelection,
  evaluateSelection,
  normalizeDt,
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
  const vinte = base({ fearDie: 20 }).fear;
  assert.equal(vinte.controlPossible, true);
  assert.equal(vinte.controlledDie, 12);
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
    dt: 7,
  });
});

const kinds = (result) => result.slots.map((slot) => slot.kind);

test('dado de ímpeto e sorrateira ocupam os dois espaços, travados', () => {
  const model = base({ skillKey: 'crime' });
  const result = evaluateSelection(model, {
    ...emptySelection(),
    active: ['impetoDado', 'sorrateiro'],
  });
  assert.deepEqual(kinds(result), ['impetoDado', 'sorrateiro']);
  assert.equal(
    result.slots.every((slot) => slot.locked),
    true,
  );
  assert.deepEqual(result.rolledSides, [8, 6, 4, 8]);
});

test('o dado fixo do companheiro ocupa um espaço e sobra um para bônus', () => {
  const model = base({ baseExtraDice: [6] });
  const result = evaluateSelection(model, { ...emptySelection(), bonus: [10, 12] });
  assert.deepEqual(kinds(result), ['base', 'manual']);
  assert.deepEqual(result.selection.bonus, [10, 0]); // o segundo bônus não cabe
  assert.deepEqual(result.rolledSides, [8, 6, 6, 10]);
});

test('bônus manuais cheios bloqueiam habilidades e abraçar o pavor', () => {
  const model = base({ skillKey: 'crime', fearDie: 8 });
  const result = evaluateSelection(model, { ...emptySelection(), bonus: [8, 10] });
  assert.deepEqual(kinds(result), ['manual', 'manual']);
  assert.deepEqual(result.blocked.abilities, ['impetoDado', 'sorrateiro']);
  assert.equal(result.blocked.embrace, true);
});

test('com um espaço livre nada fica bloqueado; controlar o pavor nunca ocupa espaço', () => {
  const model = base({ fearDie: 8 });
  const result = evaluateSelection(model, {
    ...emptySelection(),
    bonus: [8, 0],
    controlFear: true,
  });
  assert.deepEqual(result.blocked, { abilities: [], embrace: false });
  assert.deepEqual(kinds(result), ['manual', 'vazio']);
});

test('habilidade marcada continua desbloqueada para poder ser desmarcada', () => {
  const model = base({ skillKey: 'crime' });
  const result = evaluateSelection(model, {
    ...emptySelection(),
    active: ['impetoDado', 'sorrateiro'],
  });
  assert.deepEqual(result.blocked.abilities, []);
});

test('pavor abraçado ocupa um espaço travado; o pavor normal não ocupa', () => {
  const model = base({ fearDie: 8 });
  const embraced = evaluateSelection(model, { ...emptySelection(), embraceFear: true });
  assert.deepEqual(kinds(embraced), ['pavor', 'vazio']);
  const normal = evaluateSelection(model, emptySelection());
  assert.deepEqual(kinds(normal), ['vazio', 'vazio']);
  assert.deepEqual(normal.rolledSides, [8, 6]);
});

test('pedido além dos espaços é ignorado: companheiro + ímpeto + abraçar', () => {
  const model = base({ baseExtraDice: [6], fearDie: 8 });
  const result = evaluateSelection(model, {
    ...emptySelection(),
    active: ['impetoDado'],
    embraceFear: true,
  });
  assert.deepEqual(kinds(result), ['base', 'impetoDado']);
  assert.equal(result.selection.embraceFear, false);
  assert.equal(result.pdCost, 0); // o pavor abraçado que não coube não custa
  assert.equal(result.rolledSides.length, 4);
});

test('nunca passa de 4 dados rolados', () => {
  const model = base({ skillKey: 'crime', baseExtraDice: [6], fearDie: 8 });
  const result = evaluateSelection(model, {
    bonus: [12, 12],
    active: ['impetoDado', 'sorrateiro'],
    controlFear: false,
    embraceFear: true,
    dt: 7,
  });
  assert.equal(result.rolledSides.length, 4);
  assert.equal(result.slots.length, 2);
});

test('DT: padrão 7, editável e validada', () => {
  assert.equal(evaluateSelection(base()).dt, 7);
  assert.equal(evaluateSelection(base({ dt: 10 })).dt, 10);
  assert.equal(evaluateSelection(base(), { ...emptySelection(), dt: 13 }).dt, 13);
  assert.equal(evaluateSelection(base(), { ...emptySelection(), dt: 'abc' }).dt, 7);
  assert.equal(normalizeDt(0), 7);
  assert.equal(normalizeDt(-3, 10), 10);
  assert.equal(normalizeDt(250), 99);
  assert.equal(normalizeDt('12'), 12);
});

test('teste sem DT (esquiva) não devolve dt', () => {
  const model = base({ showDt: false });
  assert.equal(evaluateSelection(model).dt, null);
  assert.equal('dt' in selectionToOptions(model, emptySelection()), false);
});
