import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addParticipants,
  applyChallengeFailure,
  applyChallengeTest,
  challengeBarView,
  challengeDtFor,
  challengeTestChoices,
  challengeTestGain,
  challengeView,
  createChallengeTestFlag,
  failureKind,
  isCompleted,
  newChallenge,
  normalizeChallenge,
  sheetChallenges,
  sustainReduction,
  sustainStepMods,
  sustainSteps,
  typePoints,
  updateChallengeField,
} from '../scripts/rolls/challenge.js';
import { buildRollModel, emptySelection, evaluateSelection } from '../scripts/rolls/roll-dialog.js';

const result = (overrides = {}) => ({
  total: 9,
  highRoll: 6,
  lowRoll: 3,
  highSum: 6,
  criticalSuccess: false,
  criticalFailure: false,
  ...overrides,
});
const failed = result({ total: 4, highRoll: 3, lowRoll: 1, highSum: 3 });
const actorInfo = () => ({ name: 'Ana' });

test('alcançar: PA fixa em 2, individual, arriscada com DT +3', () => {
  const reach = newChallenge('r', 'Viga', 'alcancar');
  assert.deepEqual([reach.pa, reach.modo, reach.dt], [2, 'individual', 7]);
  assert.equal(updateChallengeField(reach, 'pa', '10').pa, 2);
  assert.equal(updateChallengeField(reach, 'modo', 'grupo').modo, 'individual');
  assert.equal(normalizeChallenge({ ...reach, pa: 50 }).pa, 2);
  assert.equal(challengeDtFor(reach, 'segura'), 7);
  assert.equal(challengeDtFor(reach, 'arriscada'), 10);
  assert.equal(challengeDtFor({ ...reach, dt: 39 }, 'arriscada'), 40);
  assert.equal(challengeView(reach, { isGM: true, actorInfo }).dtArriscada, 10);
});

test('alcançar seguro: cada sucesso é uma ação; falhar dá dano = RB e zera', () => {
  let reach = addParticipants(newChallenge('r', 'Viga', 'alcancar'), ['a']);
  const flag = createChallengeTestFlag({ challenge: reach, actorId: 'a', abordagem: 'segura' });
  assert.deepEqual(
    [flag.abordagem, flag.somaPassar, flag.falha, flag.danoRolagem, flag.zeraAoFalhar, flag.dt],
    ['segura', 'um', 'dano', 'rb', true, 7],
  );
  assert.equal(challengeTestGain(result(), flag), 1);
  // O crítico também vale uma ação só
  assert.equal(challengeTestGain(result({ criticalSuccess: true, highSum: 12 }), flag), 1);
  assert.equal(challengeTestGain(failed, flag), 0);
  reach = applyChallengeTest(reach, 'a', 1);
  assert.equal(isCompleted(reach), false);
  const fail = applyChallengeFailure(reach, flag, failed);
  assert.deepEqual([fail.kind, fail.dano, fail.challenge.participantes[0].pontos], ['dano', 1, 0]);
  reach = applyChallengeTest(applyChallengeTest(reach, 'a', 1), 'a', 1);
  assert.equal(reach.participantes[0].pontos, 2);
  assert.equal(isCompleted(reach), true);
  // Nunca passa de 2
  assert.equal(applyChallengeTest(reach, 'a', 1).participantes[0].pontos, 2);
});

test('alcançar arriscado: um sucesso alcança; falhar dá dano = RA sem mexer no progresso', () => {
  let reach = typePoints(addParticipants(newChallenge('r', 'Viga', 'alcancar'), ['a']), 'a', '1');
  const flag = createChallengeTestFlag({ challenge: reach, actorId: 'a', abordagem: 'arriscada' });
  assert.deepEqual(
    [flag.somaPassar, flag.danoRolagem, flag.zeraAoFalhar, flag.dt],
    ['tudo', 'ra', false, 10],
  );
  assert.equal(
    applyChallengeTest(reach, 'a', challengeTestGain(result({ total: 12 }), flag)).participantes[0]
      .pontos,
    2,
  );
  const fail = applyChallengeFailure(reach, flag, failed);
  assert.deepEqual([fail.dano, fail.challenge.participantes[0].pontos], [3, 1]);
  // Abordagem desconhecida: segura
  assert.equal(createChallengeTestFlag({ challenge: reach, actorId: 'a' }).abordagem, 'segura');
});

