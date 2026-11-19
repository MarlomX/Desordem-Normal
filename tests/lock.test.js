import test from 'node:test';
import assert from 'node:assert/strict';
import {
  lockComposition,
  lockRollFormula,
  maximumVisible,
  unlimitedAttempts,
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
    lados: [6, 6, 6],
    maximo: 10,
    mostrarMaximo: true,
    usadas: 0,
    auto: false,
    senhaMsg: '',
    destrancou: false,
  });
  const odd = normalizeLock({ dados: 99, faces: 7, maximo: -1, usadas: -2, auto: 'sim' });
  assert.deepEqual(
    [odd.dados, odd.lados.length, odd.lados[0], odd.maximo, odd.usadas, odd.auto],
    [10, 10, 6, 0, 0, false],
  );
  // Fechaduras da 0.18.6 (só `faces`) viram a lista de dados
  assert.deepEqual(normalizeLock({ dados: 2, faces: 20 }).lados, [20, 20]);
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
  assert.deepEqual(updateLockField(withSecret, 'faces', '20').lados, [20, 20, 20]);
  assert.equal(updateLockField(withSecret, 'faces', '7'), withSecret);
  assert.equal(updateLockField(withSecret, 'faces', ''), withSecret);
  assert.equal(updateLockField(withSecret, 'faces', '6'), withSecret);
  assert.equal(updateLockField(withSecret, 'maximo', '15').senhaMsg, 'm1');
  assert.equal(updateLockField(withSecret, 'usadas', '200').usadas, 99);
  assert.equal(updateLockField(withSecret, 'auto', true).auto, true);
  assert.equal(updateLockField(withSecret, 'auto', 'true'), withSecret);
});

test('sequências: N números de 1 até as faces', () => {
  const l = lock({ dados: 3, lados: [6, 6, 6] });
  assert.equal(validSequence([1, 6, 3], l), true);
  assert.equal(validSequence([1, 6, 3, 2], l), false);
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

test('um dado por posição: d8 d8 d4 d12', () => {
  let l = normalizeLock({ dados: 4 });
  l = updateLockField(l, 'faces', '8');
  l = updateLockField(l, 'lado.2', '4');
  l = updateLockField(l, 'lado.3', '12');
  assert.deepEqual(l.lados, [8, 8, 4, 12]);
  assert.equal(lockComposition(l), '2d8 + d4 + d12');
  assert.equal(lockRollFormula(l), '1d8 + 1d8 + 1d4 + 1d12');
  // Cada posição tem o seu limite
  assert.equal(validSequence([8, 1, 4, 12], l), true);
  assert.equal(validSequence([8, 1, 5, 12], l), false);
  // Posição inválida ou faces inválidas não mudam nada
  assert.equal(updateLockField(l, 'lado.4', '6'), l);
  assert.equal(updateLockField(l, 'lado.0', '7'), l);
  assert.equal(updateLockField(l, 'lado.0', '8'), l);
  // Mudar um dado esquece a senha
  assert.equal(updateLockField({ ...l, senhaMsg: 'm' }, 'lado.0', '6').senhaMsg, '');
  // Aumentar a complexidade completa com o último; diminuir corta
  assert.deepEqual(updateLockField(l, 'dados', '6').lados, [8, 8, 4, 12, 12, 12]);
  assert.deepEqual(updateLockField(l, 'dados', '2').lados, [8, 8]);
  assert.equal(lockComposition(normalizeLock({})), '3d6');
});

test('máximo 0 = tentativas infinitas; máximo escondido dos jogadores', () => {
  let l = normalizeLock({ maximo: 0 });
  assert.equal(unlimitedAttempts(l), true);
  for (let i = 0; i < 50; i += 1) l = registerAttempt(l);
  assert.deepEqual([l.usadas, lockStatus(l), attemptsLeft(l)], [50, 'aberta', null]);
  assert.equal(maximumVisible(l, { isGM: true }), false);
  const hidden = normalizeLock({ maximo: 5, mostrarMaximo: false });
  assert.equal(maximumVisible(hidden, { isGM: true }), true);
  assert.equal(maximumVisible(hidden, { isGM: false }), false);
  assert.equal(maximumVisible(normalizeLock({ maximo: 5 }), { isGM: false }), true);
  assert.equal(updateLockField(hidden, 'mostrarMaximo', true).mostrarMaximo, true);
  assert.equal(updateLockField(hidden, 'maximo', '0').maximo, 0);
  // O jogador não vê o máximo escondido na ficha
  const door = addParticipants({ ...newChallenge('t', 'Baú', 'destrancar'), fechadura: hidden }, [
    'a',
  ]);
  assert.equal(sheetChallenges({ desafios: [door] }, 'a', { isGM: false })[0].pa, null);
  assert.equal(sheetChallenges({ desafios: [door] }, 'a', { isGM: true })[0].pa, 5);
  const view = challengeView(door, { isGM: false, actorInfo: () => null });
  assert.deepEqual([view.fechadura.maximoVisivel, view.fechadura.composicao], [false, '3d6']);
});
