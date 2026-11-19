import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_CHALLENGES,
  MAX_PARTICIPANTS,
  MAX_POINTS,
  addParticipants,
  addableChallengeActors,
  adjustPoints,
  appendChallenge,
  challengeView,
  currentPoints,
  isCompleted,
  newChallenge,
  normalizeChallenge,
  normalizeChallenges,
  parseInteger,
  removeChallenge,
  removeParticipant,
  replaceChallenge,
  sheetChallenges,
  sidebarOrder,
  typePoints,
  updateChallengeField,
  visibleChallenges,
  challengeVisibleTo,
  challengeTestChoices,
} from '../scripts/rolls/challenge.js';
import { createPenaltyFlag, penaltyAllows, penaltyScene } from '../scripts/rolls/chase.js';

const actorInfo = (id) => ({ a: { name: 'Ana', img: 'a.png' }, b: { name: 'Bia' } })[id] ?? null;

const withPeople = (overrides = {}) => ({
  ...addParticipants(newChallenge('d1', 'Portão'), ['a', 'b']),
  ...overrides,
});

test('desafio novo vem com os padrões', () => {
  assert.deepEqual(newChallenge('d1', '  Abrir   o portão '), {
    id: 'd1',
    tipo: 'estendido',
    nome: 'Abrir o portão',
    pa: 10,
    dt: 7,
    modo: 'individual',
    dtRapida: 8,
    dtCautelosa: 6,
    custoPv: 0,
    somaPassar: 'ra',
    somaFalhar: 'nada',
    revelarPa: true,
    visibilidade: 'participantes',
    ativo: true,
    total: 0,
    participantes: [],
  });
});

test('parseInteger: texto vazio não vira 0', () => {
  assert.equal(parseInteger(''), null);
  assert.equal(parseInteger('   '), null);
  assert.equal(parseInteger('abc'), null);
  assert.equal(parseInteger('1.5'), null);
  assert.equal(parseInteger(' 12 '), 12);
  assert.equal(parseInteger('-3'), -3);
  assert.equal(parseInteger(undefined), null);
});

test('normalização descarta lixo e volta campos inválidos ao padrão', () => {
  assert.equal(normalizeChallenge({ nome: 'sem id' }), null);
  const challenge = normalizeChallenge({
    id: 'x',
    tipo: 'outro',
    pa: '0',
    dt: 99,
    modo: 'turbo',
    somaPassar: 'tudo',
    somaFalhar: 'rb',
    revelarPa: false,
    ativo: 'sim',
    total: -5,
    extra: 'some',
    participantes: [
      { actorId: 'a', pontos: 3 },
      { actorId: 'a', pontos: 9 },
      { actorId: '', pontos: 1 },
      { pontos: 1 },
      { actorId: 'b', pontos: 'x' },
    ],
  });
  assert.equal(challenge.tipo, 'estendido');
  assert.equal(challenge.pa, 1);
  assert.equal(challenge.dt, 40);
  assert.equal(challenge.modo, 'individual');
  assert.equal(challenge.somaPassar, 'ra');
  assert.equal(challenge.somaFalhar, 'rb');
  assert.equal(challenge.revelarPa, false);
  assert.equal(challenge.ativo, true);
  assert.equal(challenge.total, 0);
  assert.equal('extra' in challenge, false);
  assert.deepEqual(challenge.participantes, [
    { actorId: 'a', pontos: 3 },
    { actorId: 'b', pontos: 0 },
  ]);
});

test('normalizeChallenges: configuração estragada vira lista vazia, sem ids repetidos', () => {
  assert.deepEqual(normalizeChallenges(undefined), { desafios: [] });
  assert.deepEqual(normalizeChallenges({ desafios: 'x' }), { desafios: [] });
  const data = normalizeChallenges({ desafios: [{ id: 'a' }, { id: 'a' }, null, { id: 'b' }] });
  assert.deepEqual(
    data.desafios.map((entry) => entry.id),
    ['a', 'b'],
  );
  const many = { desafios: Array.from({ length: MAX_CHALLENGES + 5 }, (_, i) => ({ id: `${i}` })) };
  assert.equal(normalizeChallenges(many).desafios.length, MAX_CHALLENGES);
});

