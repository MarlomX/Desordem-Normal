import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_THREAT_SKILLS,
  buildElementRows,
  isThreat,
  normalizeElements,
  setPrimaryElement,
  testResources,
  threatDamage,
  toggleSecondaryElement,
} from '../scripts/rolls/threat.js';
import { addExtra, canAddExtra, findExtra, parseExtraKey } from '../scripts/rolls/extras.js';
import { resolveSkillAttribute } from '../scripts/rolls/attribute.js';

test('isThreat reconhece a criatura pelo ator ou pelo tipo', () => {
  assert.equal(isThreat({ type: 'criatura' }), true);
  assert.equal(isThreat('criatura'), true);
  assert.equal(isThreat({ type: 'personagem' }), false);
  assert.equal(isThreat(null), false);
  assert.equal(isThreat(undefined), false);
});

test('testResources lê os recursos do personagem e zera os que a criatura não tem', () => {
  const personagem = {
    pd: { value: 7, max: 10 },
    recursos: { impeto: 2, analise: 1 },
    estado: { pavor: 6 },
  };
  assert.deepEqual(testResources(personagem), { pd: 7, impeto: 2, analise: 1, fearDie: 6 });
  assert.deepEqual(testResources({ pv: { value: 10, max: 10 } }), {
    pd: 0,
    impeto: 0,
    analise: 0,
    fearDie: 0,
  });
  assert.deepEqual(testResources(undefined), { pd: 0, impeto: 0, analise: 0, fearDie: 0 });
});

test('threatDamage desconta a RD antes do PV e nunca deixa o dano negativo', () => {
  assert.deepEqual(threatDamage({ current: 40, amount: 14, rd: 10 }), {
    before: 40,
    after: 36,
    amount: 4,
    rawAmount: 14,
    reduced: 10,
    defeated: false,
    newlyDefeated: false,
  });
  const absorvido = threatDamage({ current: 40, amount: 6, rd: 10 });
  assert.equal(absorvido.amount, 0);
  assert.equal(absorvido.reduced, 6);
  assert.equal(absorvido.after, 40);
});

test('threatDamage sem RD tira o dano inteiro e marca a derrota a 0 PV', () => {
  const golpe = threatDamage({ current: 5, amount: 9 });
  assert.equal(golpe.after, 0);
  assert.equal(golpe.defeated, true);
  assert.equal(golpe.newlyDefeated, true);
  const deNovo = threatDamage({ current: 0, amount: 3 });
  assert.equal(deNovo.defeated, true);
  assert.equal(deNovo.newlyDefeated, false);
});

test('threatDamage recusa números inválidos e trata RD ausente ou negativa como 0', () => {
  assert.throws(() => threatDamage({ current: 5, amount: -1 }), RangeError);
  assert.throws(() => threatDamage({ current: 5, amount: 1.5 }), RangeError);
  assert.throws(() => threatDamage({ current: -2, amount: 1 }), RangeError);
  assert.equal(threatDamage({ current: 10, amount: 4, rd: -3 }).amount, 4);
  assert.equal(threatDamage({ current: 10, amount: 4, rd: undefined }).amount, 4);
});

test('normalizeElements tira repetições, o principal dos secundários e valores estranhos', () => {
  assert.deepEqual(
    normalizeElements({ principal: 'morte', secundarios: ['medo', 'morte', 'medo', 'fogo'] }),
    { principal: 'morte', secundarios: ['medo'] },
  );
  assert.deepEqual(normalizeElements({ principal: 'fogo', secundarios: ['sangue'] }), {
    principal: '',
    secundarios: ['sangue'],
  });
  assert.deepEqual(normalizeElements(), { principal: '', secundarios: [] });
  // Os secundários ficam na ordem da lista de elementos, não na ordem em que foram marcados
  assert.deepEqual(normalizeElements({ secundarios: ['medo', 'sangue'] }).secundarios, [
    'sangue',
    'medo',
  ]);
});

test('setPrimaryElement tira o novo principal da lista de secundários', () => {
  const antes = { principal: 'morte', secundarios: ['medo', 'sangue'] };
  assert.deepEqual(setPrimaryElement(antes, 'medo'), {
    principal: 'medo',
    secundarios: ['sangue'],
  });
  assert.deepEqual(setPrimaryElement(antes, ''), {
    principal: '',
    secundarios: ['sangue', 'medo'],
  });
  assert.deepEqual(antes, { principal: 'morte', secundarios: ['medo', 'sangue'] });
});

test('toggleSecondaryElement liga e desliga, sem aceitar o principal nem valores estranhos', () => {
  const base = { principal: 'energia', secundarios: [] };
  const um = toggleSecondaryElement(base, 'conhecimento');
  assert.deepEqual(um.secundarios, ['conhecimento']);
  assert.deepEqual(toggleSecondaryElement(um, 'conhecimento').secundarios, []);
  assert.deepEqual(toggleSecondaryElement(base, 'energia').secundarios, []);
  assert.deepEqual(toggleSecondaryElement(base, 'fogo').secundarios, []);
});

test('buildElementRows mostra os cinco elementos com o principal e os secundários marcados', () => {
  const rows = buildElementRows({ principal: 'sangue', secundarios: ['medo'] }, (k) => `[${k}]`);
  assert.deepEqual(
    rows.map((r) => r.key),
    ['morte', 'sangue', 'energia', 'conhecimento', 'medo'],
  );
  assert.deepEqual(rows[1], {
    key: 'sangue',
    label: '[sangue]',
    principal: true,
    secundario: false,
  });
  assert.equal(rows[4].secundario, true);
  assert.equal(rows.filter((r) => r.principal).length, 1);
});

test('perícias próprias da criatura usam o grupo `pericia`, com limite de 10', () => {
  assert.deepEqual(parseExtraKey('pericia:p1'), { group: 'pericia', id: 'p1' });
  let lista = [];
  for (let i = 0; i < MAX_THREAT_SKILLS; i += 1) {
    lista = addExtra(lista, { id: `p${i}`, nome: `Perícia ${i}` }, MAX_THREAT_SKILLS);
  }
  assert.equal(canAddExtra(lista, MAX_THREAT_SKILLS), false);
  assert.throws(() => addExtra(lista, { id: 'x' }, MAX_THREAT_SKILLS), RangeError);
  const system = { periciasExtras: lista };
  assert.equal(findExtra(system, 'pericia:p3').extra.nome, 'Perícia 3');
  assert.equal(findExtra(system, 'aptidao:p3'), null);
});

test('perícia própria usa Mente por padrão e aceita outro atributo escolhido', () => {
  const system = { periciasExtras: [{ id: 'p1', nome: 'Rastejar', dado: 8, atributo: '' }] };
  assert.equal(resolveSkillAttribute(system, 'pericia:p1'), 'mente');
  system.periciasExtras[0].atributo = 'fisico';
  assert.equal(resolveSkillAttribute(system, 'pericia:p1'), 'fisico');
});