test('sustentar: um participante só, 1 PV para começar', () => {
  let hold = newChallenge('s', 'Rocha', 'sustentar');
  assert.deepEqual([hold.modo, hold.custoPv, hold.dt], ['individual', 1, 7]);
  hold = addParticipants(hold, ['a', 'b']);
  assert.deepEqual(
    hold.participantes.map((entry) => entry.actorId),
    ['a'],
  );
  assert.equal(addParticipants(hold, ['c']).participantes.length, 1);
  assert.equal(
    normalizeChallenge({
      ...hold,
      participantes: [
        { actorId: 'a', pontos: 0 },
        { actorId: 'b', pontos: 0 },
      ],
    }).participantes.length,
    1,
  );
  assert.equal(challengeView(hold, { isGM: true, actorInfo }).lotado, true);
  // Nunca «concluído»: dura enquanto aguentar
  assert.equal(isCompleted(typePoints(hold, 'a', '50')), false);
});

test('sustentar: cada rodada sustentada reduz um passo do próximo teste', () => {
  let hold = addParticipants(newChallenge('s', 'Rocha', 'sustentar'), ['a']);
  const first = createChallengeTestFlag({ challenge: hold, actorId: 'a' });
  assert.deepEqual([first.passos, first.somaPassar, first.falha], [0, 'um', 'soltar']);
  assert.equal(first.custo.pv, 1);
  hold = applyChallengeTest(hold, 'a', challengeTestGain(result(), first));
  hold = applyChallengeTest(hold, 'a', 1);
  assert.equal(sustainSteps(hold, 'a'), 2);
  const third = createChallengeTestFlag({ challenge: hold, actorId: 'a' });
  assert.equal(third.passos, 2);
  // O PV é gasto só para começar
  assert.equal(third.custo, null);
  assert.equal(challengeTestChoices({ desafios: [hold] }, 'a')[0].passos, 2);
  // Falhar solta o objeto: sem dano, as rodadas zeram
  const drop = applyChallengeFailure(hold, third, failed);
  assert.deepEqual(
    [drop.kind, drop.dano, drop.challenge.participantes[0].pontos],
    ['soltar', 0, 0],
  );
  assert.equal(sustainSteps(newChallenge('x'), 'a'), 0);
});

test('falhas: tipos e registros antigos', () => {
  assert.equal(failureKind({ queda: true }), 'queda');
  assert.equal(failureKind({ falha: 'dano' }), 'dano');
  assert.equal(failureKind({}), null);
  assert.equal(
    applyChallengeFailure(newChallenge('x'), { falha: null, actorId: 'a' }, failed),
    null,
  );
  const reach = addParticipants(newChallenge('r', 'Viga', 'alcancar'), ['a']);
  const flag = createChallengeTestFlag({ challenge: reach, actorId: 'a' });
  assert.equal(applyChallengeFailure({ ...reach, ativo: false }, flag, failed), null);
  assert.equal(applyChallengeFailure(reach, { ...flag, actorId: 'fora' }, failed), null);
});

test('barra: dano do alcançar vem da rolagem; sustentar solta sem dano', () => {
  const reach = addParticipants(newChallenge('r', 'Viga', 'alcancar'), ['a']);
  const viewer = { canApply: true, claimable: true, busy: false, challenge: reach };
  const safe = createChallengeTestFlag({ challenge: reach, actorId: 'a', abordagem: 'segura' });
  let view = challengeBarView(safe, failed, viewer);
  assert.deepEqual([view.falha, view.dano, view.zera, view.queda], ['dano', 1, true, false]);
  const risky = createChallengeTestFlag({ challenge: reach, actorId: 'a', abordagem: 'arriscada' });
  view = challengeBarView(risky, failed, viewer);
  assert.deepEqual([view.dano, view.zera], [3, false]);
  assert.equal(challengeBarView(risky, result({ total: 12 }), viewer).falha, null);

  const hold = addParticipants(newChallenge('s', 'Rocha', 'sustentar'), ['a']);
  const flag = createChallengeTestFlag({ challenge: hold, actorId: 'a' });
  view = challengeBarView(flag, failed, { ...viewer, challenge: hold });
  assert.deepEqual([view.falha, view.dano], ['soltar', 0]);
  // Já aplicado: guarda qual falha e o total depois
  view = challengeBarView(
    { ...flag, estado: 'aplicado', ganho: 0, dano: 0, falhaAplicada: 'soltar', depois: 0 },
    failed,
    { ...viewer, challenge: hold, claimable: false },
  );
  assert.deepEqual(
    [view.appliedFalha, view.appliedQueda, view.appliedDepois],
    ['soltar', false, 0],
  );
});

test('ficha: sustentar sem PA; alcançar com 2', () => {
  const data = {
    desafios: [
      typePoints(addParticipants(newChallenge('s', 'Rocha', 'sustentar'), ['a']), 'a', '3'),
      typePoints(addParticipants(newChallenge('r', 'Viga', 'alcancar'), ['a']), 'a', '2'),
    ],
  };
  const [hold, reach] = sheetChallenges(data, 'a', { isGM: false });
  assert.deepEqual([hold.sustentar, hold.pontos, hold.pa, hold.chegou], [true, 3, null, false]);
  assert.deepEqual([reach.alcancar, reach.pa, reach.chegou], [true, 2, true]);
});