test('lista: acrescentar, trocar e tirar', () => {
  let data = { desafios: [] };
  data = appendChallenge(data, newChallenge('a', 'A'));
  data = appendChallenge(data, newChallenge('b', 'B'));
  data = replaceChallenge(data, { ...data.desafios[0], nome: 'A2' });
  assert.deepEqual(
    data.desafios.map((entry) => entry.nome),
    ['A2', 'B'],
  );
  data = removeChallenge(data, 'a');
  assert.deepEqual(
    data.desafios.map((entry) => entry.id),
    ['b'],
  );
  const full = { desafios: Array.from({ length: MAX_CHALLENGES }, (_, i) => newChallenge(`${i}`)) };
  assert.equal(appendChallenge(full, newChallenge('z')), full);
});

test('updateChallengeField: valida cada campo', () => {
  const base = newChallenge('d1', 'Portão');
  assert.equal(updateChallengeField(base, 'nome', ' Muro ').nome, 'Muro');
  assert.equal(updateChallengeField(base, 'pa', '25').pa, 25);
  assert.equal(updateChallengeField(base, 'pa', '').pa, 10);
  assert.equal(updateChallengeField(base, 'pa', '0').pa, 1);
  assert.equal(updateChallengeField(base, 'pa', '5000').pa, 999);
  assert.equal(updateChallengeField(base, 'dt', '').dt, 7);
  assert.equal(updateChallengeField(base, 'dt', '10').dt, 10);
  assert.equal(updateChallengeField(base, 'modo', 'grupo').modo, 'grupo');
  assert.equal(updateChallengeField(base, 'modo', 'outro').modo, 'individual');
  assert.equal(updateChallengeField(base, 'somaPassar', 'rb').somaPassar, 'rb');
  assert.equal(updateChallengeField(base, 'somaFalhar', 'ra').somaFalhar, 'ra');
  assert.equal(updateChallengeField(base, 'somaFalhar', 'x').somaFalhar, 'nada');
  assert.equal(updateChallengeField(base, 'revelarPa', false).revelarPa, false);
  assert.equal(updateChallengeField(base, 'revelarPa', 'false').revelarPa, true);
  assert.equal(updateChallengeField(base, 'ativo', false).ativo, false);
  assert.equal(updateChallengeField(base, 'desconhecido', 1), base);
});

test('participantes: sem repetição e com limite', () => {
  const challenge = withPeople();
  assert.deepEqual(
    addParticipants(challenge, ['b', 'c', '', 3]).participantes.map((entry) => entry.actorId),
    ['a', 'b', 'c'],
  );
  assert.deepEqual(
    removeParticipant(challenge, 'a').participantes.map((entry) => entry.actorId),
    ['b'],
  );
  const ids = Array.from({ length: MAX_PARTICIPANTS + 3 }, (_, i) => `p${i}`);
  assert.equal(addParticipants(newChallenge('x'), ids).participantes.length, MAX_PARTICIPANTS);
});

test('pontos no modo individual: por participante, entre 0 e o limite', () => {
  let challenge = withPeople();
  challenge = adjustPoints(challenge, 'a', 4);
  challenge = adjustPoints(challenge, 'a', 3);
  assert.equal(currentPoints(challenge, 'a'), 7);
  assert.equal(currentPoints(challenge, 'b'), 0);
  assert.equal(currentPoints(challenge, 'fora'), null);
  assert.equal(adjustPoints(challenge, 'a', -50).participantes[0].pontos, 0);
  assert.equal(adjustPoints(challenge, 'fora', 3), challenge);
  assert.equal(typePoints(challenge, 'b', '').participantes[1].pontos, 0);
  assert.equal(typePoints(challenge, 'b', '12').participantes[1].pontos, 12);
  assert.equal(typePoints(challenge, 'b', '999999').participantes[1].pontos, MAX_POINTS);
  // O total do grupo não muda no modo individual
  assert.equal(challenge.total, 0);
});

