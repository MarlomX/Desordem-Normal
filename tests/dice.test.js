import test from 'node:test';
import assert from 'node:assert/strict';
import { stepUp, stepDown, stepShift, rollDie } from '../scripts/rolls/dice.js';

test('stepUp sobe um passo na escada', () => {
  assert.equal(stepUp(4), 6);
  assert.equal(stepUp(6), 8);
  assert.equal(stepUp(10), 12);
});

test('stepUp não passa de d12', () => {
  assert.equal(stepUp(12), 12);
  assert.equal(stepUp(10, 5), 12);
});

test('stepDown desce um passo e não passa de d4', () => {
  assert.equal(stepDown(12), 10);
  assert.equal(stepDown(6), 4);
  assert.equal(stepDown(4), 4);
  assert.equal(stepDown(8, 9), 4);
});

test('stepShift aceita vários passos', () => {
  assert.equal(stepShift(4, 2), 8);
  assert.equal(stepShift(12, -3), 6);
});

test('stepShift rejeita dado fora da escada', () => {
  assert.throws(() => stepShift(7, 1), RangeError);
});

test('rollDie valida o gerador', () => {
  assert.equal(rollDie(6, () => 4), 4);
  assert.throws(() => rollDie(6, () => 7), RangeError);
  assert.throws(() => rollDie(6, () => 0), RangeError);
  assert.throws(() => rollDie(1), RangeError);
});