const model = () =>
  buildRollModel({
    skillKey: 'atletismo',
    attrDie: 8,
    skillDie: 8,
    has: {},
    resources: { impeto: 0, pd: 10 },
    challenges: [
      { id: 'r', nome: 'Viga', tipo: 'alcancar', dt: 7, dtRapida: 8, dtCautelosa: 6, passos: 0 },
      { id: 's', nome: 'Rocha', tipo: 'sustentar', dt: 7, dtRapida: 8, dtCautelosa: 6, passos: 2 },
    ],
  });

test('janela pré-teste: alcançar escolhe a forma', () => {
  const m = model();
  const risky = evaluateSelection(m, {
    ...emptySelection(7),
    dt: 10,
    estendido: { on: true, id: 'r', alcance: 'arriscada', abordagem: 'cautelosa' },
  });
  assert.equal(risky.estendido.abordagem, 'arriscada');
  assert.equal(risky.estendido.dt, 10);
  const safe = evaluateSelection(m, { ...emptySelection(7), estendido: { on: true, id: 'r' } });
  assert.equal(safe.estendido.abordagem, 'segura');
});

test('janela pré-teste: sustentar mostra os dados reduzidos', () => {
  const m = model();
  const plain = evaluateSelection(m, emptySelection(7));
  const hold = evaluateSelection(m, { ...emptySelection(7), estendido: { on: true, id: 's' } });
  assert.equal(hold.estendido.passos, 2);
  // d8 + d8 com duas reduções viram d4 + d4
  assert.deepEqual(plain.rolledSides, [8, 8]);
  // Duas reduções em d8 + d8: uma em cada dado (no empate, primeiro o atributo)
  assert.deepEqual(hold.rolledSides, [6, 6]);
  assert.deepEqual(hold.estendido.reducao, { attribute: 1, skill: 1 });
  assert.equal(
    evaluateSelection(m, { ...emptySelection(7), estendido: { on: true, id: 'r' } }).estendido
      .passos,
    0,
  );
});

test('sustentar: cada redução cai no dado mais forte daquele momento', () => {
  // d8 + d10 → d8 + d8 → d6 + d8 → d6 + d6
  assert.deepEqual(sustainReduction(8, 10, 1), { attribute: 0, skill: 1 });
  assert.deepEqual(sustainReduction(8, 10, 2), { attribute: 1, skill: 1 });
  assert.deepEqual(sustainReduction(8, 10, 3), { attribute: 1, skill: 2 });
  // d10 + d6 → d8 + d6 → d6 + d6
  assert.deepEqual(sustainReduction(10, 6, 1), { attribute: 1, skill: 0 });
  assert.deepEqual(sustainReduction(10, 6, 2), { attribute: 2, skill: 0 });
  // Empate em d6 + d6: primeiro o atributo (d4 + d6)
  assert.deepEqual(sustainReduction(10, 6, 3), { attribute: 3, skill: 0 });
  assert.deepEqual(sustainReduction(10, 6, 4), { attribute: 3, skill: 1 });
  // Para em d4 + d4
  assert.deepEqual(sustainReduction(6, 4, 9), { attribute: 1, skill: 0 });
  assert.deepEqual(sustainReduction(4, 4, 3), { attribute: 0, skill: 0 });
  assert.deepEqual(sustainReduction(12, 8, 0), { attribute: 0, skill: 0 });
  // d20 (paranormal) cai primeiro
  assert.deepEqual(sustainReduction(20, 12, 1), { attribute: 1, skill: 0 });
  assert.deepEqual(sustainStepMods({ attribute: 1, skill: 2 }), [
    { target: 'attribute', steps: -1 },
    { target: 'skill', steps: -2 },
  ]);
  assert.deepEqual(sustainStepMods({ attribute: 0, skill: 0 }), []);
  assert.deepEqual(sustainStepMods(undefined), []);
});

test('janela pré-teste: os dados do exemplo d10 + d6 com duas rodadas viram d6 + d6', () => {
  const m = buildRollModel({
    skillKey: 'atletismo',
    attrDie: 10,
    skillDie: 6,
    has: {},
    resources: { impeto: 0, pd: 10 },
    challenges: [{ id: 's', nome: 'Rocha', tipo: 'sustentar', dt: 7, passos: 2 }],
  });
  const hold = evaluateSelection(m, { ...emptySelection(7), estendido: { on: true, id: 's' } });
  assert.deepEqual(hold.rolledSides, [6, 6]);
});
