import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newRelation,
  degreeKey,
  relationBenefits,
  invokeCheck,
  addRelation,
  removeRelation,
  updateRelation,
  setRelationDegree,
  buildInvocationContext,
} from '../scripts/rolls/relation.js';

const base = (extra = {}) => ({ ...newRelation(), ...extra });

test('degreeKey devolve o nome do grau e rejeita graus inválidos', () => {
  assert.deepEqual([0, 1, 2, 3].map(degreeKey), ['neutro', 'afinidade', 'vinculo', 'devocao']);
  assert.throws(() => degreeKey(4), RangeError);
  assert.throws(() => degreeKey(1.5), RangeError);
});

test('relationBenefits: cada grau tem a sua lista', () => {
  assert.equal(relationBenefits(0), null);
  assert.deepEqual(relationBenefits(1), {
    testDie: 6,
    helpDie: 6,
    motivate: null,
    extraAction: false,
  });
  assert.deepEqual(relationBenefits(2).motivate, { count: 2, sides: 4 });
  assert.equal(relationBenefits(2).testDie, 8);
  assert.deepEqual(relationBenefits(3).motivate, { count: 2, sides: 6 });
  assert.equal(relationBenefits(3).testDie, 12);
  assert.equal(relationBenefits(3).extraAction, true);
});

test('invokeCheck: precisa de grau e de a relação não ter sido usada', () => {
  assert.deepEqual(invokeCheck(base({ grau: 0 })), { ok: false, reason: 'semGrau' });
  assert.deepEqual(invokeCheck(base({ grau: 2, usada: true })), { ok: false, reason: 'jaUsada' });
  assert.deepEqual(invokeCheck(base({ grau: 1 })), { ok: true, reason: null });
});

test('addRelation e removeRelation devolvem listas novas', () => {
  const original = [base({ pessoa: 'A' })];
  const added = addRelation(original);
  assert.equal(added.length, 2);
  assert.equal(original.length, 1);
  assert.deepEqual(added[1], newRelation());
  const removed = removeRelation(added, 0);
  assert.equal(removed.length, 1);
  assert.deepEqual(removed[0], newRelation());
});

test('updateRelation altera só o índice pedido e limita o grau', () => {
  const list = [base({ pessoa: 'A' }), base({ pessoa: 'B' })];
  const next = updateRelation(list, 1, { pessoa: 'C', usada: true, grau: 9, outro: 'x' });
  assert.equal(next[0].pessoa, 'A');
  assert.equal(next[1].pessoa, 'C');
  assert.equal(next[1].usada, true);
  assert.equal(next[1].grau, 3);
  assert.equal('outro' in next[1], false);
  assert.equal(list[1].pessoa, 'B');
  assert.equal(updateRelation(list, 1, { grau: -4 })[1].grau, 0);
  assert.equal(updateRelation(list, 1, { grau: 'abc' })[1].grau, 1);
  assert.deepEqual(updateRelation(list, 5, { pessoa: 'Z' }), list);
});

test('setRelationDegree: clicar na bolinha define o grau; repetir diminui um', () => {
  const list = [base({ grau: 1 })];
  assert.equal(setRelationDegree(list, 0, 3)[0].grau, 3);
  assert.equal(setRelationDegree(list, 0, 2)[0].grau, 2);
  assert.equal(setRelationDegree(list, 0, 1)[0].grau, 0);
  const tres = [base({ grau: 3 })];
  assert.equal(setRelationDegree(tres, 0, 3)[0].grau, 2);
  assert.deepEqual(setRelationDegree(list, 4, 2), list);
});

test('buildInvocationContext usa um texto padrão para relação sem nome', () => {
  const ctx = buildInvocationContext(base({ grau: 2, pessoa: '  ', descricao: 'confio nela' }), {
    actorName: 'Ana',
    degreeLabel: 'Vínculo',
    noPerson: 'alguém',
  });
  assert.equal(ctx.pessoa, 'alguém');
  assert.equal(ctx.degree, 2);
  assert.equal(ctx.descricao, 'confio nela');
  assert.equal(ctx.benefits.testDie, 8);
});
