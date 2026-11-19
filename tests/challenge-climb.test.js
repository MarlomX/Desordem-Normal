import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addParticipants,
  applyFall,
  challengeBarView,
  challengeDtFor,
  challengeTestGain,
  costBarView,
  createChallengeTestFlag,
  loseHitPoints,
  newChallenge,
  normalizeChallenge,
  typePoints,
  updateChallengeField,
} from '../scripts/rolls/challenge.js';
import {
  buildRollModel,
  emptySelection,
  evaluateSelection,
  selectionToOptions,
} from '../scripts/rolls/roll-dialog.js';

const result = (overrides = {}) => ({
  total: 9,
  highRoll: 6,
  lowRoll: 3,
  highSum: 6,
  criticalSuccess: false,
  criticalFailure: false,
  ...overrides,
});

test('predefinições: arrombar (1 PV por teste) e escalar (8/6, individual)', () => {
  const lock = newChallenge('a', 'Baú', 'arrombar');
  assert.equal(lock.tipo, 'arrombar');
  assert.equal(lock.somaPassar, 'ra');
  assert.equal(lock.somaFalhar, 'nada');
  assert.equal(lock.custoPv, 1);
  const climb = newChallenge('e', 'Muro', 'escalar');
  assert.equal(climb.tipo, 'escalar');
  assert.equal(climb.pa, 10);
  assert.equal(climb.dtRapida, 8);
  assert.equal(climb.dtCautelosa, 6);
  assert.equal(climb.custoPv, 0);
  assert.equal(newChallenge('x', 'X', 'outro').tipo, 'estendido');
  // Tudo editável no arrombar (é um teste estendido com outros padrões)
  assert.equal(updateChallengeField(lock, 'custoPv', '0').custoPv, 0);
  assert.equal(updateChallengeField(lock, 'modo', 'grupo').modo, 'grupo');
});

test('escalar é sempre individual', () => {
  const climb = newChallenge('e', 'Muro', 'escalar');
  assert.equal(updateChallengeField(climb, 'modo', 'grupo').modo, 'individual');
  assert.equal(normalizeChallenge({ ...climb, modo: 'grupo' }).modo, 'individual');
});

test('campos novos: DTs da escalada e custo, com limites e texto vazio', () => {
  const climb = newChallenge('e', 'Muro', 'escalar');
  assert.equal(updateChallengeField(climb, 'dtRapida', '10').dtRapida, 10);
  assert.equal(updateChallengeField(climb, 'dtCautelosa', '').dtCautelosa, 6);
  assert.equal(updateChallengeField(climb, 'custoPv', '99').custoPv, 20);
  assert.equal(updateChallengeField(climb, 'custoPv', '-1').custoPv, 0);
  // Desafios antigos (sem os campos) ganham os padrões
  const old = normalizeChallenge({ id: 'v', tipo: 'estendido' });
  assert.deepEqual([old.dtRapida, old.dtCautelosa, old.custoPv], [8, 6, 0]);
});

test('DT por abordagem', () => {
  const climb = { ...newChallenge('e', 'Muro', 'escalar'), dtRapida: 9, dtCautelosa: 5 };
  assert.equal(challengeDtFor(climb, 'rapida'), 9);
  assert.equal(challengeDtFor(climb, 'cautelosa'), 5);
  assert.equal(challengeDtFor(climb, undefined), 9);
  assert.equal(challengeDtFor({ ...newChallenge('x'), dt: 11 }, 'cautelosa'), 11);
});

test('registro da escalada: a abordagem decide a soma e falhar é queda', () => {
  const climb = newChallenge('e', 'Muro', 'escalar');
  const fast = createChallengeTestFlag({ challenge: climb, actorId: 'a', abordagem: 'rapida' });
  assert.deepEqual(
    [fast.abordagem, fast.dt, fast.somaPassar, fast.somaFalhar, fast.queda],
    ['rapida', 8, 'ra', 'nada', true],
  );
  const careful = createChallengeTestFlag({
    challenge: climb,
    actorId: 'a',
    abordagem: 'cautelosa',
  });
  assert.deepEqual([careful.dt, careful.somaPassar], [6, 'rb']);
  assert.equal(createChallengeTestFlag({ challenge: climb, actorId: 'a' }).abordagem, 'rapida');
  // Exemplo da regra: rápida com 4 e 8 soma 8; cautelosa com 3 e 5 soma 3
  assert.equal(
    challengeTestGain(result({ total: 12, highRoll: 8, lowRoll: 4, highSum: 8 }), fast),
    8,
  );
  assert.equal(
    challengeTestGain(result({ total: 8, highRoll: 5, lowRoll: 3, highSum: 5 }), careful),
    3,
  );
  // Crítico: as duas mais altas, mesmo na cautelosa
  assert.equal(
    challengeTestGain(
      result({ total: 12, highRoll: 6, lowRoll: 6, highSum: 12, criticalSuccess: true }),
      careful,
    ),
    12,
  );
  // Falhou: não soma nada (a queda é o botão)
  assert.equal(challengeTestGain(result({ total: 4 }), fast), 0);
});

test('custo por teste vai no registro, com reserva própria', () => {
  const lock = newChallenge('a', 'Baú', 'arrombar');
  assert.deepEqual(createChallengeTestFlag({ challenge: lock, actorId: 'a' }).custo, {
    pv: 1,
    estado: 'pendente',
    aplicado: null,
    zerou: false,
  });
  assert.equal(createChallengeTestFlag({ challenge: newChallenge('x'), actorId: 'a' }).custo, null);
});

