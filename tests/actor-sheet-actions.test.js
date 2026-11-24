/**
 * Ações comuns das fichas de personagem e de criatura (`sheets/actor-sheet-actions.js`, v0.28.5).
 * Cada ação é chamada com `this` = a ficha, como o ApplicationV2 faz.
 */
import { resetFoundry } from './foundry-stub.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attributeField,
  deleteItem,
  editItem,
  enrichActorNote,
  removeEffectAction,
  stepSteps,
  toggleAbilities,
} from '../scripts/sheets/actor-sheet-actions.js';

/** Ficha de mentira em volta de um ator com `system` e itens. */
function makeSheet(system, items = []) {
  const updates = [];
  const document = {
    isOwner: true,
    system,
    items: { get: (id) => items.find((item) => item.id === id) },
    toObject: () => ({ system: structuredClone(system) }),
    getRollData: () => ({ pv: 3 }),
    async update(changes) {
      updates.push(changes);
    },
  };
  return { sheet: { document }, updates };
}

const target = (dataset) => ({ dataset });

test('removeEffectAction tira o efeito da linha clicada', async () => {
  resetFoundry();
  const { sheet, updates } = makeSheet({ efeitos: [{ id: 'a' }, { id: 'b' }] });
  await removeEffectAction.call(sheet, null, target({ index: '0' }));
  assert.deepEqual(
    updates[0]['system.efeitos'].map((effect) => effect.id),
    ['b'],
  );
});

test('stepSteps: −/+ num atributo respeita o limite do dado; o geral não tem limite; zerar', async () => {
  resetFoundry();
  const system = {
    atributos: { fisico: 12, mente: 6, emocao: 6 },
    passos: { fisico: 0, mente: 0, emocao: 0, pericias: 0 },
    efeitos: [],
  };
  const { sheet, updates } = makeSheet(system);
  await stepSteps.call(sheet, null, target({ key: 'fisico', delta: '1' }));
  await stepSteps.call(sheet, null, target({ key: 'mente', delta: '1' }));
  await stepSteps.call(sheet, null, target({ key: 'pericias', delta: '-3' }));
  system.passos.mente = 2;
  await stepSteps.call(sheet, null, target({ key: 'mente', reset: '1' }));
  assert.deepEqual(updates, [
    { 'system.passos.fisico': 0 },
    { 'system.passos.mente': 1 },
    { 'system.passos.pericias': -3 },
    { 'system.passos.mente': 0 },
  ]);
});

test('attributeField grava a troca do atributo-base e ignora valor inválido', async () => {
  resetFoundry();
  const { sheet, updates } = makeSheet({ atributosPericias: {} });
  await attributeField.call(sheet, { dataset: { key: 'luta' }, value: 'mente' });
  await attributeField.call(sheet, { dataset: { key: 'luta' }, value: 'inventado' });
  assert.equal(updates.length, 1);
  assert.deepEqual(Object.keys(updates[0]), ['system.atributosPericias.luta']);
});

test('deleteItem só apaga depois de confirmar; editItem abre a ficha do item', async () => {
  resetFoundry();
  const calls = [];
  const item = {
    id: 'i1',
    delete: async () => calls.push('delete'),
    sheet: { render: (force) => calls.push(['render', force]) },
  };
  const { sheet } = makeSheet({}, [item]);
  const { DialogV2 } = foundry.applications.api;
  DialogV2.answer = false;
  await deleteItem.call(sheet, null, target({ itemId: 'i1' }));
  DialogV2.answer = true;
  await deleteItem.call(sheet, null, target({ itemId: 'i1' }));
  await deleteItem.call(sheet, null, target({ itemId: 'nao-existe' }));
  editItem.call(sheet, null, target({ itemId: 'i1' }));
  editItem.call(sheet, null, target({ itemId: 'nao-existe' }));
  assert.deepEqual(calls, ['delete', ['render', true]]);
  assert.equal(DialogV2.calls.length, 2);
  assert.equal(DialogV2.calls[0][1].window.title, 'DESORDEM.Item.Remover');
});

test('toggleAbilities abre todas; com todas abertas, fecha todas', () => {
  const details = [{ open: true }, { open: false }];
  const sheet = { element: { querySelectorAll: () => details } };
  toggleAbilities.call(sheet);
  assert.deepEqual(details, [{ open: true }, { open: true }]);
  toggleAbilities.call(sheet);
  assert.deepEqual(details, [{ open: false }, { open: false }]);
});

test('enrichActorNote passa o ator, os segredos do dono e os dados de rolagem', async () => {
  resetFoundry();
  const seen = [];
  foundry.applications.ux.TextEditor.implementation.enrichHTML = async (html, options) => {
    seen.push(options);
    return `<b>${html}</b>`;
  };
  const { sheet } = makeSheet({});
  assert.equal(await enrichActorNote(sheet.document, 'oi'), '<b>oi</b>');
  assert.equal(seen[0].secrets, true);
  assert.equal(seen[0].relativeTo, sheet.document);
  assert.deepEqual(seen[0].rollData, { pv: 3 });
});
