/**
 * v0.21.6 — itens gerais: cura, passo no alvo, ferramenta e ação com aviso; botão Usar com efeitos
 * de uso; maleta dos primeiros socorros pelo efeito (com o nome como alternativa).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bagUpdates,
  costBag,
  hasTool,
  itemEffectTypes,
  itemUsePlan,
  normalizeEffects,
  ownEffects,
  collectEffects,
} from '../scripts/rolls/ability-effects.js';
import { describeEffect, editorRows } from '../scripts/rolls/ability-effects-editor.js';
import { itemUseState } from '../scripts/rolls/equipment.js';
import { itemStepEffect } from '../scripts/rolls/effects.js';
import { hasMedicalKit } from '../scripts/rolls/first-aid.js';
import { buildEquipmentRows } from '../scripts/sheets/context.js';

const t = (key, data) => (data ? `${key}:${JSON.stringify(data)}` : key);
const gear = (name, efeitos, extra = {}) => ({
  id: name,
  name,
  type: 'item',
  system: {
    descricao: '',
    quantidade: 1,
    consumivel: false,
    usosMax: 0,
    usos: 0,
    empunhadura: 'uma',
    empunhada: false,
    efeitos,
    ...extra,
  },
});

test('itemUsePlan junta curas, passos, notas e o custo das ações com aviso', () => {
  const effects = normalizeEffects([
    { id: 'c', tipo: 'curar', params: { formula: '2d4', recursoCura: 'pv' } },
    { id: 'p', tipo: 'passoAlvo', params: { atributo: 'fisico', passos: 1 } },
    {
      id: 'n',
      tipo: 'acaoNota',
      params: { texto: 'Anota a pista', custo: { tipo: 'pd', valor: 1 } },
    },
    { id: 'f', tipo: 'ferramenta', params: { ferramenta: 'medicina' } },
  ]);
  const plan = itemUsePlan(effects);
  assert.deepEqual(plan.heals, [{ formula: '2d4', recurso: 'pv' }]);
  assert.deepEqual(plan.steps, [{ atributo: 'fisico', passos: 1 }]);
  assert.deepEqual(plan.notes, ['Anota a pista']);
  assert.deepEqual(plan.cost, { pd: 1, pv: 0, recursos: {} });
  assert.equal(plan.hasUse, true);
  // Só ferramenta (passiva): sem efeito de uso
  assert.equal(itemUsePlan([effects[3]]).hasUse, false);
  assert.equal(itemUsePlan([]).hasUse, false);
});

test('passoAlvo aceita passos negativos; zero não entrega nada', () => {
  const [down, zero] = normalizeEffects([
    { id: 'a', tipo: 'passoAlvo', params: { atributo: 'mente', passos: -2 } },
    { id: 'b', tipo: 'passoAlvo', params: { atributo: 'mente', passos: 0 } },
  ]);
  assert.equal(down.params.passos, -2);
  assert.deepEqual(itemUsePlan([down]).steps, [{ atributo: 'mente', passos: -2 }]);
  assert.deepEqual(itemUsePlan([zero]).steps, []);
});

test('bagUpdates paga PD, PV e recursos sem passar de 0', () => {
  const bag = { pd: 2, pv: 1, recursos: { impeto: 1 } };
  assert.deepEqual(bagUpdates(bag, { pd: 1, pv: 5, recursos: { impeto: 3 } }), {
    'system.pd.value': 0,
    'system.pv.value': 4,
    'system.recursosHab.impeto': 2,
  });
  assert.deepEqual(bagUpdates(costBag({ tipo: 'nenhum', valor: 0 }), { pd: 3 }), {});
});

test('itemUseState: Usar aparece com efeitos de uso mesmo sem limite, e não gasta nada', () => {
  const free = { usosMax: 0, usos: 0, consumivel: false, quantidade: 1 };
  assert.deepEqual(itemUseState(free, true), { show: true, canUse: true, changes: null });
  assert.deepEqual(itemUseState(free, false), { show: false, canUse: false, changes: null });
  const consumable = { usosMax: 0, usos: 0, consumivel: true, quantidade: 2 };
  assert.deepEqual(itemUseState(consumable, true), {
    show: true,
    canUse: true,
    changes: { 'system.quantidade': 1 },
  });
  const empty = { ...consumable, quantidade: 0 };
  assert.equal(itemUseState(empty, true).canUse, false);
});

test('itemStepEffect: efeito até o fim da cena, com limite de ±3 passos', () => {
  const effect = itemStepEffect({ nome: 'Tônico', atributo: 'fisico', passos: 1 });
  assert.equal(effect.nome, 'Tônico');
  assert.equal(effect.atributo, 'fisico');
  assert.equal(effect.passos, 1);
  assert.equal(effect.fimDeCena, true);
  assert.equal(effect.origem, 'item');
  assert.equal(itemStepEffect({ nome: 'x', atributo: 'fisico', passos: 9 }).passos, 3);
  assert.equal(itemStepEffect({ nome: 'x', atributo: 'outro', passos: 1 }).atributo, '');
});

test('hasMedicalKit: pelo efeito ferramenta; o nome continua valendo para itens antigos', () => {
  const kit = gear('Bolsa de ervas', [
    { id: 'f', tipo: 'ferramenta', params: { ferramenta: 'medicina' } },
  ]);
  assert.equal(hasMedicalKit([kit]), true);
  assert.equal(hasMedicalKit([gear('Maleta de medicamentos', [])]), true);
  assert.equal(hasMedicalKit([gear('Corda', [])]), false);
  assert.equal(hasTool(collectEffects([kit]), 'medicina'), true);
  assert.equal(hasTool([], 'medicina'), false);
});

test('os efeitos do item geral não aparecem na habilidade', () => {
  for (const tipo of ['curar', 'passoAlvo', 'ferramenta']) {
    assert.equal(itemEffectTypes('habilidade').includes(tipo), false, tipo);
    assert.equal(itemEffectTypes('item').includes(tipo), true, tipo);
  }
  assert.ok(itemEffectTypes('item').includes('acaoNota'));
  // Na arma, nenhum deles vale
  const sword = { type: 'arma', system: { efeitos: [{ id: 'c', tipo: 'curar', params: {} }] } };
  assert.deepEqual(ownEffects(sword), []);
});

test('editor: no item, a ação com aviso esconde o rótulo de botão da habilidade', () => {
  const effects = normalizeEffects([{ id: 'n', tipo: 'acaoNota', params: {} }]);
  const keys = (itemType) =>
    editorRows(effects, { t, skills: [], openId: 'n', itemType })[0].fields.map((f) => f.key);
  assert.equal(keys('item').includes('rotulo'), false);
  assert.equal(keys('item').includes('texto'), true);
  assert.equal(keys('habilidade').includes('rotulo'), true);
});

test('describeEffect: resumos da cura, do passo no alvo e da ferramenta', () => {
  const [heal, step, tool] = normalizeEffects([
    { id: 'c', tipo: 'curar', params: { formula: '2d4', recursoCura: 'pv' } },
    { id: 'p', tipo: 'passoAlvo', params: { atributo: 'fisico', passos: 1 } },
    { id: 'f', tipo: 'ferramenta', params: {} },
  ]);
  const labels = { t, skill: (k) => k };
  assert.ok(describeEffect(heal, labels).includes('"formula":"2d4"'));
  assert.ok(describeEffect(step, labels).includes('"passos":"+1"'));
  assert.ok(describeEffect(tool, labels).includes('Ferramentas.medicina'));
});

test('buildEquipmentRows: item com efeito de uso mostra Usar sem limite de usos', () => {
  const labels = { kindLabel: (k) => k, handsLabel: (n) => `${n}`, skillLabel: (k) => k };
  const tonic = gear('Tônico', [
    { id: 'p', tipo: 'passoAlvo', params: { atributo: 'fisico', passos: 1 } },
  ]);
  const plain = gear('Tenaz', []);
  const rows = buildEquipmentRows([tonic, plain], labels).others;
  assert.deepEqual(
    rows.map((r) => [r.name, r.showUse, r.canUse]),
    [
      ['Tônico', true, true],
      ['Tenaz', false, false],
    ],
  );
});
