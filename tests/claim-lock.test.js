/**
 * Reserva de botão de uso único (`rolls/claim.js`) e trava local contra pedidos repetidos
 * (`shared/lock.js`), da v0.28.4.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { CLAIM_TIMEOUT_MS, claimRules } from '../scripts/rolls/claim.js';
import { createLock } from '../scripts/shared/lock.js';
import { ADVANCE_CLAIM_TIMEOUT_MS } from '../scripts/rolls/chase.js';
import { HIDE_CLAIM_TIMEOUT_MS } from '../scripts/rolls/stealth.js';
import { BALANCE_CLAIM_MS } from '../scripts/rolls/balance.js';
import { CLAIM_TIMEOUT_MS as TABLE_TIMEOUT } from '../scripts/rolls/pending-table.js';

test('os prazos antigos continuam exportados e valem 30 s', () => {
  for (const value of [
    ADVANCE_CLAIM_TIMEOUT_MS,
    HIDE_CLAIM_TIMEOUT_MS,
    BALANCE_CLAIM_MS,
    TABLE_TIMEOUT,
  ]) {
    assert.equal(value, CLAIM_TIMEOUT_MS);
  }
  assert.equal(CLAIM_TIMEOUT_MS, 30_000);
});

test('claimRules: livre reserva; reservado bloqueia até vencer o prazo; liberar volta ao livre', () => {
  const rules = claimRules({ free: 'aberto' });
  const flag = { estado: 'aberto', outro: 1 };
  const reserved = rules.reserve(flag, 1000);
  assert.deepEqual(reserved, { estado: 'aplicando', outro: 1, reservadoEm: 1000 });
  assert.equal(rules.reserve(reserved, 1000 + CLAIM_TIMEOUT_MS), null);
  assert.equal(rules.claimable(reserved, 1001 + CLAIM_TIMEOUT_MS), true);
  assert.equal(rules.stale(reserved, 1001 + CLAIM_TIMEOUT_MS), true);
  assert.deepEqual(rules.release(reserved), { estado: 'aberto', outro: 1, reservadoEm: null });
  assert.equal(rules.claimable({ estado: 'aplicado' }, 1e12), false);
  assert.equal(rules.claimable(null, 0), false);
  assert.equal(rules.claimable(undefined, 0), false);
});

test('claimRules aceita outros nomes de campo (tabela pendente)', () => {
  const rules = claimRules({
    free: 'pending',
    busy: 'rolling',
    stateKey: 'status',
    timeKey: 'claimedAt',
  });
  assert.deepEqual(rules.reserve({ status: 'pending' }, 5), { status: 'rolling', claimedAt: 5 });
  assert.equal(rules.claimable({ status: 'rolling', claimedAt: 5 }, 6), false);
  assert.equal(rules.claimable({ status: 'rolling' }, CLAIM_TIMEOUT_MS + 1), true);
});

test('createLock: o segundo pedido com a mesma chave é ignorado enquanto o primeiro roda', async () => {
  const lock = createLock();
  let release;
  const calls = [];
  const first = lock.run('m1', () =>
    new Promise((resolve) => (release = resolve)).then(() => calls.push('1') && 'ok'),
  );
  assert.equal(lock.busy('m1'), true);
  assert.equal(await lock.run('m1', () => calls.push('2')), undefined);
  // Outra chave roda normalmente
  await lock.run('m2', () => calls.push('outra'));
  release();
  assert.equal(await first, 'ok');
  assert.equal(lock.busy('m1'), false);
  await lock.run('m1', () => calls.push('3'));
  assert.deepEqual(calls, ['outra', '1', '3']);
});

test('createLock libera a chave mesmo quando a tarefa dá erro', async () => {
  const lock = createLock();
  await assert.rejects(
    lock.run('x', async () => {
      throw new Error('falhou');
    }),
  );
  assert.equal(lock.busy('x'), false);
});
