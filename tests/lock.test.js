import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allCorrect,
  attemptsLeft,
  crimeAttemptsPerRound,
  lockAnswers,
  lockStatus,
  markUnlocked,
  normalizeLock,
  parseSequence,
  registerAttempt,
  resetLock,
  secretFromFlag,
  setSecretMessage,
  updateLockField,
  validSequence,
} from '../scripts/rolls/lock.js';
import {
  addParticipants,
  challengeView,
  isCompleted,
  newChallenge,
  normalizeChallenge,
  sheetChallenges,
  updateChallengeField,
  withLock,
} from '../scripts/rolls/challenge.js';

const lock = (overrides = {}) => ({ ...normalizeLock({}), ...overrides });

test('exemplo da regra: senha 3-5-2, tentativa 4-5-1 → baixo, certo, alto', () => {
  assert.deepEqual(lockAnswers([3, 5, 2], [4, 5, 1]), ['baixo', 'certo', 'alto']);
  assert.equal(allCorrect(lockAnswers([3, 5, 2], [3, 5, 2])), true);
  assert.equal(allCorrect(['certo', 'alto']), false);
  assert.equal(allCorrect([]), false);
  assert.equal(lockAnswers([3, 5], [3]), null);
});

test('fechadura: padrões e limites (1 a 10 dados, d4 a d20)', () => {
  assert.deepEqual(normalizeLock(undefined), {
    dados: 3,
    faces: 6,
    maximo: 10,
    usadas: 0,
    auto: false,
    senhaMsg: '',
    destrancou: false,
  });
  const odd = normalizeLock({ dados: 99, faces: 7, maximo: 0, usadas: -2, auto: 'sim' });
  assert.deepEqual([odd.dados, odd.faces, odd.maximo, odd.usadas, odd.auto], [10, 6, 1, 0, false]);
  assert.equal(normalizeLock({ faces: 20 }).faces, 20);
});

test('edição: mudar dados ou faces esquece a senha', () => {
  const withSecret = lock({ senhaMsg: 'm1' });
  assert.deepEqual(
    [
      updateLockField(withSecret, 'dados', '4').dados,
      updateLockField(withSecret, 'dados', '4').senhaMsg,
    ],
    [4, ''],
  );
  assert.equal(updateLockField(withSecret, 'dados', '3'), withSecret);
  assert.equal(updateLockField(withSecret, 'dados', ''), withSecret);
  assert.equal(updateLockField(withSecret, 'faces', '20').senhaMsg, '');
  assert.equal(updateLockField(withSecret, 'faces', '7'), withSecret);
  assert.equal(updateLockField(withSecret, 'maximo', '15').senhaMsg, 'm1');
  assert.equal(updateLockField(withSecret, 'usadas', '200').usadas, 99);
  assert.equal(updateLockField(withSecret, 'auto', true).auto, true);
  assert.equal(updateLockField(withSecret, 'auto', 'true'), withSecret);
});

test('sequências: N números de 1 até as faces', () => {
  const l = lock({ dados: 3, faces: 6 });
  assert.equal(validSequence([1, 6, 3], l), true);
  assert.equal(validSequence([1, 7, 3], l), false);
  assert.equal(validSequence([1, 6], l), false);
  assert.deepEqual(parseSequence(['1', ' 6 ', '3'], l), [1, 6, 3]);
  // Campo vazio não vira 0
  assert.equal(parseSequence(['1', '', '3'], l), null);
});

test('tentativas compartilhadas: esgotar estraga a fechadura', () => {
  let l = lock({ maximo: 2 });
  assert.equal(lockStatus(l), 'aberta');
  l = registerAttempt(registerAttempt(l));
  assert.deepEqual([l.usadas, attemptsLeft(l), lockStatus(l)], [2, 0, 'estragada']);
  assert.equal(registerAttempt(l), null);
  assert.equal(lockStatus(markUnlocked(lock())), 'destrancada');
  assert.equal(registerAttempt(markUnlocked(lock())), null);
  // Acertar na última tentativa: destrancou vale mais que estragou
  assert.equal(lockStatus(markUnlocked(l)), 'destrancada');
  assert.deepEqual(resetLock(markUnlocked({ ...l, senhaMsg: 'x' })), lock({ maximo: 2 }));
});

test('senha do sussurro: só vale para o mesmo desafio e a mesma configuração', () => {
  const l = setSecretMessage(lock(), 'm1');
  assert.equal(l.senhaMsg, 'm1');
  assert.deepEqual(secretFromFlag({ desafioId: 'd', valores: [3, 5, 2] }, 'd', l), [3, 5, 2]);
  assert.equal(secretFromFlag({ desafioId: 'outro', valores: [3, 5, 2] }, 'd', l), null);
  assert.equal(secretFromFlag({ desafioId: 'd', valores: [3, 5] }, 'd', l), null);
  assert.equal(secretFromFlag(undefined, 'd', l), null);
});

test('tentativas por rodada pelo Crime (só informativo)', () => {
  assert.deepEqual(
    [4, 6, 8, 10, 12].map((die) => crimeAttemptsPerRound(die)),
    [1, 2, 3, 4, 5],
  );
  assert.equal(crimeAttemptsPerRound(7), null);
});

test('desafio de destrancar: fechadura no desafio, sem PA nem modo', () => {
  let door = addParticipants(newChallenge('t', 'Baú', 'destrancar'), ['a', 'b']);
  assert.deepEqual(door.fechadura, normalizeLock({}));
  assert.equal(updateChallengeField(door, 'modo', 'grupo').modo, 'individual');
  // Os outros tipos não ganham o campo
  assert.equal('fechadura' in newChallenge('x'), false);
  assert.equal(normalizeChallenge({ ...door, fechadura: { dados: 5 } }).fechadura.dados, 5);
  door = withLock(door, (l) => registerAttempt(l));
  assert.equal(door.fechadura.usadas, 1);
  assert.equal(withLock(newChallenge('x'), (l) => registerAttempt(l)).fechadura, undefined);
  assert.equal(isCompleted(door), false);
  const view = challengeView(door, { isGM: true, actorInfo: () => ({ name: 'Ana' }) });
  assert.deepEqual(
    [view.semPontos, view.temPa, view.livre, view.fechadura.status, view.fechadura.restantes],
    [true, false, false, 'aberta', 9],
  );
  door = withLock(door, (l) => markUnlocked(l));
  assert.equal(isCompleted(door), true);
  const [card] = sheetChallenges({ desafios: [door] }, 'a', { isGM: false });
  assert.deepEqual(
    [card.destrancar, card.pontos, card.pa, card.chegou, card.podeTentar],
    [true, 1, 10, true, false],
  );
});