test('pontos no modo grupo: uma pontuação só, para todos', () => {
  let challenge = withPeople({ modo: 'grupo' });
  challenge = adjustPoints(challenge, 'a', 4);
  challenge = adjustPoints(challenge, 'b', 5);
  assert.equal(challenge.total, 9);
  assert.equal(currentPoints(challenge, 'qualquer'), 9);
  assert.deepEqual(
    challenge.participantes.map((entry) => entry.pontos),
    [0, 0],
  );
  assert.equal(typePoints(challenge, null, '3').total, 3);
});

test('concluído: grupo pelo total, individual quando todos chegam', () => {
  const grupo = withPeople({ modo: 'grupo', pa: 10, total: 10 });
  assert.equal(isCompleted(grupo), true);
  assert.equal(isCompleted({ ...grupo, total: 9 }), false);
  let individual = withPeople({ pa: 5 });
  assert.equal(isCompleted(individual), false);
  individual = typePoints(individual, 'a', '5');
  assert.equal(isCompleted(individual), false);
  individual = typePoints(individual, 'b', '6');
  assert.equal(isCompleted(individual), true);
  assert.equal(isCompleted(newChallenge('vazio')), false);
});

test('visibilidade: jogador só vê os ativos; PA escondida não aparece', () => {
  const data = {
    desafios: [withPeople(), { ...withPeople(), id: 'd2', ativo: false }],
  };
  assert.equal(visibleChallenges(data, { isGM: true }).length, 2);
  assert.deepEqual(
    visibleChallenges(data, { isGM: false, ownedActorIds: ['a'] }).map((entry) => entry.id),
    ['d1'],
  );

  const hidden = typePoints(
    typePoints(withPeople({ revelarPa: false, pa: 3 }), 'a', '3'),
    'b',
    '4',
  );
  const player = challengeView(hidden, { isGM: false, actorInfo });
  assert.equal(player.pa, null);
  assert.equal(player.concluido, false);
  assert.equal(player.participantes[0].chegou, false);
  const gm = challengeView(hidden, { isGM: true, actorInfo });
  assert.equal(gm.pa, 3);
  assert.equal(gm.concluido, true);
  assert.equal(gm.participantes[0].chegou, true);
});

test('challengeView: nomes dos atores e ator que sumiu', () => {
  const view = challengeView(addParticipants(withPeople(), ['sumiu']), {
    isGM: true,
    actorInfo,
  });
  assert.deepEqual(
    view.participantes.map(({ name, img, missing }) => ({ name, img, missing })),
    [
      { name: 'Ana', img: 'a.png', missing: false },
      { name: 'Bia', img: '', missing: false },
      { name: '', img: '', missing: true },
    ],
  );
  assert.equal(view.semNome, false);
  assert.equal(challengeView(newChallenge('x'), { isGM: true, actorInfo }).semNome, true);
});

test('cartão da ficha: só desafios ativos de que o personagem participa', () => {
  const data = {
    desafios: [
      typePoints(withPeople({ pa: 4 }), 'a', '4'),
      { ...withPeople({ modo: 'grupo', total: 6, revelarPa: false }), id: 'd2' },
      { ...withPeople(), id: 'd3', ativo: false },
      { ...newChallenge('d4', 'Outro'), participantes: [{ actorId: 'b', pontos: 1 }] },
    ],
  };
  const card = sheetChallenges(data, 'a', { isGM: false });
  assert.deepEqual(
    card.map(({ id, pontos, pa, chegou, grupo }) => ({ id, pontos, pa, chegou, grupo })),
    [
      { id: 'd1', pontos: 4, pa: 4, chegou: true, grupo: false },
      { id: 'd2', pontos: 6, pa: null, chegou: false, grupo: true },
    ],
  );
  assert.deepEqual(sheetChallenges(data, '', { isGM: true }), []);
  assert.equal(sheetChallenges(data, 'a', { isGM: true })[1].pa, 10);
});

