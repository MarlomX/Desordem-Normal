// Quadro de teoria: anotar o som (v0.27.3)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SOUND,
  addAttemptRow,
  addManualRow,
  boardView,
  fillAttemptSounds,
  normalizeBoard,
  setBoardSound,
} from '../scripts/rolls/lock-board.js';
import { cleanSound as lockCleanSound, normalizeLock } from '../scripts/rolls/lock.js';

const lockOf = (lados) => normalizeLock({ dados: lados.length, lados });

test('quadros antigos (sem sons) abrem com os campos vazios', () => {
  const rows = normalizeBoard([{ id: 'r1', origem: 'tentativa', valores: [3, 2] }], [6, 4]);
  assert.deepEqual(rows[0].sons, ['', '']);
  // Sons a mais saem; texto sujo é limpo
  const extra = normalizeBoard([{ id: 'r2', sons: ['  tic  ', 'x'.repeat(30), 'sobra'] }], [6, 4]);
  assert.deepEqual(extra[0].sons, ['tic', 'x'.repeat(MAX_SOUND)]);
  // lock.js reexporta o mesmo limpador
  assert.equal(lockCleanSound(' a  b '), 'a b');
});

test('linha nova: de teoria vazia; de tentativa com os sons da resposta', () => {
  let lock = addManualRow(lockOf([6, 4]), 'm1');
  assert.deepEqual(lock.quadro[0].sons, ['', '']);
  lock = addAttemptRow(lock, 't1', [3, 2], ['tic', 'clack']);
  assert.deepEqual(lock.quadro[1].sons, ['tic', 'clack']);
  lock = addAttemptRow(lock, 't2', [1, 1]);
  assert.deepEqual(lock.quadro[2].sons, ['', '']);
});

test('anotar o som vale em todas as linhas (também nas de tentativa)', () => {
  let lock = addAttemptRow(lockOf([6, 4]), 't1', [3, 2]);
  lock = addManualRow(lock, 'm1');
  lock = setBoardSound(lock, 't1', 0, ' treck ');
  assert.deepEqual(lock.quadro[0].sons, ['treck', '']);
  lock = setBoardSound(lock, 'm1', 1, 'toc');
  assert.deepEqual(lock.quadro[1].sons, ['', 'toc']);
  // Texto vazio apaga; o mesmo texto, posição inválida ou linha que não existe não mudam nada
  assert.deepEqual(setBoardSound(lock, 't1', 0, '').quadro[0].sons, ['', '']);
  assert.equal(setBoardSound(lock, 't1', 0, 'treck'), null);
  assert.equal(setBoardSound(lock, 't1', 5, 'x'), null);
  assert.equal(setBoardSound(lock, 'nada', 0, 'x'), null);
  // A vista mostra o som em cada dado
  assert.equal(boardView(lock)[0].dados[0].som, 'treck');
});

test('resposta dada depois: preenche só os sons vazios da linha da tentativa', () => {
  let lock = addAttemptRow(lockOf([6, 6, 6]), 't1', [1, 2, 3]);
  lock = setBoardSound(lock, 't1', 1, 'meu');
  const filled = fillAttemptSounds(lock, 't1', ['tic', 'toc', 'clack']);
  assert.deepEqual(filled.quadro[0].sons, ['tic', 'meu', 'clack']);
  // Nada a mudar, linha de teoria ou sem sons: `null`
  assert.equal(fillAttemptSounds(filled, 't1', ['tic', 'toc', 'clack']), null);
  const manual = addManualRow(lock, 'm1');
  assert.equal(fillAttemptSounds(manual, 'm1', ['a', 'b', 'c']), null);
  assert.equal(fillAttemptSounds(lock, 't1', null), null);
});
