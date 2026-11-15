import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTest } from '../scripts/rolls/test.js';
import { fixedRng } from './helpers.js';

/** Teste com 4 dados (atributo, perícia e dois extras), na ordem dos valores dados. */
const four = (values, extra = {}) =>
  resolveTest({ attrDie: 12, skillDie: 12, extraDice: [12, 12], rng: fixedRng(values), ...extra });

test('com 4 dados, o menor é descartado antes de checar o crítico: par no menor dado não vale', () => {
  const r = four([6, 6, 8, 9]);
  assert.equal(r.criticalSuccess, false);
  assert.equal(r.total, 23); // 9 + 8 + 6 (o outro 6 é o dado descartado)
  assert.equal(
    r.dice.some((d) => d.critical),
    false,
  );
});

test('com 4 dados, um par acima do menor continua sendo crítico (e só o par é destacado)', () => {
  const r = four([8, 8, 6, 6]);
  assert.equal(r.criticalSuccess, true);
  assert.equal(r.success, true);
  assert.deepEqual(
    r.dice.map((d) => d.critical),
    [true, true, false, false],
  );
  assert.equal(r.highSum, 16); // o crítico soma as duas maiores rolagens
});

test('com 4 dados, o dado descartado não é o do par quando há outro menor', () => {
  for (const values of [
    [6, 6, 2, 3],
    [6, 6, 6, 2],
    [2, 7, 7, 3],
    [9, 4, 9, 6],
  ]) {
    assert.equal(four(values).criticalSuccess, true, values.join(','));
  }
  assert.equal(four([6, 5, 2, 6]).criticalSuccess, true);
});

test('três dados que são todos iguais ou formam par seguem como antes', () => {
  const tres = (values) =>
    resolveTest({ attrDie: 12, skillDie: 12, extraDice: [12], rng: fixedRng(values) });
  assert.equal(tres([6, 6, 1]).criticalSuccess, true);
  assert.equal(tres([6, 1, 6]).criticalSuccess, true);
  assert.equal(tres([5, 5, 1]).criticalSuccess, false);
  assert.equal(
    resolveTest({ attrDie: 8, skillDie: 8, rng: fixedRng([6, 6]) }).criticalSuccess,
    true,
  );
});

test('os quatro valores iguais a 6 ou mais continuam crítico', () => {
  const r = four([7, 7, 7, 7]);
  assert.equal(r.criticalSuccess, true);
  assert.equal(r.dice.filter((d) => d.critical).length, 3); // só os três somados
});

test('falha crítica com 4 dados: só quando os dados somados são todos 1', () => {
  assert.equal(four([1, 1, 1, 1]).criticalFailure, true);
  assert.equal(four([1, 1, 1, 2]).criticalFailure, false);
  assert.equal(four([2, 1, 1, 1]).criticalFailure, false);
  const r = four([1, 1, 1, 1]);
  assert.equal(
    r.dice.every((d) => d.fumble),
    true,
  ); // os quatro ficam em destaque
});

/** Teste com 4 dados e um dado de pavor d12; o último valor é o do dado de pavor. */
const fear = (values) =>
  resolveTest({
    attrDie: 12,
    skillDie: 12,
    extraDice: [12, 12],
    fearDie: 12,
    rng: fixedRng(values),
  });

test('o pavor tira os dados anulados antes: o crítico vale para os que restam', () => {
  // pavor 7 devora os dois 6; sobram 8 e 9, que não são par
  const a = fear([6, 6, 8, 9, 7]);
  assert.equal(a.dice.filter((d) => d.annulled).length, 2);
  assert.equal(a.criticalSuccess, false);
  // pavor 6 não devora nada (só devora o que for menor): o menor ainda é descartado
  const b = fear([6, 6, 8, 9, 6]);
  assert.equal(
    b.dice.some((d) => d.annulled),
    false,
  );
  assert.equal(b.criticalSuccess, false);
  // pavor 8: o par de 9 sobrevive e o menor (8) é descartado
  const c = fear([8, 9, 9, 8, 8]);
  assert.equal(c.criticalSuccess, true);
  assert.deepEqual(
    c.dice.map((d) => d.critical),
    [false, true, true, false],
  );
});

test('devorado pelo pavor continua sendo falha crítica, sem destacar os dados', () => {
  const r = resolveTest({
    attrDie: 6,
    skillDie: 6,
    fearDie: 6,
    rng: fixedRng([2, 3, 6]),
  });
  assert.equal(r.criticalFailure, true);
  assert.equal(r.devouredAll, true);
  assert.equal(
    r.dice.some((d) => d.fumble || d.critical),
    false,
  );
});