test('personagens que ainda podem entrar, em ordem alfabética', () => {
  const candidates = [
    { id: 'c', name: 'Caio' },
    { id: 'a', name: 'Ana' },
    { id: 'z', name: 'Álvaro' },
  ];
  assert.deepEqual(
    addableChallengeActors(candidates, withPeople()).map((actor) => actor.id),
    ['z', 'c'],
  );
});

test('ordem da barra lateral: a guia nova entra logo depois de Cenas', () => {
  const keys = ['chat', 'combat', 'scenes', 'actors', 'settings'];
  assert.deepEqual(sidebarOrder(keys, 'desafios'), [
    'chat',
    'combat',
    'scenes',
    'desafios',
    'actors',
    'settings',
  ]);
  // Sem Cenas: antes das configurações
  assert.deepEqual(sidebarOrder(['chat', 'settings'], 'desafios'), [
    'chat',
    'desafios',
    'settings',
  ]);
  // Já registrada (outra chamada): não duplica
  assert.deepEqual(sidebarOrder(['chat', 'desafios', 'scenes'], 'desafios'), [
    'chat',
    'scenes',
    'desafios',
  ]);
  assert.deepEqual(sidebarOrder([], 'desafios'), ['desafios']);
});

test('penalidade do desafio: guarda a cena e os atores escolhidos', () => {
  const flag = createPenaltyFlag({ tipo: 'pv', valor: 2, cena: 'desafio', alvos: ['a'] });
  assert.equal(penaltyScene(flag), 'desafio');
  assert.deepEqual(flag.alvos, ['a']);
  assert.equal(penaltyAllows(flag, 'a'), true);
  assert.equal(penaltyAllows(flag, 'b'), false);
});

test('visibilidade: todos, só participantes ou só o mestre', () => {
  const base = addParticipants(newChallenge('d1', 'Portão'), ['a']);
  assert.equal(base.visibilidade, 'participantes');
  // Desafios antigos (sem o campo) continuam visíveis para todos
  assert.equal(normalizeChallenge({ id: 'v' }).visibilidade, 'todos');
  assert.equal(updateChallengeField(base, 'visibilidade', 'mestre').visibilidade, 'mestre');
  assert.equal(updateChallengeField(base, 'visibilidade', 'x'), base);
  const all = { ...base, id: 't', visibilidade: 'todos' };
  const gm = { ...base, id: 'm', visibilidade: 'mestre' };
  const data = { desafios: [base, all, gm] };
  const ids = (viewer) => visibleChallenges(data, viewer).map((entry) => entry.id);
  assert.deepEqual(ids({ isGM: true }), ['d1', 't', 'm']);
  // Jogador dono do participante: vê o «participantes» e o «todos»
  assert.deepEqual(ids({ isGM: false, ownedActorIds: ['a'] }), ['d1', 't']);
  // Jogador de fora: só o «todos»
  assert.deepEqual(ids({ isGM: false, ownedActorIds: ['z'] }), ['t']);
  assert.deepEqual(ids({ isGM: false }), ['t']);
  // Encerrado continua escondido do jogador
  assert.equal(challengeVisibleTo({ ...all, ativo: false }, { isGM: false }), false);
  // Ficha e janela pré-teste: o jogador não vê o desafio «só o mestre»
  assert.deepEqual(
    sheetChallenges(data, 'a', { isGM: false }).map((entry) => entry.id),
    ['d1', 't'],
  );
  assert.equal(sheetChallenges(data, 'a', { isGM: true }).length, 3);
  assert.deepEqual(
    challengeTestChoices(data, 'a').map((entry) => entry.id),
    ['d1', 't'],
  );
  assert.equal(challengeTestChoices(data, 'a', { isGM: true }).length, 3);
});
