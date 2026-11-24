// Companheiro animal como opção da janela pré-teste (v0.27.0)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  collectEffects,
  companionHurt,
  companionOption,
  dialogDiceOptions,
} from '../scripts/rolls/ability-effects.js';
import { activeBoosts, creatureSceneReset } from '../scripts/rolls/abilities.js';
import { buildRollModel, evaluateSelection, emptySelection } from '../scripts/rolls/roll-dialog.js';
import { buildCreatureAbilityRows } from '../scripts/sheets/creature-context.js';

/** Ator com a habilidade Companheiro Animal (d6, do tipo pedido) e, se quiser, outros efeitos. */
const actorWith = (teste = 'ataqueCorpo', dado = 6, extra = []) =>
  collectEffects([
    {
      id: 'hab1',
      name: 'Companheiro Animal',
      type: 'habilidade',
      system: {
        efeitos: [{ id: 'companheiro', tipo: 'companheiro', params: { dado, teste } }, ...extra],
      },
    },
  ]);

const model = (entries, context) =>
  buildRollModel({
    skillKey: 'luta',
    attrDie: 6,
    skillDie: 8,
    diceOptions: dialogDiceOptions(entries, { skillKey: 'luta', ...context }),
    resources: { pd: 5 },
  });

// ---------- Opção da janela ----------

test('companionOption: só no tipo do efeito; «qualquer teste» vale em todo teste de perícia', () => {
  const corpo = actorWith('ataqueCorpo');
  assert.equal(companionOption(corpo, { testKind: 'ataqueCorpo', hurt: false }).die, 6);
  assert.equal(companionOption(corpo, { testKind: 'ataqueDistancia', hurt: false }), null);
  assert.equal(companionOption(corpo, { testKind: 'qualquer', hurt: false }), null);
  const any = actorWith('qualquer', 8);
  for (const testKind of ['qualquer', 'ataqueCorpo', 'ataqueDistancia', 'defesa']) {
    assert.equal(companionOption(any, { testKind, hurt: false }).die, 8);
  }
  assert.equal(companionOption(collectEffects([]), { testKind: 'qualquer', hurt: false }), null);
});

test('companionOption: marcada e sem custo; ferido, desmarcada e apagada', () => {
  const entries = actorWith('qualquer');
  const ok = companionOption(entries, { testKind: 'qualquer', hurt: false });
  assert.equal(ok.key, 'companheiro');
  assert.equal(ok.itemName, 'Companheiro Animal');
  assert.equal(ok.checked, true);
  assert.equal(ok.companion, true);
  assert.equal(ok.unavailable, undefined);
  assert.deepEqual(ok.cost, { pd: 0, pv: 0, recursos: {} });
  const hurt = companionOption(entries, { testKind: 'qualquer', hurt: true });
  assert.equal(hurt.checked, false);
  assert.equal(hurt.unavailable, 'ferido');
});

test('dialogDiceOptions: o companheiro vem primeiro e some com `companion: false`', () => {
  const entries = actorWith('qualquer', 6, [{ id: 'd1', tipo: 'dadoExtra', params: { dado: 10 } }]);
  assert.deepEqual(
    dialogDiceOptions(entries, { skillKey: 'luta' }).map((o) => [o.key, o.die]),
    [
      ['companheiro', 6],
      ['d1', 10],
    ],
  );
  assert.deepEqual(
    dialogDiceOptions(entries, { skillKey: 'vigor', companion: false }).map((o) => o.key),
    ['d1'],
  );
});

test('buildRollModel: companheiro marcado; ferido, indisponível pelo motivo «ferido»', () => {
  const ok = model(actorWith('qualquer'), {}).abilities[0];
  assert.equal(ok.available, true);
  assert.equal(ok.checked, true);
  const hurt = model(actorWith('qualquer'), { hurtCompanion: true }).abilities[0];
  assert.equal(hurt.available, false);
  assert.equal(hurt.reason, 'ferido');
  assert.equal(hurt.checked, undefined);
});

