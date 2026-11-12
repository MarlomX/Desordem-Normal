import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateCraftSkill } from '../scripts/data/migrations.js';
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
