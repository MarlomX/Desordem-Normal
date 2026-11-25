// Desafio de equilíbrio: diferença dos d10, registro e reserva.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BALANCE_CLAIM_MS,
  analyseBalance,
  assignBonusDie,
  balanceOpen,
  balanceRerollCandidates,
  balanceState,
  balanceView,
  createBalanceFlag,
  finishBalance,
  releaseBalance,
  rerollBalance,
  reserveBalance,
  rollBonusDie,
} from '../scripts/rolls/balance.js';
import {
  addParticipants,
  applyBalanceFall,
  balanceReserveSize,
  challengeView,
  newChallenge,
  participantReserve,
  registerBalanceRound,
  sheetChallenges,
  spendBalanceDie,
  typeReserve,
  updateChallengeField,
} from '../scripts/rolls/challenge.js';

const flagOf = (values) => createBalanceFlag({ desafioId: 'e', actorId: 'a', values });
const viewer = (overrides = {}) => ({
  canAct: true,
  reserve: 3,
  rounds: 0,
  target: 3,
  active: true,
  now: 1000,
  ...overrides,
});

test('equilíbrio: diferença de 0 ou 1 equilibra; 2 ou mais cai (exemplos da regra)', () => {
  assert.equal(balanceState(flagOf([5, 5])).balanced, true);
  assert.equal(balanceState(flagOf([5, 6])).balanced, true);
  assert.equal(balanceState(flagOf([5, 7])).balanced, false);
  assert.deepEqual(balanceState(flagOf([5, 7])).diff, 2);
});

test('registro: só dois d10 válidos', () => {
  assert.equal(flagOf([5]), null);
  assert.equal(flagOf([0, 5]), null);
  assert.equal(flagOf([5, 11]), null);
  assert.deepEqual(flagOf([3, 4]).somas, [0, 0]);
});

test('reserva: metade da Acrobacia', () => {
  assert.deepEqual(
    [4, 6, 8, 10, 12].map((die) => balanceReserveSize(die)),
    [2, 3, 4, 5, 6],
  );
  assert.equal(balanceReserveSize(undefined), 0);
});

test('exemplo da regra: 6 e 9, d4 = 2 no 6 → 8 e 9, equilibra', () => {
  let flag = flagOf([6, 9]);
  assert.equal(balanceState(flag).balanced, false);
  flag = rollBonusDie(flag, 2);
  assert.equal(flag.pendente, 2);
  // Outro d4 antes de somar este: não vale
  assert.equal(rollBonusDie(flag, 3), null);
  flag = assignBonusDie(flag, 0);
  assert.deepEqual(balanceState(flag).values, [8, 9]);
  assert.equal(balanceState(flag).balanced, true);
  assert.deepEqual(flag.dados, [2]);
  // Equilibrado: não rola mais d4
  assert.equal(rollBonusDie(flag, 1), null);
});

test('exemplo da regra: 5 e 7, d4 = 4 no 5 → 9 e 7, passou do outro lado', () => {
  let flag = assignBonusDie(rollBonusDie(flagOf([5, 7]), 4), 0);
  assert.deepEqual(balanceState(flag).values, [9, 7]);
  assert.equal(balanceState(flag).balanced, false);
  flag = assignBonusDie(rollBonusDie(flag, 2), 1);
  assert.deepEqual(balanceState(flag).values, [9, 9]);
  assert.equal(balanceState(flag).balanced, true);
});

test('d4 inválido ou índice inválido não vale', () => {
  assert.equal(rollBonusDie(flagOf([2, 8]), 5), null);
  assert.equal(rollBonusDie(flagOf([2, 8]), 0), null);
  assert.equal(assignBonusDie(flagOf([2, 8]), 0), null);
  assert.equal(assignBonusDie(rollBonusDie(flagOf([2, 8]), 3), 2), null);
});

test('Análise muda os d10 rolados; Prontidão rola um de novo, uma vez', () => {
  const flag = flagOf([3, 8]);
  const analysed = analyseBalance(flag, [5, 6], 'Ana gastou 2');
  assert.deepEqual(analysed.base, [5, 6]);
  assert.deepEqual(analysed.notas, ['Ana gastou 2']);
  assert.equal(analyseBalance(flag, [11, 6]), null);
  assert.equal(analyseBalance(rollBonusDie(flag, 2), [5, 6]), null);
  const rerolled = rerollBalance(flag, 0, 7, 'd10 de 3 para 7');
  assert.deepEqual([rerolled.base, rerolled.prontidao], [[7, 8], true]);
  assert.equal(rerollBalance(rerolled, 1, 2), null);
  // Dado que tirou 1 não pode ser repetido
  assert.equal(rerollBalance(flagOf([1, 5]), 0, 4), null);
  assert.deepEqual(balanceRerollCandidates(flagOf([1, 5])), [1]);
});

