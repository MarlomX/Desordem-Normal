import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attackPasses,
  resolveDefense,
  resolveMelee,
  resolveSimple,
  rollRanking,
} from '../scripts/rolls/opposed-rules.js';

/** Resultado com os dados informados (total = soma, sem pavor). */
const r = (values, crit = null) => ({
  total: values.reduce((sum, v) => sum + v, 0),
  dice: values.map((value) => ({ value })),
  highRoll: Math.max(...values),
  criticalSuccess: crit === 'success',
  criticalFailure: crit === 'failure',
});

test('attackPasses: DT 7, com sucesso crítico passando e falha crítica nunca', () => {
  assert.equal(attackPasses(r([3, 4])), true);
  assert.equal(attackPasses(r([2, 4])), false);
  assert.equal(attackPasses({ total: 3, criticalSuccess: true, criticalFailure: false }), true);
  assert.equal(attackPasses({ total: 9, criticalSuccess: false, criticalFailure: true }), false);
});

test('rollRanking ordena os dados do maior para o menor (até 3)', () => {
  assert.deepEqual(rollRanking(r([2, 6, 4, 1])), [6, 4, 2]);
  assert.deepEqual(rollRanking({ highRoll: 5 }), [5]);
});

test('simples: total maior vence; total igual decide a RA; RA igual é empate', () => {
  assert.equal(resolveSimple(r([5, 4]), r([3, 3])).winner, 'a');
  assert.deepEqual(resolveSimple(r([2, 6]), r([4, 4])), {
    winner: 'a',
    margin: 0,
    decidedBy: 'ra',
  });
  assert.equal(resolveSimple(r([4, 4]), r([2, 6])).winner, 'b');
  // RA igual (6), mesmo com a segunda rolagem diferente: empate (repetem)
  assert.equal(resolveSimple(r([6, 1, 1]), r([6, 2])).winner, 'empate');
  // O crítico continua decidindo antes do total
  assert.equal(resolveSimple(r([6, 6], 'success'), r([10, 4])).winner, 'a');
});

test('corpo a corpo: o maior acerta, o empate acerta os dois, e todos precisam de 7', () => {
  assert.deepEqual(resolveMelee(r([5, 4]), r([3, 3])).hits, { a: true, b: false });
  assert.deepEqual(resolveMelee(r([3, 3]), r([5, 4])).hits, { a: false, b: true });
  assert.deepEqual(resolveMelee(r([4, 4]), r([2, 6])).hits, { a: true, b: true });
  // Vence com 6: não atinge a DT básica, os dois erram
  assert.deepEqual(resolveMelee(r([3, 3]), r([2, 2])).hits, { a: false, b: false });
  // Empate abaixo de 7: os dois erram
  assert.deepEqual(resolveMelee(r([3, 2]), r([4, 1])).hits, { a: false, b: false });
  // Sucesso crítico baixo vence um total maior e acerta
  const crit = { total: 6, dice: [{ value: 6 }], criticalSuccess: true, criticalFailure: false };
  assert.deepEqual(resolveMelee(crit, r([5, 5])).hits, { a: true, b: false });
});

test('defesa: o ataque precisa vencer e atingir 7; vencer abaixo de 7 também erra', () => {
  const ganha = resolveDefense(r([5, 4]), r([3, 3, 1]), 'a');
  assert.equal(ganha.winner, 'a');
  assert.deepEqual(ganha.hits, { a: true, b: false });
  const fraco = resolveDefense(r([3, 3]), r([2, 2]), 'b');
  assert.equal(fraco.winner, 'b');
  assert.deepEqual(fraco.hits, { a: false, b: false });
  const defende = resolveDefense(r([3, 4]), r([5, 4]), 'a');
  assert.equal(defende.winner, 'b');
  assert.deepEqual(defende.hits, { a: false, b: false });
});

test('defesa empatada: RA, depois a segunda maior rolagem, depois a defesa vence', () => {
  // Total 8 × 8: RA 6 contra 5 — o ataque vence pela RA
  const ra = resolveDefense(r([6, 2]), r([5, 3]), 'a');
  assert.equal(ra.winner, 'a');
  assert.equal(ra.decidedBy, 'ra');
  assert.equal(ra.hits.a, true);
  // Total 9 × 9, RA 5 × 5: segunda rolagem 3 contra 4 — a defesa (lado A) vence
  const segunda = resolveDefense(r([5, 3, 1]), r([5, 4]), 'b');
  assert.equal(segunda.winner, 'a');
  assert.equal(segunda.decidedBy, 'segunda');
  assert.deepEqual(segunda.hits, { a: false, b: false });
  // Tudo igual: a defesa vence
  const total = resolveDefense(r([4, 4]), r([4, 4]), 'a');
  assert.equal(total.winner, 'b');
  assert.equal(total.decidedBy, 'defesa');
  assert.equal(total.hits.a, false);
});
