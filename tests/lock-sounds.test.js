// Destrancar: sons para o mestre (v0.27.2) e escalada que nunca passa da PA
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SOUND,
  answerSounds,
  attemptAnswered,
  cleanSound,
  lockAnswers,
  normalizeLock,
  normalizeSounds,
  publicAnswer,
  resetLock,
  setSound,
  soundsActive,
  soundsFromFlag,
} from '../scripts/rolls/lock.js';
import {
  addParticipants,
  adjustPoints,
  applyChallengeTest,
  newChallenge,
  normalizeChallenge,
  pointsCap,
  typePoints,
  updateChallengeField,
} from '../scripts/rolls/challenge.js';

const SOUNDS = { alto: 'tic', baixo: 'toc', certo: 'clack' };

// ---------- Sons ----------

test('som limpo: uma linha, sem espaços sobrando, até 20 caracteres', () => {
  assert.equal(cleanSound('  tic \n tac  '), 'tic tac');
  assert.equal(cleanSound(null), '');
  assert.equal(cleanSound('x'.repeat(30)).length, MAX_SOUND);
  assert.deepEqual(normalizeSounds({ alto: ' tic ', outro: 'x' }), {
    alto: 'tic',
    baixo: '',
    certo: '',
  });
});

test('sons só valem com os três preenchidos e diferentes', () => {
  assert.equal(soundsActive(SOUNDS), true);
  assert.equal(soundsActive({ ...SOUNDS, certo: '' }), false);
  assert.equal(soundsActive({ ...SOUNDS, certo: '  ' }), false);
  assert.equal(soundsActive({ ...SOUNDS, certo: 'TIC' }), false);
  assert.equal(soundsActive(undefined), false);
});

test('setSound troca só a resposta pedida', () => {
  assert.deepEqual(setSound(SOUNDS, 'baixo', ' treck '), { ...SOUNDS, baixo: 'treck' });
  assert.deepEqual(setSound(SOUNDS, 'lado', 'x'), SOUNDS);
  assert.deepEqual(setSound(undefined, 'alto', 'tic'), { alto: 'tic', baixo: '', certo: '' });
});

test('o cartão público guarda só os sons, nunca o significado', () => {
  // Senha 3-5-2, tentativa 4-5-1: baixo, certo, alto
  const answers = lockAnswers([3, 5, 2], [4, 5, 1]);
  assert.deepEqual(answerSounds(answers, SOUNDS), ['toc', 'clack', 'tic']);
  assert.deepEqual(publicAnswer(answers, SOUNDS), {
    respostas: null,
    sons: ['toc', 'clack', 'tic'],
  });
  // Sem sons válidos: as palavras de sempre
  assert.deepEqual(publicAnswer(answers, { ...SOUNDS, alto: '' }), {
    respostas: ['baixo', 'certo', 'alto'],
    sons: null,
  });
  assert.deepEqual(publicAnswer(null, SOUNDS), { respostas: null, sons: null });
  assert.equal(attemptAnswered({ sons: ['tic'] }), true);
  assert.equal(attemptAnswered({ respostas: ['alto'] }), true);
  assert.equal(attemptAnswered({ respostas: null, sons: null }), false);
});

test('sons do sussurro: só os desta fechadura', () => {
  const flag = { desafioId: 'f', ...SOUNDS };
  assert.deepEqual(soundsFromFlag(flag, 'f'), SOUNDS);
  assert.equal(soundsFromFlag(flag, 'outra'), null);
  assert.equal(soundsFromFlag(undefined, 'f'), null);
});

test('a fechadura guarda só o id do sussurro dos sons, e a nova fechadura o mantém', () => {
  const lock = normalizeLock({ sonsMsg: 'm9', senhaMsg: 's1', alto: 'tic' });
  assert.equal(lock.sonsMsg, 'm9');
  // Nada do texto dos sons fica na configuração do mundo
  assert.equal(JSON.stringify(lock).includes('tic'), false);
  assert.equal(normalizeLock({ sonsMsg: 5 }).sonsMsg, '');
  const fresh = resetLock(lock);
  assert.deepEqual([fresh.senhaMsg, fresh.sonsMsg], ['', 'm9']);
});

// ---------- Escalada: nunca passa da PA ----------

test('escalada: os pontos nunca passam da PA', () => {
  let climb = addParticipants(newChallenge('e', 'Muro', 'escalar'), ['a']);
  assert.equal(pointsCap(climb), 10);
  climb = applyChallengeTest(climb, 'a', 8);
  climb = applyChallengeTest(climb, 'a', 7);
  assert.equal(climb.participantes[0].pontos, 10);
  assert.equal(typePoints(climb, 'a', '40').participantes[0].pontos, 10);
  assert.equal(adjustPoints(climb, 'a', 3).participantes[0].pontos, 10);
  // Descendo também (a altura nunca fica negativa)
  const down = updateChallengeField(climb, 'sentido', 'descer');
  assert.equal(applyChallengeTest(down, 'a', 5).participantes[0].pontos, 10);
  // Outros tipos seguem com o limite geral
  const plain = addParticipants(newChallenge('x'), ['a']);
  assert.equal(typePoints(plain, 'a', '40').participantes[0].pontos, 40);
});

test('escalada: diminuir a PA (ou dados antigos acima dela) puxa os pontos para a PA', () => {
  let climb = addParticipants(newChallenge('e', 'Muro', 'escalar'), ['a', 'b']);
  climb = typePoints(typePoints(climb, 'a', '9'), 'b', '3');
  const lower = updateChallengeField(climb, 'pa', '5');
  assert.deepEqual(
    lower.participantes.map((p) => p.pontos),
    [5, 3],
  );
  const old = normalizeChallenge({
    id: 'v',
    tipo: 'escalar',
    pa: 6,
    participantes: [{ actorId: 'a', pontos: 14 }],
  });
  assert.equal(old.participantes[0].pontos, 6);
  // Teste estendido: a PA não limita os pontos
  const ext = normalizeChallenge({ id: 'x', pa: 6, participantes: [{ actorId: 'a', pontos: 14 }] });
  assert.equal(ext.participantes[0].pontos, 14);
});