test('queda: dano igual aos pontos acumulados, e os pontos zeram', () => {
  let climb = addParticipants(newChallenge('e', 'Muro', 'escalar'), ['a', 'b']);
  climb = typePoints(climb, 'a', '8');
  const fall = applyFall(climb, 'a');
  assert.equal(fall.dano, 8);
  assert.equal(fall.challenge.participantes[0].pontos, 0);
  assert.equal(applyFall(climb, 'b').dano, 0);
  assert.equal(applyFall(climb, 'fora'), null);
  assert.equal(applyFall({ ...climb, ativo: false }, 'a'), null);
});

test('perda de PV: nunca abaixo de 0 e avisa quando chega a 0', () => {
  assert.deepEqual(loseHitPoints(10, 3), { pv: 7, applied: 3, reachedZero: false });
  assert.deepEqual(loseHitPoints(2, 5), { pv: 0, applied: 2, reachedZero: true });
  assert.deepEqual(loseHitPoints(4, 0), { pv: 4, applied: 0, reachedZero: false });
});

test('barra da escalada: falha vira queda com o dano de agora', () => {
  let climb = addParticipants(newChallenge('e', 'Muro', 'escalar'), ['a']);
  climb = typePoints(climb, 'a', '7');
  const flag = createChallengeTestFlag({ challenge: climb, actorId: 'a', abordagem: 'rapida' });
  const viewer = { canApply: true, claimable: true, busy: false, challenge: climb };
  const failed = challengeBarView(flag, result({ total: 5 }), viewer);
  assert.equal(failed.queda, true);
  assert.equal(failed.dano, 7);
  assert.equal(failed.abordagem, 'rapida');
  assert.equal(failed.showButton, true);
  const passed = challengeBarView(flag, result({ total: 9 }), viewer);
  assert.equal(passed.queda, false);
  assert.equal(passed.pontos, 6);
  // Falha crítica também é queda
  assert.equal(
    challengeBarView(flag, result({ total: 20, criticalFailure: true }), viewer).queda,
    true,
  );
  // Teste estendido comum nunca vira queda
  const plain = createChallengeTestFlag({ challenge: newChallenge('x'), actorId: 'a' });
  assert.equal(challengeBarView(plain, result({ total: 2 }), viewer).queda, false);
});

test('barra do custo', () => {
  assert.equal(costBarView(null, { canApply: true, claimable: true, busy: false }), null);
  const custo = { pv: 1, estado: 'pendente', aplicado: null, zerou: false };
  assert.equal(
    costBarView(custo, { canApply: true, claimable: true, busy: false }).showButton,
    true,
  );
  assert.equal(
    costBarView(custo, { canApply: false, claimable: true, busy: false }).showButton,
    false,
  );
  const paid = costBarView(
    { ...custo, estado: 'aplicado', aplicado: 1, zerou: true },
    { canApply: true, claimable: false, busy: false },
  );
  assert.deepEqual(
    [paid.applied, paid.appliedPv, paid.zerou, paid.showButton],
    [true, 1, true, false],
  );
});

const model = (overrides = {}) =>
  buildRollModel({
    skillKey: 'atletismo',
    attrDie: 8,
    skillDie: 6,
    has: {},
    resources: { impeto: 0, pd: 10 },
    challenges: [
      { id: 'e', nome: 'Muro', tipo: 'escalar', dt: 7, dtRapida: 8, dtCautelosa: 6 },
      { id: 'd', nome: 'Portão', tipo: 'estendido', dt: 9, dtRapida: 8, dtCautelosa: 6 },
    ],
    ...overrides,
  });

test('janela pré-teste: escalada escolhe a abordagem', () => {
  const m = model();
  assert.equal(m.estendido.desafios[0].tipo, 'escalar');
  const careful = evaluateSelection(m, {
    ...emptySelection(7),
    dt: 6,
    estendido: { on: true, id: 'e', abordagem: 'cautelosa' },
  });
  assert.deepEqual(careful.estendido, { on: true, id: 'e', dt: 6, abordagem: 'cautelosa' });
  // Sem abordagem: rápida
  const fast = evaluateSelection(m, {
    ...emptySelection(7),
    dt: 8,
    estendido: { on: true, id: 'e' },
  });
  assert.equal(fast.estendido.abordagem, 'rapida');
  // Teste estendido comum: sem abordagem
  const plain = selectionToOptions(m, {
    ...emptySelection(7),
    dt: 9,
    estendido: { on: true, id: 'd', abordagem: 'cautelosa' },
  });
  assert.deepEqual(plain.estendido, { on: true, id: 'd', dt: 9, abordagem: null });
});

test('janela pré-teste: sem campo de DT, a DT da abordagem', () => {
  const m = model({ showDt: false });
  const evaluated = evaluateSelection(m, {
    ...emptySelection(7),
    estendido: { on: true, id: 'e', abordagem: 'cautelosa' },
  });
  assert.equal(evaluated.estendido.dt, 6);
});

test('barra: queda aplicada aparece como queda, e não como pontos', () => {
  const climb = addParticipants(newChallenge('e', 'Muro', 'escalar'), ['a']);
  const flag = {
    ...createChallengeTestFlag({ challenge: climb, actorId: 'a' }),
    estado: 'aplicado',
    ganho: 0,
    dano: 5,
    zerou: true,
  };
  const view = challengeBarView(flag, result({ total: 2 }), {
    canApply: true,
    claimable: false,
    busy: false,
    challenge: climb,
  });
  assert.deepEqual([view.appliedQueda, view.appliedDano, view.appliedZerou], [true, 5, true]);
  const points = challengeBarView({ ...flag, dano: null }, result(), {
    canApply: true,
    claimable: false,
    busy: false,
    challenge: climb,
  });
  assert.equal(points.appliedQueda, false);
});
