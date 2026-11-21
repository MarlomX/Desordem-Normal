/**
 * v0.21.3 — armaduras e escudos: subtipo escudo (empunhado, sem pontos, um por vez), várias
 * armaduras vestidas, categoria marcial, penalidade passiva nas perícias, Armadura extra e os
 * tipos de efeito do escudo.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARMOR_EXTRA,
  armorPenaltyLine,
  armorSkillPenalties,
  armorStepMods,
  armorSummary,
  checkEquipment,
  handsInUse,
  isEquipped,
  pickArmorToSpend,
} from '../scripts/rolls/equipment.js';
import {
  armorExtraPoints,
  collectEffects,
  effectItemType,
  itemEffectTypes,
} from '../scripts/rolls/ability-effects.js';
import { describeEffect, effectSupported } from '../scripts/rolls/ability-effects-editor.js';
import { attackUsedLines } from '../scripts/sheets/ability-controls.js';
import { buildEquipmentRows, buildSkillRows } from '../scripts/sheets/context.js';

const t = (key, data) => (data ? `${key}:${JSON.stringify(data)}` : key);
const armor = (id, extra = {}) => ({
  id,
  name: id,
  type: 'armadura',
  system: {
    subtipo: 'armadura',
    categoria: 'simples',
    pontos: 1,
    restantes: 1,
    vestida: true,
    empunhada: false,
    penalidadePassos: 0,
    penalidadePericias: [],
    efeitos: [],
    ...extra,
  },
});
const shield = (id, extra = {}) => armor(id, { subtipo: 'escudo', vestida: false, ...extra });
const sword = (empunhada = true, extra = {}) => ({
  id: 's',
  name: 'Espada',
  type: 'arma',
  system: { categoria: 'simples', empunhadura: 'uma', empunhada, ...extra },
});

// ---------- Pontos ----------

test('armorSummary: várias armaduras somam; escudo nunca dá pontos', () => {
  const list = [
    armor('cota', { pontos: 2, restantes: 2 }),
    armor('elmo', { pontos: 1, restantes: 0 }),
    shield('esc', { pontos: 3, restantes: 3, vestida: true, empunhada: true }),
  ].map((a) => a.system);
  assert.deepEqual(armorSummary(list), { total: 3, available: 2, extra: 0, extraLeft: 0 });
});

test('armorSummary: Armadura extra só conta com uma armadura vestida que dê pontos', () => {
  const worn = [armor('cota', { pontos: 2, restantes: 1 }).system];
  assert.deepEqual(armorSummary(worn, { extra: 1, extraSpent: 0 }), {
    total: 3,
    available: 2,
    extra: 1,
    extraLeft: 1,
  });
  assert.equal(armorSummary(worn, { extra: 1, extraSpent: 1 }).available, 1);
  // Sem armadura vestida (ou só escudo), o extra não conta
  const none = [armor('cota', { vestida: false }).system, shield('e', { empunhada: true }).system];
  assert.deepEqual(armorSummary(none, { extra: 1 }), {
    total: 0,
    available: 0,
    extra: 0,
    extraLeft: 0,
  });
});

test('pickArmorToSpend: primeiro os pontos dos itens, depois a Armadura extra', () => {
  const full = [{ id: 'a', ...armor('a', { pontos: 1, restantes: 1 }).system }];
  assert.equal(pickArmorToSpend(full, { extra: 1 }), 'a');
  const empty = [{ id: 'a', ...armor('a', { pontos: 1, restantes: 0 }).system }];
  assert.equal(pickArmorToSpend(empty, { extra: 1, extraSpent: 0 }), ARMOR_EXTRA);
  assert.equal(pickArmorToSpend(empty, { extra: 1, extraSpent: 1 }), null);
  assert.equal(pickArmorToSpend(empty), null);
});

test('armorExtraPoints soma os efeitos de Armadura extra das habilidades', () => {
  const entries = collectEffects([
    {
      id: 'h',
      name: 'Segredo do Aço',
      type: 'habilidade',
      system: { efeitos: [{ id: 'x', tipo: 'armaduraExtra', params: { pontos: 1 } }] },
    },
  ]);
  assert.equal(armorExtraPoints(entries), 1);
  assert.equal(armorExtraPoints([]), 0);
});

// ---------- Equipar ----------

test('isEquipped: armadura vestida; escudo, arma e item empunhados', () => {
  assert.equal(isEquipped(armor('a')), true);
  assert.equal(isEquipped(shield('e')), false);
  assert.equal(isEquipped(shield('e', { empunhada: true })), true);
  assert.equal(isEquipped(sword(true)), true);
});

test('checkEquipment: várias armaduras vestidas; escudo ocupa uma mão e só um por vez', () => {
  assert.equal(checkEquipment([armor('a')], armor('b')).ok, true);
  const held = shield('e1', { empunhada: true });
  assert.deepEqual(checkEquipment([held], shield('e2', { empunhada: true })), {
    ok: false,
    reason: 'escudo',
  });
  // Espada de duas mãos empunhada: o escudo não cabe
  const twoHanded = sword(true, { empunhadura: 'duas' });
  assert.deepEqual(checkEquipment([twoHanded], shield('e', { empunhada: true })), {
    ok: false,
    reason: 'maos',
  });
  // Espada de uma mão + escudo: cabe; o escudo conta nas mãos para o próximo item
  assert.equal(checkEquipment([sword(true)], shield('e', { empunhada: true })).ok, true);
  assert.deepEqual(handsInUse([sword(true).system, held.system]), { used: 2, over: false });
  assert.deepEqual(checkEquipment([sword(true), held], sword(true, { empunhadura: 'uma' })), {
    ok: false,
    reason: 'maos',
  });
});

test('checkEquipment: armadura e escudo marciais precisam de proficiência', () => {
  const martial = armor('cota', { categoria: 'marcial' });
  assert.deepEqual(checkEquipment([], martial, { proficient: false }), {
    ok: false,
    reason: 'proficiencia',
  });
  assert.equal(checkEquipment([], martial, { proficient: true }).ok, true);
  const martialShield = shield('e', { categoria: 'marcial', empunhada: true });
  assert.equal(checkEquipment([], martialShield, { proficient: false }).reason, 'proficiencia');
  // Tirar a armadura sempre pode
  assert.equal(
    checkEquipment([], armor('cota', { categoria: 'marcial', vestida: false })).ok,
    true,
  );
});

test('buildEquipmentRows: escudo empunhado ocupa mão; outro escudo e marcial ficam travados', () => {
  const labels = { kindLabel: (k) => k, handsLabel: (n) => `${n}`, skillLabel: (k) => k };
  const rows = buildEquipmentRows(
    [
      shield('e1', { empunhada: true }),
      shield('e2'),
      armor('cota', { categoria: 'marcial', vestida: false }),
      armor('elmo'),
    ],
    { ...labels, proficient: false, armorBonus: { extra: 1, extraSpent: 0 } },
  );
  assert.deepEqual(rows.hands, { used: 1, over: false });
  assert.deepEqual(
    rows.armors.map((a) => [a.name, a.shield, a.equipField, a.blocked, a.blockReason]),
    [
      ['e1', true, 'empunhada', false, null],
      ['e2', true, 'empunhada', true, 'escudo'],
      ['cota', false, 'vestida', true, 'proficiencia'],
      ['elmo', false, 'vestida', false, null],
    ],
  );
  // Elmo vestido (1 ponto) + Armadura extra
  assert.deepEqual(rows.armorTotals, { total: 2, available: 2, extra: 1, extraLeft: 1 });
});

// ---------- Penalidade passiva ----------

test('armorSkillPenalties: só itens em uso; passos de vários itens somam', () => {
  const items = [
    armor('Cota', { penalidadePassos: 1, penalidadePericias: ['atletismo', 'furtividade'] }),
    armor('Elmo', { penalidadePassos: 1, penalidadePericias: ['percepcao', 'furtividade'] }),
    armor('Guardada', { vestida: false, penalidadePassos: 2, penalidadePericias: ['atletismo'] }),
    shield('Escudo', { empunhada: true, penalidadePassos: 1, penalidadePericias: ['acrobacia'] }),
  ];
  const penalties = armorSkillPenalties(items);
  assert.deepEqual(penalties.atletismo, { steps: 1, sources: ['Cota'] });
  assert.deepEqual(penalties.furtividade, { steps: 2, sources: ['Cota', 'Elmo'] });
  assert.deepEqual(penalties.acrobacia, { steps: 1, sources: ['Escudo'] });
  assert.equal(penalties.luta, undefined);
  assert.deepEqual(armorStepMods(penalties, 'furtividade'), [{ target: 'skill', steps: -2 }]);
  assert.deepEqual(armorStepMods(penalties, 'luta'), []);
});

test('armorPenaltyLine vai para a seção Itens e para a linha «Usou»', () => {
  const penalties = armorSkillPenalties([
    armor('Cota', { penalidadePassos: 1, penalidadePericias: ['atletismo'] }),
  ]);
  const line = armorPenaltyLine(penalties, 'atletismo');
  assert.equal(line.kind, 'penalidade');
  assert.equal(line.applies, true);
  assert.equal(armorPenaltyLine(penalties, 'luta'), null);
  assert.deepEqual(attackUsedLines([line], t), [
    'DESORDEM.Teste.UsouArma.penalidade:{"nome":"Cota","valor":1}',
  ]);
});

test('buildSkillRows: dado já reduzido; passo manual e penalidade somam antes (nunca d20)', () => {
  const base = { skillLabel: (k) => k, attrLabel: (k) => k, attributeDice: { fisico: 8 } };
  const penalties = { atletismo: { steps: 1, sources: ['Cota'] } };
  const rows = (skillStep) =>
    buildSkillRows(
      { atletismo: 12, luta: 12 },
      { atletismo: 'fisico', luta: 'fisico' },
      {
        ...base,
        skillStep,
        penalties,
        penaltyLabel: ({ steps, sources }) => `-${steps} ${sources.join()}`,
      },
    );
  const [atl, luta] = rows({ net: 0 });
  assert.equal(atl.shownDie, 10);
  assert.equal(atl.shiftDir, 'down');
  assert.equal(atl.penaltyNote, '-1 Cota');
  assert.equal(luta.shownDie, 12);
  assert.equal(luta.penaltyNote, '');
  // Passo manual +1: d12 −1 +1 = d12 (e a outra perícia continua em d12, sem passar)
  const [atlUp, lutaUp] = rows({ net: 1 });
  assert.equal(atlUp.shownDie, 12);
  assert.equal(lutaUp.shownDie, 12);
});

// ---------- Efeitos ----------

test('escudo é um tipo de efeito próprio; a redução do escudo ainda não tem uso automático', () => {
  assert.equal(effectItemType(shield('e')), 'escudo');
  assert.equal(effectItemType(armor('a')), 'armadura');
  assert.ok(itemEffectTypes('escudo').includes('reducaoEscudo'));
  assert.equal(itemEffectTypes('habilidade').includes('reducaoEscudo'), false);
  assert.ok(itemEffectTypes('habilidade').includes('armaduraExtra'));
  assert.equal(effectSupported({ tipo: 'reducaoEscudo', params: {} }, 'escudo'), false);
  assert.equal(effectSupported({ tipo: 'armaduraExtra', params: {} }), true);
  const text = describeEffect(
    { tipo: 'reducaoEscudo', params: { somaMinima: 7 } },
    { t, skill: (k) => k },
  );
  assert.ok(text.includes('"soma":7'));
});

test('efeitos do escudo só valem com ele empunhado', () => {
  const effect = { id: 'd', tipo: 'dadoExtra', params: { dado: 4 } };
  assert.equal(collectEffects([shield('e', { efeitos: [effect] })]).length, 0);
  const held = collectEffects([shield('e', { empunhada: true, efeitos: [effect] })]);
  assert.deepEqual(
    held.map((e) => [e.id, e.itemType]),
    [['d', 'escudo']],
  );
});
