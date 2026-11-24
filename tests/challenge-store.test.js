/**
 * Onde os desafios ficam guardados (configuração do mundo). Escritos na v0.28.3, antes da store
 * passar a usar o módulo comum (`scripts/shared/world-store.js`): fixam a leitura, a fila das
 * gravações e o aviso às janelas.
 */
import { makeUser, resetFoundry } from './foundry-stub.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createChallenge,
  deleteChallenge,
  getChallenge,
  mutateChallenge,
  mutateChallenges,
  onChallengesChange,
  readChallenges,
  registerChallengeSetting,
} from '../scripts/challenges/store.js';

const KEY = 'desordem-normal.desafios';

function setup(user = makeUser('gm', { isGM: true })) {
  resetFoundry({ user });
  registerChallengeSetting();
}

test('sem nada gravado, a lista de desafios começa vazia', () => {
  setup();
  assert.deepEqual(readChallenges(), { desafios: [] });
});

test('uma configuração estragada vira lista vazia (com aviso no console)', () => {
  setup();
  game.settings.get = () => {
    throw new Error('estragada');
  };
  const original = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);
  try {
    assert.deepEqual(readChallenges(), { desafios: [] });
  } finally {
    console.warn = original;
  }
  assert.equal(warnings.length, 1);
});

test('o mestre cria, muda e apaga desafios', async () => {
  setup();
  const id = await createChallenge('Porta', 'arrombar');
  assert.equal(getChallenge(id).nome, 'Porta');
  assert.equal(getChallenge(id).tipo, 'arrombar');
  await mutateChallenge(id, (challenge) => ({ ...challenge, nome: 'Portão' }));
  assert.equal(getChallenge(id).nome, 'Portão');
  await deleteChallenge(id);
  assert.equal(getChallenge(id), null);
});

test('duas gravações seguidas não se sobrepõem (cada uma relê a lista)', async () => {
  setup();
  const a = createChallenge('A');
  const b = createChallenge('B');
  await Promise.all([a, b]);
  assert.deepEqual(
    readChallenges().desafios.map((entry) => entry.nome),
    ['A', 'B'],
  );
});

test('devolver a mesma lista não grava nada', async () => {
  setup();
  let writes = 0;
  const set = game.settings.set.bind(game.settings);
  game.settings.set = (...args) => {
    writes++;
    return set(...args);
  };
  await mutateChallenges((data) => data);
  await mutateChallenges(() => null);
  assert.equal(writes, 0);
});

test('jogador não grava', async () => {
  setup(makeUser('player'));
  await mutateChallenges((data) => ({ desafios: [...data.desafios, { id: 'x', nome: 'X' }] }));
  assert.equal(game.settings.values.has(KEY), false);
});

test('um erro na gravação vai para o console e não trava a fila', async () => {
  setup();
  const original = console.error;
  const errors = [];
  console.error = (...args) => errors.push(args);
  try {
    await mutateChallenges(() => {
      throw new Error('falhou');
    });
    await createChallenge('Depois');
  } finally {
    console.error = original;
  }
  assert.equal(errors.length, 1);
  assert.equal(readChallenges().desafios[0].nome, 'Depois');
});

test('quem ouve é avisado a cada gravação; um erro num ouvinte não impede os outros', async () => {
  setup();
  const calls = [];
  const stop = onChallengesChange(() => calls.push('a'));
  onChallengesChange(() => {
    throw new Error('quebrou');
  });
  onChallengesChange(() => calls.push('c'));
  const original = console.error;
  console.error = () => {};
  try {
    await createChallenge('A');
    stop();
    await createChallenge('B');
  } finally {
    console.error = original;
  }
  assert.deepEqual(calls, ['a', 'c', 'c']);
});
