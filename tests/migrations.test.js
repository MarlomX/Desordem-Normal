// Migrações dos dados antigos: Ofício, recursos das habilidades e notas da criatura.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  migrateCraftSkill,
  migrateAbilityResources,
  migrateThreatNotes,
} from '../scripts/data/migrations.js';
import { PERICIAS, OFICIOS, APTIDOES } from '../scripts/config.js';

test('migrateCraftSkill leva pericias.metalurgia para oficios.metalurgia sem perder o dado', () => {
  const source = { pericias: { luta: 6, metalurgia: 8 } };
  migrateCraftSkill(source);
  assert.equal(source.oficios.metalurgia, 8);
  assert.equal('metalurgia' in source.pericias, false);
  assert.equal(source.pericias.luta, 6);
});

test('migrateCraftSkill preserva as outras áreas de Ofício já existentes', () => {
  const source = { pericias: { metalurgia: 10 }, oficios: { alquimia: 6 } };
  migrateCraftSkill(source);
  assert.deepEqual(source.oficios, { alquimia: 6, metalurgia: 10 });
});

test('migrateCraftSkill mantém o valor novo se oficios.metalurgia já existir', () => {
  const source = { pericias: { metalurgia: 4 }, oficios: { metalurgia: 8 } };
  migrateCraftSkill(source);
  assert.equal(source.oficios.metalurgia, 8);
  assert.equal('metalurgia' in source.pericias, false);
});

test('migrateCraftSkill é idempotente e ignora dados sem a chave antiga', () => {
  const source = { pericias: { metalurgia: 8 } };
  migrateCraftSkill(source);
  const depois = structuredClone(source);
  migrateCraftSkill(source);
  assert.deepEqual(source, depois);

  const novo = { pericias: { luta: 6 }, oficios: { alquimia: 4 } };
  migrateCraftSkill(novo);
  assert.deepEqual(novo, { pericias: { luta: 6 }, oficios: { alquimia: 4 } });
  assert.deepEqual(migrateCraftSkill({}), {});
});

test('config: Ofício tem as áreas do livro e metalurgia deixou de ser perícia comum', () => {
  assert.deepEqual(OFICIOS, ['alquimia', 'carpintaria', 'metalurgia']);
  assert.equal('metalurgia' in PERICIAS, false);
  for (const key of OFICIOS) assert.equal(APTIDOES.includes(key), false);
});

test('migrateAbilityResources copia ímpeto e análise para recursosHab', () => {
  const source = { recursos: { impeto: 3, analise: 2 } };
  migrateAbilityResources(source);
  assert.deepEqual(source.recursosHab, { impeto: 3, analise: 2 });
  // O campo antigo fica onde está (sem uso)
  assert.deepEqual(source.recursos, { impeto: 3, analise: 2 });
});

test('migrateAbilityResources não mexe num ator já migrado nem em quem não tem recursos', () => {
  const migrated = { recursos: { impeto: 3 }, recursosHab: { impeto: 1 } };
  migrateAbilityResources(migrated);
  assert.deepEqual(migrated.recursosHab, { impeto: 1 });
  const creature = { pv: { value: 10 } };
  migrateAbilityResources(creature);
  assert.equal('recursosHab' in creature, false);
  assert.equal(migrateAbilityResources(undefined), undefined);
});

test('migrateAbilityResources troca valores estranhos por 0 e pode rodar de novo', () => {
  const source = { recursos: { impeto: -1, analise: 'x' } };
  migrateAbilityResources(source);
  migrateAbilityResources(source);
  assert.deepEqual(source.recursosHab, { impeto: 0, analise: 0 });
});

test('migrateThreatNotes: texto simples da criatura vira HTML (v0.23.2)', () => {
  const source = { estrategia: 'Ataca o mais fraco.\nFoge com PV < 3.', descricao: '' };
  migrateThreatNotes(source);
  assert.equal(source.estrategia, '<p>Ataca o mais fraco.<br>Foge com PV &lt; 3.</p>');
  assert.equal(source.descricao, '');
});

test('migrateThreatNotes não converte duas vezes nem mexe no que já é HTML', () => {
  const source = { estrategia: '<p>Já é HTML</p>', descricao: 'Grande' };
  migrateThreatNotes(source);
  migrateThreatNotes(source);
  assert.equal(source.estrategia, '<p>Já é HTML</p>');
  assert.equal(source.descricao, '<p>Grande</p>');
  assert.equal(migrateThreatNotes(undefined), undefined);
  assert.deepEqual(migrateThreatNotes({}), {});
});
