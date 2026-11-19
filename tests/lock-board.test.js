import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_BOARD_ROWS,
  addAttemptRow,
  addManualRow,
  boardView,
  clearBoard,
  normalizeBoard,
  removeBoardRow,
  setBoardValue,
  toggleBoardMark,
} from '../scripts/rolls/lock-board.js';
import { normalizeLock, resetLock, updateLockField } from '../scripts/rolls/lock.js';

const lockOf = (lados = [8, 8, 4, 12]) => normalizeLock({ dados: lados.length, lados });

test('tentativa enviada entra no quadro com os números travados', () => {
  let lock = addAttemptRow(lockOf(), 't1', [3, 5, 3, 2]);
  assert.deepEqual(lock.quadro[0].valores, [3, 5, 3, 2]);
  assert.equal(lock.quadro[0].origem, 'tentativa');
  assert.equal(setBoardValue(lock, 't1', 0, '4'), null);
  // Marcas valem nas tentativas
  lock = toggleBoardMark(lock, 't1', 0, 'baixo');
  assert.equal(lock.quadro[0].marcas[0].baixo, true);
  lock = toggleBoardMark(lock, 't1', 0, 'baixo');
  assert.equal(lock.quadro[0].marcas[0].baixo, false);
});

test('linha de teoria: números editáveis dentro do dado de cada posição', () => {
  let lock = addManualRow(lockOf(), 'm1');
  assert.deepEqual(lock.quadro[0].valores, [null, null, null, null]);
  lock = setBoardValue(lock, 'm1', 2, '4');
  assert.equal(lock.quadro[0].valores[2], 4);
  // d4 não aceita 5; texto inválido não muda; vazio apaga
  assert.equal(setBoardValue(lock, 'm1', 2, '5'), null);
  assert.equal(setBoardValue(lock, 'm1', 2, 'x'), null);
  assert.equal(setBoardValue(lock, 'm1', 2, '4'), null);
  assert.equal(setBoardValue(lock, 'm1', 2, ' ').quadro[0].valores[2], null);
  assert.equal(setBoardValue(lock, 'm1', 9, '1'), null);
  assert.equal(setBoardValue(lock, 'nada', 0, '1'), null);
});

test('marcas ▲ ▼ = independentes; marca desconhecida não vale', () => {
  let lock = addManualRow(lockOf(), 'm1');
  lock = toggleBoardMark(toggleBoardMark(lock, 'm1', 1, 'cima'), 'm1', 1, 'igual');
  assert.deepEqual(lock.quadro[0].marcas[1], { cima: true, baixo: false, igual: true });
  assert.equal(toggleBoardMark(lock, 'm1', 1, 'lado'), null);
  assert.equal(toggleBoardMark(lock, 'm1', 7, 'cima'), null);
});

test('apagar linha, limpar e limite de linhas', () => {
  let lock = addManualRow(addAttemptRow(lockOf(), 't1', [1, 1, 1, 1]), 'm1');
  assert.deepEqual(
    removeBoardRow(lock, 't1').quadro.map((row) => row.id),
    ['m1'],
  );
  assert.equal(removeBoardRow(lock, 'nada'), null);
  assert.deepEqual(clearBoard(lock).quadro, []);
  for (let i = 0; i < MAX_BOARD_ROWS + 3; i += 1) lock = addManualRow(lock, `x${i}`);
  assert.equal(lock.quadro.length, MAX_BOARD_ROWS);
  assert.equal(lock.quadro[0].id, 'x3');
});

test('mudar a fechadura ajusta as linhas; nova fechadura limpa o quadro', () => {
  let lock = addAttemptRow(lockOf([6, 6, 6]), 't1', [6, 2, 3]);
  // Mais dados: posições novas vazias. Dado menor: o valor que não cabe fica vazio
  lock = normalizeLock(updateLockField(lock, 'dados', '4'));
  assert.deepEqual(lock.quadro[0].valores, [6, 2, 3, null]);
  lock = normalizeLock(updateLockField(lock, 'lado.0', '4'));
  assert.deepEqual(lock.quadro[0].valores, [null, 2, 3, null]);
  assert.equal(lock.quadro[0].marcas.length, 4);
  assert.deepEqual(resetLock(lock).quadro, []);
  // Quadro estragado vira vazio, sem ids repetidos
  assert.deepEqual(normalizeBoard('x', [6]), []);
  assert.equal(normalizeBoard([{ id: 'a' }, { id: 'a' }, { valores: [] }], [6]).length, 1);
});

test('vista do quadro: numeração separada de tentativas e teorias', () => {
  let lock = addAttemptRow(lockOf([6, 4]), 't1', [3, 2]);
  lock = addManualRow(lock, 'm1');
  lock = addAttemptRow(lock, 't2', [5, 1]);
  const view = boardView(lock);
  assert.deepEqual(
    view.map((row) => [row.tentativa, row.numero]),
    [
      [true, 1],
      [false, 1],
      [true, 2],
    ],
  );
  assert.deepEqual(view[0].dados[1], {
    index: 1,
    valor: 2,
    lados: 4,
    editavel: false,
    cima: false,
    baixo: false,
    igual: false,
  });
  assert.equal(view[1].dados[0].editavel, true);
});
