import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CREATURE_TABS,
  buildAttackRows,
  buildCreatureAbilityRows,
  creatureStatusTags,
  creatureTabForItemType,
  visibleSkillRows,
} from '../scripts/sheets/creature-context.js';
import { buildTabs, resolveActiveTab } from '../scripts/sheets/context.js';
import { checkEquipment, handsInUse } from '../scripts/rolls/equipment.js';

const arma = (id, name, system) => ({
  id,
  name,
  type: 'arma',
  system: { tipo: 'corpo', bonusDano: 0, pericia: '', naoLetal: false, descricao: '', ...system },
});

test('as abas da criatura são ficha, ações e notas, e uma aba desconhecida volta à primeira', () => {
  assert.deepEqual(
    CREATURE_TABS.map((tab) => tab.id),
    ['ficha', 'acoes', 'notas'],
  );
  assert.equal(resolveActiveTab('relacoes', CREATURE_TABS), 'ficha');
  assert.equal(resolveActiveTab('notas', CREATURE_TABS), 'notas');
  const tabs = buildTabs('acoes', (id) => id.toUpperCase(), CREATURE_TABS);
  assert.deepEqual(tabs.state, { ficha: false, acoes: true, notas: false });
});

test('a criatura só aceita armas e habilidades (que aparecem na aba de ações)', () => {
  assert.equal(creatureTabForItemType('arma'), 'acoes');
  assert.equal(creatureTabForItemType('habilidade'), 'acoes');
  assert.equal(creatureTabForItemType('armadura'), undefined);
  assert.equal(creatureTabForItemType('item'), undefined);
});

test('visibleSkillRows esconde as destreinadas, a menos que se peça todas', () => {
  const rows = [
    { key: 'luta', trained: true },
    { key: 'artes', trained: false },
  ];
  assert.deepEqual(
    visibleSkillRows(rows, false).map((r) => r.key),
    ['luta'],
  );
  assert.equal(visibleSkillRows(rows, true).length, 2);
});

test('buildAttackRows mostra o teste como no bloco de criatura e o dano da arma', () => {
  const items = [
    arma('b', 'Garras', { bonusDano: 1 }),
    arma('a', 'Arremesso', { tipo: 'distancia', bonusDano: -1 }),
    { id: 'h', name: 'Uivo', type: 'habilidade', system: { descricao: '' } },
  ];
  const dice = { luta: { attrDie: 8, skillDie: 6 }, pontaria: { attrDie: 8, skillDie: 4 } };
  const rows = buildAttackRows(items, {
    kindLabel: (k) => `[${k}]`,
    skillLabel: (k) => k,
    diceOf: (skill) => dice[skill],
  });
  assert.deepEqual(
    rows.map((r) => r.name),
    ['Arremesso', 'Garras'],
  );
  assert.equal(rows[1].testLabel, 'd8 + d6');
  assert.equal(rows[1].damageLabel, 'RA+1');
  assert.equal(rows[1].skillLabel, 'luta');
  assert.equal(rows[0].testLabel, 'd8 + d4');
  assert.equal(rows[0].damageLabel, 'RA−1');
  assert.equal(rows[0].kindLabel, '[distancia]');
  assert.equal(rows[0].locked, false);
});

test('buildCreatureAbilityRows lista só as habilidades, por nome, lembrando as abertas', () => {
  const items = [
    { id: 'z', name: 'Presença', type: 'habilidade', system: { descricao: 'texto' } },
    { id: 'y', name: 'Afogar', type: 'habilidade', system: { descricao: '' } },
    arma('x', 'Garras', {}),
  ];
  const rows = buildCreatureAbilityRows(items, { openIds: ['z'], editable: false });
  assert.deepEqual(
    rows.map((r) => r.id),
    ['y', 'z'],
  );
  assert.equal(rows[1].open, true);
  assert.equal(rows[0].locked, true);
});

test('creatureStatusTags marca a criatura derrotada com 0 PV', () => {
  assert.deepEqual(
    creatureStatusTags({ pv: { value: 3 } }, (k) => k),
    [],
  );
  assert.deepEqual(
    creatureStatusTags({ pv: { value: 0 } }, (k) => `!${k}`),
    [{ key: 'derrotada', label: '!derrotada', tone: 'grave' }],
  );
});

test('arma natural não ocupa as mãos nem é bloqueada pelo limite', () => {
  const held = [
    { empunhadura: 'duas', empunhada: true },
    { empunhadura: 'uma', empunhada: true, categoria: 'natural' },
  ];
  assert.deepEqual(handsInUse(held), { used: 2, over: false });
  const siblings = [{ id: 'e', type: 'arma', system: { empunhadura: 'duas', empunhada: true } }];
  const garras = {
    type: 'arma',
    system: { empunhadura: 'uma', empunhada: true, categoria: 'natural' },
  };
  assert.equal(checkEquipment(siblings, garras).ok, true);
  const faca = {
    type: 'arma',
    system: { empunhadura: 'uma', empunhada: true, categoria: 'simples' },
  };
  assert.equal(checkEquipment(siblings, faca).ok, false);
});