test('evaluateSelection: o companheiro ocupa um espaço; ferido, não entra mesmo marcado', () => {
  const ok = model(actorWith('qualquer'), {});
  const chosen = evaluateSelection(ok, { ...emptySelection(7), active: ['companheiro'] });
  assert.deepEqual(chosen.selection.active, ['companheiro']);
  assert.deepEqual(chosen.rolledSides, [6, 8, 6]);
  const hurt = model(actorWith('qualquer'), { hurtCompanion: true });
  const ignored = evaluateSelection(hurt, { ...emptySelection(7), active: ['companheiro'] });
  assert.deepEqual(ignored.selection.active, []);
  assert.deepEqual(ignored.rolledSides, [6, 8]);
});

// ---------- Rolagem ----------

test('activeBoosts: a posição do dado do companheiro (`companionAt`)', () => {
  const entries = actorWith('qualquer', 8, [{ id: 'd1', tipo: 'dadoExtra', params: { dado: 4 } }]);
  const diceOptions = dialogDiceOptions(entries, { skillKey: 'luta' });
  const both = activeBoosts(['d1', 'companheiro'], { skillKey: 'luta', pd: 0, diceOptions });
  assert.deepEqual(both.extraDice, [8, 4]);
  assert.equal(both.companionAt, 0);
  assert.deepEqual(both.used, ['companheiro', 'd1']);
  const without = activeBoosts(['d1'], { skillKey: 'luta', pd: 0, diceOptions });
  assert.equal(without.companionAt, null);
});

test('activeBoosts: companheiro ferido não entra, mesmo marcado', () => {
  const diceOptions = dialogDiceOptions(actorWith('qualquer'), {
    skillKey: 'luta',
    hurtCompanion: true,
  });
  const boosts = activeBoosts(['companheiro'], { skillKey: 'luta', pd: 0, diceOptions });
  assert.deepEqual(boosts.extraDice, []);
  assert.equal(boosts.companionAt, null);
});

test('companionHurt: confere o dado pela posição, pela origem e pelas faces', () => {
  const die = (sides, value, source = 'extra') => ({ sides, value, source });
  const result = { dice: [die(6, 4, 'attribute'), die(8, 2, 'skill'), die(4, 3), die(6, 1)] };
  // Bônus manual d4 antes, companheiro d6 depois: posição 1 entre os extras
  assert.equal(companionHurt(result, { index: 1, sides: 6 }), true);
  assert.equal(companionHurt(result, { index: 0, sides: 4 }), false); // deu 3
  assert.equal(companionHurt(result, { index: 1, sides: 8 }), false); // faces erradas
  assert.equal(companionHurt(result, { index: 5, sides: 6 }), false); // não existe
  assert.equal(companionHurt(result, null), false); // o companheiro não entrou
  assert.equal(companionHurt(null, { index: 0, sides: 6 }), false);
  const base = { dice: [die(6, 1, 'attribute'), die(6, 1, 'skill')] };
  assert.equal(companionHurt(base, { index: -2, sides: 6 }), false); // nunca um dado-base
});

// ---------- Criatura ----------

test('creatureSceneReset: o companheiro da criatura volta a ajudar na Nova cena', () => {
  assert.equal(creatureSceneReset([])['system.cena.animalFerido'], false);
});

test('buildCreatureAbilityRows: caixa «companheiro ferido» só na habilidade com o companheiro', () => {
  const items = [
    {
      id: 'a',
      name: 'Lobo',
      type: 'habilidade',
      system: { efeitos: [{ id: 'c', tipo: 'companheiro', params: { dado: 6 } }] },
    },
    { id: 'b', name: 'Garras', type: 'habilidade', system: { efeitos: [] } },
  ];
  const rows = buildCreatureAbilityRows(items, { hurtCompanion: true });
  const by = Object.fromEntries(rows.map((row) => [row.name, row]));
  assert.equal(by.Lobo.showCompanion, true);
  assert.equal(by.Lobo.animalFerido, true);
  assert.equal(by.Garras.showCompanion, false);
  assert.equal(by.Garras.animalFerido, false);
  assert.equal(buildCreatureAbilityRows(items)[1].animalFerido, false);
});
