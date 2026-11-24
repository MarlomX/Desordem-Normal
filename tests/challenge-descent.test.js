// Escalar: descida (v0.27.1)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLIMB_DIRECTIONS,
  addParticipants,
  adjustShownPoints,
  applyChallengeFailure,
  applyChallengeTest,
  applyFall,
  challengeBarView,
  challengeView,
  climbHeight,
  createChallengeTestFlag,
  isCompleted,
  isDescent,
  newChallenge,
  normalizeChallenge,
  sheetChallenges,
  shownPoints,
  typePoints,
  typeShownPoints,
  unitKey,
  updateChallengeField,
} from '../scripts/rolls/challenge.js';

const result = (overrides = {}) => ({
  total: 9,
  highRoll: 6,
  lowRoll: 3,
  highSum: 6,
  criticalSuccess: false,
  criticalFailure: false,
  ...overrides,
});
const actorInfo = (id) => ({ name: id.toUpperCase() });

/** Descida de 10 com o personagem `a` (já desceu `pontos`). */
const descent = (pontos = 0, extra = {}) => {
  let climb = addParticipants(newChallenge('d', 'Poço', 'escalar'), ['a']);
  climb = updateChallengeField(climb, 'sentido', 'descer');
  climb = { ...climb, ...extra };
  return typePoints(climb, 'a', String(pontos));
};

test('sentido: escalar sobe por padrão; só a escalada aceita «descer»', () => {
  assert.deepEqual(CLIMB_DIRECTIONS, ['subir', 'descer']);
  const climb = newChallenge('e', 'Muro', 'escalar');
  assert.equal(climb.sentido, 'subir');
  // Desafio antigo, sem o campo: sobe; valor estranho: sobe
  assert.equal(normalizeChallenge({ id: 'v', tipo: 'escalar' }).sentido, 'subir');
  assert.equal(normalizeChallenge({ id: 'v', tipo: 'escalar', sentido: 'x' }).sentido, 'subir');
  assert.equal(
    normalizeChallenge({ id: 'v', tipo: 'escalar', sentido: 'descer' }).sentido,
    'descer',
  );
  // Outros tipos não têm sentido
  assert.equal('sentido' in newChallenge('x'), false);
  assert.equal(updateChallengeField(newChallenge('x'), 'sentido', 'descer').sentido, undefined);
  assert.equal(updateChallengeField(climb, 'sentido', 'lado').sentido, 'subir');
  assert.equal(isDescent(updateChallengeField(climb, 'sentido', 'descer')), true);
  assert.equal(isDescent(climb), false);
});

test('altura: a PA menos o progresso, nunca abaixo de 0', () => {
  const climb = descent();
  assert.equal(climbHeight(climb, 0), 10);
  assert.equal(climbHeight(climb, 4), 6);
  assert.equal(climbHeight(climb, 12), 0);
});

test('o número mostrado: altura na descida; quanto desceu com a PA escondida', () => {
  const visible = descent(4);
  assert.equal(shownPoints(visible, 4, { isGM: false }), 6);
  assert.equal(unitKey(visible, { isGM: false }), 'descer');
  const hidden = descent(4, { revelarPa: false });
  assert.equal(shownPoints(hidden, 4, { isGM: false }), 4);
  assert.equal(unitKey(hidden, { isGM: false }), 'descerOculto');
  // O mestre sempre vê a altura
  assert.equal(shownPoints(hidden, 4, { isGM: true }), 6);
  assert.equal(unitKey(hidden, { isGM: true }), 'descer');
  // Subindo, nada muda
  const up = newChallenge('e', 'Muro', 'escalar');
  assert.equal(shownPoints(up, 4, { isGM: false }), 4);
  assert.equal(unitKey(up, { isGM: false }), 'escalar');
});

test('janela, guia e ficha mostram a altura que falta', () => {
  const climb = descent(4);
  const view = challengeView(climb, { isGM: true, actorInfo });
  assert.equal(view.descer, true);
  assert.equal(view.unidadeChave, 'descer');
  assert.equal(view.participantes[0].pontos, 6);
  assert.equal(view.participantes[0].chegou, false);
  const [card] = sheetChallenges({ desafios: [climb] }, 'a', { isGM: false });
  assert.deepEqual(
    [card.pontos, card.pa, card.unidadeChave, card.chegou],
    [6, 10, 'descer', false],
  );
  // Com a PA escondida o jogador vê quanto desceu, sem a PA
  const [hidden] = sheetChallenges({ desafios: [descent(4, { revelarPa: false })] }, 'a', {
    isGM: false,
  });
  assert.deepEqual([hidden.pontos, hidden.pa, hidden.unidadeChave], [4, null, 'descerOculto']);
  // Chegou embaixo: concluído
  const bottom = descent(10);
  assert.equal(challengeView(bottom, { isGM: true, actorInfo }).participantes[0].pontos, 0);
  assert.equal(challengeView(bottom, { isGM: true, actorInfo }).participantes[0].chegou, true);
  assert.equal(isCompleted(bottom), true);
});

