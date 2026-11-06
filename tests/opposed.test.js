import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveOpposed } from '../scripts/rolls/opposed.js';

const r = (total, crit = null) => ({
  total,
  criticalSuccess: crit === 'success',
  criticalFailure: crit === 'failure',
});

test('o maior total vence e a margem é a diferença', () => {
  assert.deepEqual(resolveOpposed(r(11), r(6)), { winner: 'a', margin: 5, decidedBy: 'total' });
  assert.deepEqual(resolveOpposed(r(6), r(11)), { winner: 'b', margin: 5, decidedBy: 'total' });
});

test('totais iguais dão empate com margem 0', () => {
  assert.deepEqual(resolveOpposed(r(8), r(8)), {
    winner: 'empate',
    margin: 0,
    decidedBy: 'empate',
  });
});

test('só um sucesso crítico vence, mesmo com total menor (margem 0)', () => {
  const res = resolveOpposed(r(12, 'success'), r(15));
  assert.equal(res.winner, 'a');
  assert.equal(res.margin, 0);
  assert.equal(res.decidedBy, 'critical');
});

test('sucesso crítico com total maior mantém a margem real', () => {
  assert.equal(resolveOpposed(r(6), r(14, 'success')).margin, 8);
});

test('só uma falha crítica perde, mesmo com total maior', () => {
  const res = resolveOpposed(r(2), r(1, 'failure'));
  assert.equal(res.winner, 'a');
  assert.equal(resolveOpposed(r(3, 'failure'), r(2)).winner, 'b');
});

test('sucesso crítico contra falha crítica: o sucesso vence', () => {
  assert.equal(resolveOpposed(r(1, 'failure'), r(12, 'success')).winner, 'b');
});

test('dois sucessos críticos comparam a soma', () => {
  const res = resolveOpposed(r(14, 'success'), r(12, 'success'));
  assert.deepEqual(res, { winner: 'a', margin: 2, decidedBy: 'total' });
});

test('duas falhas críticas comparam a soma, e empatam se iguais', () => {
  assert.equal(resolveOpposed(r(2, 'failure'), r(3, 'failure')).winner, 'b');
  assert.equal(resolveOpposed(r(2, 'failure'), r(2, 'failure')).winner, 'empate');
});

test('dois sucessos críticos com mesma soma empatam', () => {
  assert.equal(resolveOpposed(r(12, 'success'), r(12, 'success')).winner, 'empate');
});
