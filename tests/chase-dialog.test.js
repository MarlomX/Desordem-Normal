// Janela pré-teste dentro da perseguição: fôlego e esforço extra.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildRollModel,
  emptySelection,
  evaluateSelection,
  selectionToOptions,
} from '../scripts/rolls/roll-dialog.js';
import { legacyDice } from './helpers.js';

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
  assert.deepEqual(evaluated.avanco, { on: true, breath: 2, effort: false, dt: 7 });
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
  assert.deepEqual(evaluated.avanco, { on: false, breath: 0, effort: false, dt: null });
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
  for (const blocked of ['agiu', 'inativa']) {
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
  assert.deepEqual(options.avanco, { on: true, breath: 1, effort: true, dt: 10 });
  assert.equal('dt' in options, false);
});

test('selectionToOptions entrega a escolha de avanço para a ficha', () => {
  const model = buildRollModel({ ...baseInput, chase: chase() });
  const options = selectionToOptions(model, withAdvance({ on: true, breath: 2, effort: true }));
  assert.deepEqual(options.avanco, { on: true, breath: 2, effort: true, dt: 7 });
  // o fôlego não vira bônus manual: a ficha o acrescenta aos dados na hora de rolar
  assert.deepEqual(options.extraDice, []);
});

test('todo tipo de dado do preview tem rótulo em português e em inglês', () => {
  const origins = ['pt-BR', 'en'].map(
    (lang) =>
      JSON.parse(readFileSync(new URL(`../lang/${lang}.json`, import.meta.url), 'utf8')).DESORDEM
        .Teste.Pre.Origem,
  );
  const model = buildRollModel({
    ...baseInput,
    baseExtraDice: [6],
    has: { naoLetal: true },
    diceOptions: legacyDice('furtividade'),
    skillKey: 'furtividade',
    resources: { impeto: 5, pd: 9 },
    fearDie: 6,
    chase: chase(),
  });
  const kinds = new Set();
  const runs = [
    { avanco: { on: true, breath: 2 } },
    { active: ['impetoDado'] },
    { active: ['sorrateiro'] },
    { active: ['naoLetal'] },
    { embraceFear: true },
    { bonus: [6, 0] },
    {},
  ];
  for (const run of runs) {
    for (const slot of evaluateSelection(model, { ...emptySelection(7), ...run }).slots) {
      kinds.add(slot.kind);
    }
  }
  for (const kind of [
    'folego',
    'base',
    'impetoDado',
    'sorrateiro',
    'naoLetal',
    'pavor',
    'manual',
  ]) {
    assert.ok(kinds.has(kind), `o teste não gerou o tipo ${kind}`);
  }
  for (const origin of origins) {
    for (const kind of kinds) assert.equal(typeof origin[kind], 'string', `falta Origem.${kind}`);
  }
});

test('a DT do avanço é a do campo da janela, e a da perseguição quando o teste não tem campo', () => {
  const model = buildRollModel({ ...baseInput, chase: chase({ dt: 12 }) });
  // o jogador mudou o campo da DT para 15
  const picked = evaluateSelection(model, {
    ...emptySelection(7),
    dt: 15,
    avanco: { on: true, breath: 0, effort: false },
  });
  assert.equal(picked.avanco.dt, 15);
  // sem campo de DT (esquiva), vale a DT da perseguição
  const noField = buildRollModel({
    ...baseInput,
    skillKey: 'acrobacia',
    showDt: false,
    chase: chase({ dt: 12 }),
  });
  assert.equal(evaluateSelection(noField, withAdvance({ on: true })).avanco.dt, 12);
  // sem a opção marcada não há DT de avanço
  assert.equal(evaluateSelection(model, emptySelection(7)).avanco.dt, null);
});

test('a DT da perseguição inválida volta ao padrão 10', () => {
  const model = buildRollModel({ ...baseInput, showDt: false, chase: chase({ dt: 'x' }) });
  assert.equal(evaluateSelection(model, withAdvance({ on: true })).avanco.dt, 10);
});

test('perícia já usada só gera um lembrete: o avanço continua valendo', () => {
  const model = buildRollModel({ ...baseInput, chase: chase({ warning: 'pericia' }) });
  assert.equal(model.avanco.warning, 'pericia');
  assert.equal(model.avanco.blocked, null);
  const evaluated = evaluateSelection(model, withAdvance({ on: true, breath: 1, effort: false }));
  assert.equal(evaluated.avanco.on, true);
  assert.equal(buildRollModel({ ...baseInput, chase: chase() }).avanco.warning, null);
});