test('reserva do cartão contra o duplo clique', () => {
  const flag = flagOf([3, 8]);
  const reserved = reserveBalance(flag, 1000);
  assert.equal(reserved.estado, 'aplicando');
  assert.equal(reserveBalance(reserved, 1500), null);
  assert.equal(balanceOpen(reserved, 1000 + BALANCE_CLAIM_MS + 1), true);
  assert.equal(releaseBalance(reserved).estado, 'aberto');
  const done = finishBalance(reserved, 'registrado', 2);
  assert.deepEqual([done.estado, done.depois], ['registrado', 2]);
  assert.equal(reserveBalance(done, 99999999), null);
});

test('botões do cartão', () => {
  const falling = flagOf([3, 8]);
  let view = balanceView(falling, viewer());
  assert.deepEqual(
    [view.showRegister, view.showSpend, view.showFall, view.showAssign],
    [false, true, true, false],
  );
  assert.equal(balanceView(falling, viewer({ reserve: 0 })).showSpend, false);
  assert.equal(balanceView(falling, viewer({ canAct: false })).showFall, false);
  view = balanceView(rollBonusDie(falling, 4), viewer());
  assert.deepEqual([view.showAssign, view.showFall, view.assignPreview], [true, false, [7, 12]]);
  view = balanceView(flagOf([4, 4]), viewer({ rounds: 2 }));
  assert.deepEqual([view.showRegister, view.crosses], [true, true]);
  // Desafio encerrado: sem botões
  view = balanceView(falling, viewer({ active: false }));
  assert.deepEqual([view.fechado, view.showFall, view.showSpend], [true, false, false]);
  // Análise e Prontidão
  assert.equal(balanceView(falling, viewer({ canAnalyse: true })).showAnalyse, true);
  assert.equal(balanceView(falling, viewer({ canReroll: true })).showReroll, true);
  assert.equal(
    balanceView({ ...falling, prontidao: true }, viewer({ canReroll: true })).showReroll,
    false,
  );
});

test('desafio de equilíbrio: individual, 3 rodadas, reserva por participante', () => {
  let bridge = newChallenge('e', 'Tronco', 'equilibrio');
  assert.deepEqual([bridge.modo, bridge.pa], ['individual', 3]);
  assert.equal(updateChallengeField(bridge, 'modo', 'grupo').modo, 'individual');
  bridge = addParticipants(bridge, ['a']);
  // Sem gastar nenhum: reserva cheia (metade da Acrobacia)
  assert.equal(participantReserve(bridge, 'a', 6), 3);
  assert.equal(participantReserve(bridge, 'fora', 6), 0);
  bridge = spendBalanceDie(bridge, 'a', 6);
  assert.equal(participantReserve(bridge, 'a', 6), 2);
  assert.equal(bridge.participantes[0].reserva, 2);
  bridge = spendBalanceDie(spendBalanceDie(bridge, 'a', 6), 'a', 6);
  assert.equal(participantReserve(bridge, 'a', 6), 0);
  assert.equal(spendBalanceDie(bridge, 'a', 6), null);
  // O mestre ajusta (vazio = cheia de novo)
  assert.equal(typeReserve(bridge, 'a', '5').participantes[0].reserva, 5);
  assert.equal(typeReserve(bridge, 'a', '').participantes[0].reserva, undefined);
  assert.equal(typeReserve(bridge, 'a', 'x'), bridge);
  const view = challengeView(bridge, { isGM: true, actorInfo: () => ({ name: 'Ana' }) });
  assert.deepEqual([view.equilibrio, view.participantes[0].reserva], [true, 0]);
});

test('rodadas: equilibrar soma; atravessar e cair recarregam a reserva', () => {
  let bridge = spendBalanceDie(
    addParticipants(newChallenge('e', 'Tronco', 'equilibrio'), ['a']),
    'a',
    8,
  );
  let round = registerBalanceRound(bridge, 'a');
  assert.deepEqual([round.depois, round.atravessou], [1, false]);
  assert.equal(round.challenge.participantes[0].reserva, 3);
  bridge = registerBalanceRound(registerBalanceRound(round.challenge, 'a').challenge, 'a');
  assert.deepEqual([bridge.depois, bridge.atravessou], [3, true]);
  assert.equal(bridge.challenge.participantes[0].reserva, undefined);
  const fallen = applyBalanceFall(spendBalanceDie(round.challenge, 'a', 8), 'a');
  assert.deepEqual(
    [fallen.participantes[0].pontos, fallen.participantes[0].reserva],
    [0, undefined],
  );
  assert.equal(registerBalanceRound({ ...round.challenge, ativo: false }, 'a'), null);
  assert.equal(applyBalanceFall(round.challenge, 'fora'), null);
  assert.equal(
    sheetChallenges({ desafios: [round.challenge] }, 'a', { isGM: false })[0].equilibrio,
    true,
  );
});