test('mestre digita e ajusta a altura; o progresso guardado acompanha', () => {
  const climb = descent(0);
  assert.equal(typeShownPoints(climb, 'a', '6').participantes[0].pontos, 4);
  assert.equal(typeShownPoints(climb, 'a', '15').participantes[0].pontos, 0);
  assert.equal(typeShownPoints(climb, 'a', ''), climb);
  // − desce (altura 10 → 9: progresso 1); + sobe de volta
  const down = adjustShownPoints(climb, 'a', -1);
  assert.equal(down.participantes[0].pontos, 1);
  assert.equal(adjustShownPoints(down, 'a', 1).participantes[0].pontos, 0);
  // Subindo, digitar e −/+ são os pontos de sempre
  const up = addParticipants(newChallenge('e', 'Muro', 'escalar'), ['a']);
  assert.equal(typeShownPoints(up, 'a', '6').participantes[0].pontos, 6);
  assert.equal(adjustShownPoints(up, 'a', 1).participantes[0].pontos, 1);
});

test('passar desce: o ganho soma ao progresso e a altura diminui', () => {
  const climb = descent(0);
  const flag = createChallengeTestFlag({ challenge: climb, actorId: 'a', abordagem: 'rapida' });
  assert.equal(flag.sentido, 'descer');
  const next = applyChallengeTest(climb, 'a', 4);
  assert.equal(climbHeight(next, next.participantes[0].pontos), 6);
  // Subindo, o registro guarda «subir»
  const up = createChallengeTestFlag({
    challenge: newChallenge('e', 'Muro', 'escalar'),
    actorId: 'a',
  });
  assert.equal(up.sentido, 'subir');
  // Outros tipos não levam sentido
  assert.equal(
    createChallengeTestFlag({ challenge: newChallenge('x'), actorId: 'a' }).sentido,
    undefined,
  );
});

test('queda na descida: começou em 10, desceu 4, cai de 6 e chega embaixo', () => {
  const climb = descent(4);
  const fall = applyFall(climb, 'a', 'descer');
  assert.equal(fall.dano, 6);
  assert.equal(fall.challenge.participantes[0].pontos, 10);
  assert.equal(isCompleted(fall.challenge), true);
  // Pelo registro do teste (o sentido de quando rolou)
  const flag = createChallengeTestFlag({ challenge: climb, actorId: 'a', abordagem: 'rapida' });
  const failure = applyChallengeFailure(climb, flag, result({ total: 2 }));
  assert.deepEqual([failure.kind, failure.dano], ['queda', 6]);
  // Cartões antigos (sem sentido) e a subida: dano = pontos, que zeram
  const up = applyFall(climb, 'a');
  assert.deepEqual([up.dano, up.challenge.participantes[0].pontos], [4, 0]);
});

test('barra da descida: dano = altura; com a PA escondida, só o mestre vê o número', () => {
  const climb = descent(4);
  const flag = createChallengeTestFlag({ challenge: climb, actorId: 'a', abordagem: 'rapida' });
  const viewer = { canApply: true, claimable: true, busy: false, challenge: climb };
  const failed = challengeBarView(flag, result({ total: 2 }), viewer);
  assert.deepEqual(
    [failed.queda, failed.descer, failed.dano, failed.danoOculto],
    [true, true, 6, false],
  );
  const hidden = descent(4, { revelarPa: false });
  const player = challengeBarView(flag, result({ total: 2 }), { ...viewer, challenge: hidden });
  assert.equal(player.danoOculto, true);
  const gm = challengeBarView(flag, result({ total: 2 }), {
    ...viewer,
    challenge: hidden,
    isGM: true,
  });
  assert.equal(gm.danoOculto, false);
  // Passou: não é queda, nada escondido
  const passed = challengeBarView(flag, result({ total: 9 }), { ...viewer, challenge: hidden });
  assert.deepEqual([passed.queda, passed.danoOculto, passed.pontos], [false, false, 6]);
});

test('trocar o sentido no meio: o cartão já rolado aplica a queda que valia', () => {
  const climb = descent(4);
  const flag = createChallengeTestFlag({ challenge: climb, actorId: 'a', abordagem: 'rapida' });
  const switched = updateChallengeField(climb, 'sentido', 'subir');
  const failure = applyChallengeFailure(switched, flag, result({ total: 2 }));
  assert.equal(failure.dano, 6);
});
