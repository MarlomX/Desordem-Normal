import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRollModel,
  emptySelection,
  evaluateSelection,
  selectionToOptions,
} from '../scripts/rolls/roll-dialog.js';

const baseInput = {
  skillKey: 'atletismo',
  attrDie: 8,
  skillDie: 6,
  has: {},
  resources: { impeto: 0, pd: 5 },
};
const chase = (extra = {}) => ({ blocked: null, folego: 3, effortDice: 2, ...extra });
const withAdvance = (avanco) => ({ ...emptySelection(7), avanco });

test('sem perseguição, a janela pré-teste não muda', () => {
  const model = buildRollModel(baseInput);
  assert.equal(model.avanco, null);
  const evaluated = evaluateSelection(model, withAdvance({ on: true, breath: 2, effort: true }));
  assert.deepEqual(evaluated.rolledSides, [8, 6]);
  assert.equal(evaluated.avanco.on, false);
  assert.equal('avanco' in selectionToOptions(model, withAdvance({ on: true, breath: 2 })), false);
});

test('opção marcada: fôlego vira d6 fixos no preview', () => {
  const model = buildRollModel({ ...baseInput, chase: chase() });
  const evaluated = evaluateSelection(model, withAdvance({ on: true, breath: 2, effort: false }));
  assert.deepEqual(evaluated.rolledSides, [8, 6, 6, 6]);
  assert.deepEqual(
    evaluated.slots.map((slot) => slot.kind),
    ['folego', 'folego'],
  );
  assert.deepEqual(evaluated.avanco, { on: true, breath: 2, effort: false });
});

test('esforço extra sobe o dado da perícia no preview', () => {
  const model = buildRollModel({ ...baseInput, chase: chase() });
  const evaluated = evaluateSelection(model, withAdvance({ on: true, breath: 0, effort: true }));
  assert.deepEqual(evaluated.rolledSides, [8, 8]);
  assert.equal(evaluated.avanco.effort, true);
});

test('opção desmarcada: nada muda', () => {
  const model = buildRollModel({ ...baseInput, chase: chase() });
  const evaluated = evaluateSelection(model, withAdvance({ on: false, breath: 2, effort: true }));
  assert.deepEqual(evaluated.rolledSides, [8, 6]);
  assert.deepEqual(evaluated.avanco, { on: false, breath: 0, effort: false });
});

test('o fôlego respeita o que o personagem tem, o máximo por teste e os espaços livres', () => {
  const few = buildRollModel({ ...baseInput, chase: chase({ folego: 1 }) });
  assert.equal(evaluateSelection(few, withAdvance({ on: true, breath: 2 })).avanco.breath, 1);
  const many = buildRollModel({ ...baseInput, chase: chase({ folego: 6 }) });
  assert.equal(evaluateSelection(many, withAdvance({ on: true, breath: 9 })).avanco.breath, 2);
  // um dado fixo do teste (companheiro) ocupa um espaço
  const companion = buildRollModel({
    ...baseInput,
    baseExtraDice: [6],
    chase: chase({ folego: 6 }),
  });
  const evaluated = evaluateSelection(companion, withAdvance({ on: true, breath: 2 }));
  assert.equal(evaluated.avanco.breath, 1);
  assert.equal(evaluated.rolledSides.length, 4);
  assert.equal(evaluateSelection(many, withAdvance({ on: true, breath: -3 })).avanco.breath, 0);
});

test('avanço bloqueado ignora a escolha', () => {
  for (const blocked of ['agiu', 'pericia']) {
    const model = buildRollModel({ ...baseInput, chase: chase({ blocked }) });
    const evaluated = evaluateSelection(model, withAdvance({ on: true, breath: 2, effort: true }));
    assert.equal(evaluated.avanco.on, false);
    assert.deepEqual(evaluated.rolledSides, [8, 6]);
  }
});

test('o avanço funciona em testes sem DT (como o oposto da esquiva)', () => {
  const model = buildRollModel({
    ...baseInput,
    skillKey: 'acrobacia',
    showDt: false,
    chase: chase(),
  });
  const options = selectionToOptions(model, withAdvance({ on: true, breath: 1, effort: true }));
  assert.deepEqual(options.avanco, { on: true, breath: 1, effort: true });
  assert.equal('dt' in options, false);
});

test('selectionToOptions entrega a escolha de avanço para a ficha', () => {
  const model = buildRollModel({ ...baseInput, chase: chase() });
  const options = selectionToOptions(model, withAdvance({ on: true, breath: 2, effort: true }));
  assert.deepEqual(options.avanco, { on: true, breath: 2, effort: true });
  // o fôlego não vira bônus manual: a ficha o acrescenta aos dados na hora de rolar
  assert.deepEqual(options.extraDice, []);
});
