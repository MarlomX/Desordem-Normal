import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRecovery } from '../scripts/rolls/recovery.js';

test('applyRecovery soma a recuperação ao valor atual', () => {
  assert.deepEqual(applyRecovery({ current: 5, max: 12, amount: 4 }), {
    before: 5,
    after: 9,
    recovered: 4,
  });
});

test('applyRecovery não passa do máximo e informa o ganho real', () => {
  assert.deepEqual(applyRecovery({ current: 10, max: 12, amount: 5 }), {
    before: 10,
    after: 12,
    recovered: 2,
  });
});

test('applyRecovery ignora quantidades negativas, frações e inválidas', () => {
  assert.equal(applyRecovery({ current: 5, max: 12, amount: -3 }).after, 5);
  assert.equal(applyRecovery({ current: 5, max: 12, amount: 2.9 }).after, 7);
  assert.equal(applyRecovery({ current: 5, max: 12, amount: NaN }).after, 5);
});

test('applyRecovery não reduz um valor atual acima do máximo', () => {
  assert.deepEqual(applyRecovery({ current: 14, max: 12, amount: 3 }), {
    before: 14,
    after: 14,
    recovered: 0,
  });
});
