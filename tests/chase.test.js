import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  CHASE_COMBAT_TYPE,
  CHASE_COMBATANT_TYPE,
  initialChaseState,
  startState,
  endState,
  addableActors,
  chaseAccess,
  trackerAction,
  shouldAutoOpen,
} from '../scripts/rolls/chase.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('estados do ciclo de vida: preparação, em andamento e de volta à preparação', () => {
  assert.deepEqual(initialChaseState(), {
    ativa: false,
    rodadaAtual: 0,
    dt: 10,
    pontos: [],
    revelarProximo: false,
    revelarFinal: false,
  });
  assert.deepEqual(startState(), { ativa: true, rodadaAtual: 1 });
  assert.deepEqual(endState(), { ativa: false, rodadaAtual: 0 });
});

test('estados devolvem objetos novos (ninguém altera o de outro)', () => {
  assert.notEqual(initialChaseState(), initialChaseState());
});

test('addableActors tira quem já participa e ordena por nome', () => {
  const candidates = [
    { id: 'c', name: 'Ótavo' },
    { id: 'a', name: 'Beatriz' },
    { id: 'b', name: 'Ana' },
  ];
  assert.deepEqual(
    addableActors(candidates, ['a']).map((actor) => actor.id),
    ['b', 'c'],
  );
  assert.deepEqual(addableActors(candidates, ['a', 'b', 'c']), []);
  assert.equal(addableActors(candidates, []).length, 3);
});

test('addableActors não altera a lista recebida', () => {
  const candidates = [
    { id: 'b', name: 'Bia' },
    { id: 'a', name: 'Ana' },
  ];
  addableActors(candidates, []);
  assert.deepEqual(
    candidates.map((actor) => actor.id),
    ['b', 'a'],
  );
});

test('acesso do mestre', () => {
  assert.deepEqual(chaseAccess({ isGM: true, chase: null, isParticipant: false }), {
    canCreate: true,
    canManage: false,
    canOpen: false,
    showCard: false,
  });
  const prep = chaseAccess({ isGM: true, chase: { ativa: false }, isParticipant: false });
  assert.equal(prep.canCreate, false);
  assert.equal(prep.canManage, true);
  assert.equal(prep.canOpen, true);
  assert.equal(prep.showCard, false);
});

test('o mestre vê o cartão de um participante mesmo na preparação', () => {
  const access = chaseAccess({ isGM: true, chase: { ativa: false }, isParticipant: true });
  assert.equal(access.showCard, true);
});

test('o jogador só abre a perseguição em andamento e se participar', () => {
  const open = (ativa, isParticipant) =>
    chaseAccess({ isGM: false, chase: { ativa }, isParticipant }).canOpen;
  assert.equal(open(true, true), true);
  assert.equal(open(true, false), false);
  assert.equal(open(false, true), false);
  assert.equal(chaseAccess({ isGM: false, chase: null, isParticipant: true }).canOpen, false);
});

test('o jogador nunca cria nem administra', () => {
  const access = chaseAccess({ isGM: false, chase: null, isParticipant: true });
  assert.equal(access.canCreate, false);
  assert.equal(access.canManage, false);
  assert.equal(
    chaseAccess({ isGM: false, chase: { ativa: true }, isParticipant: true }).canManage,
    false,
  );
});

test('o cartão da ficha do jogador só aparece com a perseguição em andamento', () => {
  const card = (ativa) => chaseAccess({ isGM: false, chase: { ativa }, isParticipant: true });
  assert.equal(card(true).showCard, true);
  assert.equal(card(false).showCard, false);
  assert.equal(
    chaseAccess({ isGM: false, chase: { ativa: true }, isParticipant: false }).showCard,
    false,
  );
});

test('botão da aba de combate: criar, abrir ou nada', () => {
  assert.equal(
    trackerAction(chaseAccess({ isGM: true, chase: null, isParticipant: false })),
    'criar',
  );
  assert.equal(
    trackerAction(chaseAccess({ isGM: true, chase: { ativa: false }, isParticipant: false })),
    'abrir',
  );
  assert.equal(
    trackerAction(chaseAccess({ isGM: false, chase: { ativa: true }, isParticipant: true })),
    'abrir',
  );
  assert.equal(
    trackerAction(chaseAccess({ isGM: false, chase: { ativa: false }, isParticipant: true })),
    null,
  );
  assert.equal(
    trackerAction(chaseAccess({ isGM: false, chase: null, isParticipant: false })),
    null,
  );
});

test('abertura automática da janela', () => {
  const gmAuthor = { isGM: true, isAuthor: true, ownsParticipant: true };
  const gmOther = { isGM: true, isAuthor: false, ownsParticipant: true };
  const player = { isGM: false, isAuthor: false, ownsParticipant: true };
  const outsider = { isGM: false, isAuthor: false, ownsParticipant: false };

  assert.equal(shouldAutoOpen('created', gmAuthor), true);
  assert.equal(shouldAutoOpen('created', gmOther), false);
  assert.equal(shouldAutoOpen('created', player), false);

  assert.equal(shouldAutoOpen('started', gmAuthor), true);
  assert.equal(shouldAutoOpen('started', gmOther), false);
  assert.equal(shouldAutoOpen('started', player), true);
  assert.equal(shouldAutoOpen('started', outsider), false);

  assert.equal(shouldAutoOpen('joined', player), true);
  assert.equal(shouldAutoOpen('joined', outsider), false);
  assert.equal(shouldAutoOpen('joined', gmAuthor), false);

  assert.equal(shouldAutoOpen('desconhecido', player), false);
});

test('o system.json registra os subtipos de Combat e de Combatant', () => {
  const { documentTypes } = JSON.parse(read('system.json'));
  assert.ok(documentTypes.Combat?.[CHASE_COMBAT_TYPE]);
  assert.ok(documentTypes.Combatant?.[CHASE_COMBATANT_TYPE]);
});

test('os templates da perseguição existem', () => {
  for (const file of ['painel.hbs', 'adicionar.hbs']) {
    assert.ok(existsSync(new URL(`../templates/perseguicao/${file}`, import.meta.url)), file);
  }
  assert.ok(existsSync(new URL('../templates/actor/ficha-perseguicao.hbs', import.meta.url)));
});

// ---- 0.16.1: avançar ----
import {
  ADVANCE_DT,
  ADVANCE_SKILL,
  breathDice,
  participantStart,
  participantReset,
  hasActed,
  canAdvance,
  skillAllowed,
  breathLimit,
  effortDiceCount,
  advanceBlockReason,
  advanceWarning,
  advanceDtField,
  advanceGain,
  advanceSuccess,
  applyAdvanceCosts,
  advanceBarView,
  createAdvanceFlag,
  finishAdvanceFlag,
  isAdvanceClaimable,
  normalizeChaseDt,
  releaseAdvance,
  reserveAdvance,
  ADVANCE_CLAIM_TIMEOUT_MS,
  applyEffortLoss,
  createEffortFlag,
  finishEffortFlag,
  effortBarView,
  parseTypedValue,
  canEditChaseNumbers,
  TRUSTED_ROLE,
  adjustRound,
  breathBlockReason,
  recoverBreathPatch,
  BREATH_RECOVERY,
  MAX_BREATH_DICE,
  MAX_CHECKPOINTS,
  normalizeCheckpoints,
  addCheckpoint,
  removeCheckpoint,
  finalCheckpoint,
  nextCheckpoint,
  checkpointOfRound,
  checkpointsView,
  participantBadges,
  parsePenaltyValue,
  createPenaltyFlag,
  applyPenaltyTo,
  penaltyBarView,
  adjustField,
  isAdjustableField,
  nextRoundState,
  sanitizeParticipantPatch,
} from '../scripts/rolls/chase.js';

test('constantes do avançar', () => {
  assert.equal(ADVANCE_DT, 10);
  assert.equal(ADVANCE_SKILL, 'atletismo');
});

test('fôlego: metade das faces do Vigor, no máximo 6', () => {
  assert.deepEqual([4, 6, 8, 10, 12].map(breathDice), [2, 3, 4, 5, 6]);
  assert.equal(breathDice(20), 6);
  assert.equal(breathDice(undefined), 0);
});

test('participantStart e participantReset', () => {
  assert.deepEqual(participantStart(10), {
    pa: 0,
    folego: 5,
    esforcoExtra: 0,
    ultimaRodada: 0,
    periciasUsadas: [],
    carregadoPor: '',
  });
  assert.equal(participantReset().folego, 0);
  assert.notEqual(participantStart(6).periciasUsadas, participantStart(6).periciasUsadas);
});

test('uma ação por rodada', () => {
  const base = { ativa: true, rodadaAtual: 2 };
  assert.equal(canAdvance({ ...base, participant: { ultimaRodada: 1 } }), true);
  assert.equal(canAdvance({ ...base, participant: { ultimaRodada: 2 } }), false);
  assert.equal(
    canAdvance({ ativa: false, rodadaAtual: 0, participant: { ultimaRodada: 0 } }),
    false,
  );
  assert.equal(hasActed({ ultimaRodada: 0 }, 0), false);
  assert.equal(hasActed({ ultimaRodada: 3 }, 3), true);
});

test('outras perícias só uma vez; Atletismo sempre', () => {
  assert.equal(skillAllowed('atletismo', ['atletismo']), true);
  assert.equal(skillAllowed('acrobacia', []), true);
  assert.equal(skillAllowed('acrobacia', ['acrobacia']), false);
});

test('limite de fôlego por teste', () => {
  assert.deepEqual([0, 1, 2, 5].map(breathLimit), [0, 1, 2, 2]);
  assert.equal(breathLimit(-3), 0);
});

test('esforço extra custa um d4 a mais a cada uso', () => {
  assert.deepEqual([0, 1, 2, 3].map(effortDiceCount), [1, 2, 3, 4]);
});

test('sucesso do avanço usa a DT recebida (padrão 10); críticos decidem sozinhos', () => {
  const ok = (total, criticalSuccess = false, criticalFailure = false) =>
    advanceSuccess({ total, criticalSuccess, criticalFailure });
  assert.equal(ok(10), true);
  assert.equal(ok(9), false);
  assert.equal(
    advanceSuccess({ total: 12, criticalSuccess: false, criticalFailure: false }, 13),
    false,
  );
  assert.equal(
    advanceSuccess({ total: 12, criticalSuccess: false, criticalFailure: false }, 12),
    true,
  );
  assert.equal(ok(3, true), true);
  assert.equal(ok(20, false, true), false);
});

test('ganho de PA: rolagem alta ao passar (as duas no crítico), baixa ao falhar; a DT muda o resultado', () => {
  const base = { criticalSuccess: false, criticalFailure: false };
  assert.equal(advanceGain({ ...base, total: 12, highSum: 8, lowRoll: 3 }), 8);
  assert.equal(
    advanceGain({ ...base, criticalSuccess: true, total: 12, highSum: 14, lowRoll: 6 }),
    14,
  );
  assert.equal(advanceGain({ ...base, total: 7, highSum: 7, lowRoll: 2 }), 2);
  // o mesmo teste passa com DT 12 e falha com DT 13
  assert.equal(advanceGain({ ...base, total: 12, highSum: 8, lowRoll: 4 }, 12), 8);
  assert.equal(advanceGain({ ...base, total: 12, highSum: 8, lowRoll: 4 }, 13), 4);
  assert.equal(
    advanceGain({ ...base, criticalFailure: true, total: 12, highSum: 9, lowRoll: 1 }),
    1,
  );
});

test('bloqueios do avanço: não iniciada e já agiu (perícia usada só avisa)', () => {
  const participant = { ultimaRodada: 1, periciasUsadas: ['luta'] };
  const base = { ativa: true, rodadaAtual: 2, participant, skillKey: 'atletismo' };
  assert.equal(advanceBlockReason(base), null);
  assert.equal(advanceBlockReason({ ...base, ativa: false }), 'inativa');
  assert.equal(advanceBlockReason({ ...base, rodadaAtual: 0 }), 'inativa');
  assert.equal(
    advanceBlockReason({ ...base, participant: { ...participant, ultimaRodada: 2 } }),
    'agiu',
  );
  // perícia já usada não bloqueia mais: a decisão é do mestre
  assert.equal(advanceBlockReason({ ...base, skillKey: 'luta' }), null);
  assert.equal(advanceBlockReason({ ...base, skillKey: 'acrobacia' }), null);
});

test('lembrete de perícia já usada: só para quem não é Atletismo', () => {
  const participant = { periciasUsadas: ['luta', 'atletismo'] };
  assert.equal(advanceWarning({ participant, skillKey: 'luta' }), 'pericia');
  assert.equal(advanceWarning({ participant, skillKey: 'acrobacia' }), null);
  assert.equal(advanceWarning({ participant, skillKey: 'atletismo' }), null);
});

test('applyAdvanceCosts gasta fôlego e registra rodada, esforço e perícia (sem mexer nos PA)', () => {
  const participant = { pa: 5, folego: 3, esforcoExtra: 1, periciasUsadas: ['luta'] };
  const next = applyAdvanceCosts(participant, {
    breathSpent: 2,
    effort: true,
    skillKey: 'acrobacia',
    rodadaAtual: 2,
  });
  assert.deepEqual(next, {
    folego: 1,
    esforcoExtra: 2,
    ultimaRodada: 2,
    periciasUsadas: ['luta', 'acrobacia'],
  });
  assert.equal('pa' in next, false);
  assert.deepEqual(participant.periciasUsadas, ['luta']);
});

test('applyAdvanceCosts: Atletismo não entra na lista de perícias usadas; fôlego não fica negativo', () => {
  const next = applyAdvanceCosts(
    { folego: 1, esforcoExtra: 0, periciasUsadas: [] },
    { breathSpent: 2, effort: false, skillKey: 'atletismo', rodadaAtual: 1 },
  );
  assert.deepEqual(next.periciasUsadas, []);
  assert.equal(next.folego, 0);
  assert.equal(next.esforcoExtra, 0);
});

test('perda de PV do esforço extra nunca fica abaixo de 0 e avisa ao chegar em 0', () => {
  assert.deepEqual(applyEffortLoss(10, 3), { pv: 7, reachedZero: false });
  assert.deepEqual(applyEffortLoss(3, 3), { pv: 0, reachedZero: true });
  assert.deepEqual(applyEffortLoss(2, 9), { pv: 0, reachedZero: true });
  assert.deepEqual(applyEffortLoss(0, 0), { pv: 0, reachedZero: false });
});

test('ajuste manual: nunca abaixo de 0; fôlego limitado a 6', () => {
  assert.equal(adjustField('pa', 3, -1), 2);
  assert.equal(adjustField('pa', 0, -1), 0);
  assert.equal(adjustField('pa', 29, 1), 30);
  // fôlego não tem teto de 6 (a regra não fala em máximo): só o teto técnico de 99
  assert.equal(adjustField('folego', 6, 1), 7);
  assert.equal(adjustField('folego', 99, 1), 99);
  assert.equal(adjustField('folego', 0, -1), 0);
  assert.equal(isAdjustableField('pa'), true);
  assert.equal(isAdjustableField('esforcoExtra'), false);
});

test('próxima rodada', () => {
  assert.deepEqual(nextRoundState(1), { rodadaAtual: 2 });
});

test('o pedido de gravação por socket é limpo', () => {
  assert.deepEqual(
    sanitizeParticipantPatch({
      pa: 12,
      folego: -1,
      esforcoExtra: 1.5,
      ultimaRodada: 3,
      periciasUsadas: ['acrobacia', 'acrobacia', 'oficio:k3j9x', 'ha ck', 7, '<b>'],
      carregadoPor: 'x',
      system: { evil: true },
    }),
    { pa: 12, ultimaRodada: 3, periciasUsadas: ['acrobacia', 'oficio:k3j9x'] },
  );
  assert.deepEqual(sanitizeParticipantPatch(null), {});
  assert.deepEqual(sanitizeParticipantPatch({ pa: '9' }), {});
  assert.equal(
    sanitizeParticipantPatch({ periciasUsadas: Array.from({ length: 80 }, (_, i) => `k${i}`) })
      .periciasUsadas.length,
    40,
  );
});

test('marcar o avanço põe a DT 10 e guarda a anterior; desmarcar devolve', () => {
  const marked = advanceDtField({ on: true, current: 7, saved: null });
  assert.deepEqual(marked, { value: 10, saved: 7 });
  assert.deepEqual(advanceDtField({ on: false, current: 10, saved: marked.saved }), {
    value: 7,
    saved: null,
  });
});

test('marcar de novo não perde a DT guardada; desmarcar sem nada guardado mantém a DT', () => {
  assert.deepEqual(advanceDtField({ on: true, current: 10, saved: 7 }), { value: 10, saved: 7 });
  assert.deepEqual(advanceDtField({ on: false, current: 12, saved: null }), {
    value: 12,
    saved: null,
  });
});

test('a DT mostrada ao marcar o avanço é a da perseguição', () => {
  assert.deepEqual(advanceDtField({ on: true, current: 7, saved: null, dt: 13 }), {
    value: 13,
    saved: 7,
  });
  assert.deepEqual(advanceDtField({ on: false, current: 13, saved: 7, dt: 13 }), {
    value: 7,
    saved: null,
  });
});

test('DT da perseguição: inteiro de 1 a 40; o resto volta ao padrão', () => {
  assert.deepEqual([10, 12.9, '15', 1, 40].map(normalizeChaseDt), [10, 12, 15, 1, 40]);
  assert.deepEqual([0, -3, 99].map(normalizeChaseDt), [1, 1, 40]);
  assert.deepEqual([undefined, 'x', NaN, null, ''].map(normalizeChaseDt), [10, 10, 10, 10, 10]);
});

test('o registro do avanço começa pendente, com a DT já limpa', () => {
  assert.deepEqual(createAdvanceFlag({ combatantId: 'a', skillKey: 'luta', dt: 12 }), {
    combatantId: 'a',
    skillKey: 'luta',
    dt: 12,
    estado: 'pendente',
    ganho: null,
  });
  assert.equal(createAdvanceFlag({ combatantId: 'a', skillKey: 'luta', dt: 999 }).dt, 40);
});

test('o botão é de uso único: reservar, concluir e não reservar de novo', () => {
  const flag = createAdvanceFlag({ combatantId: 'a', skillKey: 'atletismo', dt: 10 });
  const reserved = reserveAdvance(flag, 1000);
  assert.equal(reserved.estado, 'aplicando');
  assert.equal(reserveAdvance(reserved, 1500), null); // duplo clique
  const done = finishAdvanceFlag(reserved, 9);
  assert.deepEqual([done.estado, done.ganho], ['aplicado', 9]);
  assert.equal(reserveAdvance(done, 99_999), null); // já usado, mesmo depois de muito tempo
  assert.equal(isAdvanceClaimable(done, 0), false);
});

test('reserva parada há mais de 30 s deixa de bloquear; soltar a reserva libera o botão', () => {
  const flag = createAdvanceFlag({ combatantId: 'a', skillKey: 'atletismo', dt: 10 });
  const reserved = reserveAdvance(flag, 1000);
  assert.equal(isAdvanceClaimable(reserved, 1000 + ADVANCE_CLAIM_TIMEOUT_MS), false);
  assert.equal(isAdvanceClaimable(reserved, 1001 + ADVANCE_CLAIM_TIMEOUT_MS), true);
  assert.equal(releaseAdvance(reserved).estado, 'pendente');
  assert.notEqual(reserveAdvance(releaseAdvance(reserved), 2000), null);
});

test('a barra do cartão mostra o valor atual e só dá o botão a quem pode', () => {
  const flag = createAdvanceFlag({ combatantId: 'a', skillKey: 'atletismo', dt: 10 });
  const result = {
    total: 12,
    highSum: 8,
    lowRoll: 3,
    criticalSuccess: false,
    criticalFailure: false,
  };
  const view = advanceBarView(flag, result, { canApply: true, now: 0 });
  assert.deepEqual([view.kind, view.pa, view.dt, view.showButton], ['passou', 8, 10, true]);
  assert.equal(advanceBarView(flag, result, { canApply: false, now: 0 }).showButton, false);

  // depois de a Análise mudar os dados, o mesmo cartão passa a valer outra coisa
  const failed = advanceBarView(
    flag,
    { ...result, total: 7, highSum: 4 },
    { canApply: true, now: 0 },
  );
  assert.deepEqual([failed.kind, failed.pa], ['falhou', 3]);
  const crit = advanceBarView(
    flag,
    { ...result, criticalSuccess: true, highSum: 14 },
    { canApply: true, now: 0 },
  );
  assert.deepEqual([crit.kind, crit.pa], ['crit', 14]);
  const fumble = advanceBarView(
    flag,
    { ...result, criticalFailure: true, lowRoll: 1 },
    { canApply: true, now: 0 },
  );
  assert.deepEqual([fumble.kind, fumble.pa], ['falhaCritica', 1]);
});

test('a barra do cartão depois do clique mostra quanto foi adicionado e some o botão', () => {
  const flag = finishAdvanceFlag(
    reserveAdvance(createAdvanceFlag({ combatantId: 'a', skillKey: 'atletismo', dt: 10 }), 0),
    9,
  );
  const view = advanceBarView(
    flag,
    { total: 12, highSum: 8, lowRoll: 3, criticalSuccess: false, criticalFailure: false },
    { canApply: true, now: 5 },
  );
  assert.deepEqual(
    [view.applied, view.appliedPa, view.showButton, view.busy],
    [true, 9, false, false],
  );
  const claiming = reserveAdvance(
    createAdvanceFlag({ combatantId: 'a', skillKey: 'atletismo', dt: 10 }),
    100,
  );
  const busy = advanceBarView(
    claiming,
    { total: 12, highSum: 8, lowRoll: 3, criticalSuccess: false, criticalFailure: false },
    { canApply: true, now: 200 },
  );
  assert.deepEqual([busy.busy, busy.showButton], [true, false]);
});

test('o valor do botão acompanha a Análise: trocar os dados do cartão muda os PA', async () => {
  const { resolveWithValues } = await import('../scripts/rolls/abilities.js');
  const plan = { attrDie: 8, skillDie: 6, dt: 7, extraDice: [], stepMods: [], modifier: 0 };
  const flag = createAdvanceFlag({ combatantId: 'a', skillKey: 'atletismo', dt: 10 });
  const viewer = { canApply: true, now: 0 };

  // rolou 3 e 4: total 7, não chega à DT 10 do avanço, soma a rolagem baixa
  const rolled = advanceBarView(flag, resolveWithValues(plan, [3, 4]), viewer);
  assert.deepEqual([rolled.kind, rolled.pa], ['falhou', 3]);

  // a Análise troca os dados para 6 e 6: crítico, soma as duas maiores
  const analysed = advanceBarView(flag, resolveWithValues(plan, [6, 6]), viewer);
  assert.deepEqual([analysed.kind, analysed.pa], ['crit', 12]);

  // a Análise sem crítico: 5 e 6 (total 11) passa a DT 10 e soma a rolagem alta
  const passed = advanceBarView(flag, resolveWithValues(plan, [5, 6]), viewer);
  assert.deepEqual([passed.kind, passed.pa], ['passou', 6]);

  // com a DT do avanço mudada para 12, o mesmo 5 e 6 deixa de passar
  const harder = createAdvanceFlag({ combatantId: 'a', skillKey: 'atletismo', dt: 12 });
  const failed = advanceBarView(harder, resolveWithValues(plan, [5, 6]), viewer);
  assert.deepEqual([failed.kind, failed.pa], ['falhou', 5]);
});

// ---- 0.16.6: esforço extra pelo botão, campos digitáveis ----
test('registro do esforço extra nasce pendente, com a perda rolada', () => {
  const flag = createEffortFlag({ actorUuid: 'Actor.abc', loss: 5.9, dice: 2 });
  assert.deepEqual(flag, {
    actorUuid: 'Actor.abc',
    perda: 5,
    dados: 2,
    estado: 'pendente',
    aplicado: null,
    zerou: false,
  });
  assert.equal(createEffortFlag({ actorUuid: 'x', loss: -3, dice: 0 }).perda, 0);
});

test('barra do esforço extra: botão de uso único, reserva e conclusão', () => {
  const flag = createEffortFlag({ actorUuid: 'Actor.abc', loss: 4, dice: 1 });
  const viewer = { canApply: true, now: 1000 };
  const pending = effortBarView(flag, viewer);
  assert.deepEqual(
    [pending.loss, pending.applied, pending.busy, pending.showButton],
    [4, false, false, true],
  );
  assert.equal(effortBarView(flag, { ...viewer, canApply: false }).showButton, false);

  const reserved = reserveAdvance(flag, 1000);
  assert.equal(reserveAdvance(reserved, 1500), null);
  const busy = effortBarView(reserved, viewer);
  assert.deepEqual([busy.busy, busy.showButton], [true, false]);
  // reserva parada há tempo demais libera o botão de novo
  const stale = effortBarView(reserved, { ...viewer, now: 1000 + ADVANCE_CLAIM_TIMEOUT_MS + 1 });
  assert.deepEqual([stale.busy, stale.showButton], [false, true]);

  const done = finishEffortFlag(reserved, { applied: 3, reachedZero: true });
  const view = effortBarView(done, viewer);
  assert.deepEqual(
    [view.applied, view.appliedLoss, view.reachedZero, view.showButton],
    [true, 3, true, false],
  );
  assert.equal(reserveAdvance(done, 2000), null);
});

test('o PV do esforço extra usa o PV de agora e nunca fica abaixo de 0', () => {
  assert.deepEqual(applyEffortLoss(12, 4), { pv: 8, reachedZero: false });
  assert.deepEqual(applyEffortLoss(3, 4), { pv: 0, reachedZero: true });
});

test('valor digitado: inteiro dentro dos limites; vazio e texto não valem', () => {
  assert.deepEqual(parseTypedValue('pa', '17'), { valid: true, value: 17 });
  assert.deepEqual(parseTypedValue('pa', ' 4,7 '), { valid: true, value: 4 });
  assert.deepEqual(parseTypedValue('pa', -3), { valid: true, value: 0 });
  assert.deepEqual(parseTypedValue('pa', '99999'), { valid: true, value: 10000 });
  assert.deepEqual(parseTypedValue('folego', '9'), { valid: true, value: 9 });
  assert.deepEqual(parseTypedValue('folego', '500'), { valid: true, value: 99 });
  assert.deepEqual(parseTypedValue('rodada', '12'), { valid: true, value: 12 });
  assert.deepEqual(parseTypedValue('rodada', '0'), { valid: true, value: 1 });
  assert.deepEqual(parseTypedValue('rodada', '250'), { valid: true, value: 99 });
  assert.equal(parseTypedValue('rodada', '').valid, false);
  assert.deepEqual(parseTypedValue('folego', '0'), { valid: true, value: 0 });
  assert.deepEqual(parseTypedValue('dt', '99'), { valid: true, value: 40 });
  assert.deepEqual(parseTypedValue('dt', '0'), { valid: true, value: 1 });
  for (const bad of ['', '   ', 'abc', null, undefined, 'Infinity']) {
    assert.equal(parseTypedValue('pa', bad).valid, false);
  }
  assert.equal(parseTypedValue('esforcoExtra', '3').valid, false);
});

test('os limites digitados são os mesmos dos botões −/+', () => {
  for (const field of ['pa', 'folego']) {
    assert.equal(parseTypedValue(field, '1000000').value, adjustField(field, 1_000_000, 0));
  }
  assert.equal(parseTypedValue('folego', '100').value, adjustField('folego', 99, 1));
  assert.equal(parseTypedValue('rodada', '0').value, adjustRound(1, -1));
});

test('quem edita PA e fôlego: mestre sempre; confiável só o próprio; jogador comum não', () => {
  assert.equal(TRUSTED_ROLE, 2);
  assert.equal(canEditChaseNumbers({ isGM: true, role: 4, isOwner: false }), true);
  assert.equal(canEditChaseNumbers({ isGM: false, role: 2, isOwner: true }), true);
  assert.equal(canEditChaseNumbers({ isGM: false, role: 2, isOwner: false }), false);
  assert.equal(canEditChaseNumbers({ isGM: false, role: 1, isOwner: true }), false);
  assert.equal(canEditChaseNumbers({ isGM: false, role: 0, isOwner: true }), false);
});

// ---- 0.16.7: pontos de checagem e penalidade ----
const pts = [
  { rodada: 2, pa: 10 },
  { rodada: 4, pa: 18 },
  { rodada: 5, pa: 25 },
];

test('lista de pontos: ordena, um por rodada, descarta o inválido', () => {
  const messy = [
    { rodada: 5, pa: 25 },
    { rodada: 2, pa: 10 },
    { rodada: 2, pa: 12 },
    { rodada: 0, pa: 3 },
    { rodada: 3, pa: -1 },
    { rodada: 4.5, pa: 3 },
    { rodada: 100, pa: 3 },
    null,
  ];
  assert.deepEqual(normalizeCheckpoints(messy), [
    { rodada: 2, pa: 12 },
    { rodada: 5, pa: 25 },
  ]);
  assert.deepEqual(normalizeCheckpoints(undefined), []);
  assert.equal(
    normalizeCheckpoints(Array.from({ length: 50 }, (_, i) => ({ rodada: i + 1, pa: 1 }))).length,
    MAX_CHECKPOINTS,
  );
});

test('acrescentar ponto: troca a rodada repetida; texto e vazio não valem', () => {
  const added = addCheckpoint(pts, '6', '30');
  assert.equal(added.valid, true);
  assert.deepEqual(added.list.at(-1), { rodada: 6, pa: 30 });
  const replaced = addCheckpoint(pts, 4, 20);
  assert.deepEqual(replaced.list, [
    { rodada: 2, pa: 10 },
    { rodada: 4, pa: 20 },
    { rodada: 5, pa: 25 },
  ]);
  for (const [round, pa] of [
    ['', '5'],
    ['3', ''],
    ['x', '5'],
    [3, -2],
    [0, 4],
    [3, 1.5],
  ]) {
    const result = addCheckpoint(pts, round, pa);
    assert.equal(result.valid, false);
    assert.deepEqual(result.list, pts);
  }
  // lista cheia: uma rodada nova não cabe, mas trocar uma existente cabe
  const full = Array.from({ length: MAX_CHECKPOINTS }, (_, i) => ({ rodada: i + 1, pa: i }));
  assert.equal(addCheckpoint(full, 99, 1).valid, false);
  assert.equal(addCheckpoint(full, 3, 77).valid, true);
});

test('remover ponto', () => {
  assert.deepEqual(removeCheckpoint(pts, 4), [
    { rodada: 2, pa: 10 },
    { rodada: 5, pa: 25 },
  ]);
  assert.deepEqual(removeCheckpoint(pts, 9), pts);
});

test('o PA final é o ponto da maior rodada e muda se um ponto mais à frente entra', () => {
  assert.deepEqual(finalCheckpoint(pts), { rodada: 5, pa: 25 });
  assert.equal(finalCheckpoint([]), null);
  const later = addCheckpoint(pts, 8, 40).list;
  assert.deepEqual(finalCheckpoint(later), { rodada: 8, pa: 40 });
});

test('próximo alvo e checagem da rodada', () => {
  assert.deepEqual(nextCheckpoint(pts, 1), { rodada: 2, pa: 10 });
  assert.deepEqual(nextCheckpoint(pts, 2), { rodada: 2, pa: 10 });
  assert.deepEqual(nextCheckpoint(pts, 3), { rodada: 4, pa: 18 });
  assert.equal(nextCheckpoint(pts, 6), null);
  assert.deepEqual(nextCheckpoint(pts, 0), { rodada: 2, pa: 10 });
  assert.deepEqual(checkpointOfRound(pts, 4), { rodada: 4, pa: 18 });
  assert.equal(checkpointOfRound(pts, 3), null);
});

test('o jogador só vê o que o mestre revelou e nunca a lista', () => {
  const base = { pontos: pts, rodadaAtual: 3 };
  const gm = checkpointsView({ ...base, isGM: true, revelarProximo: false, revelarFinal: false });
  assert.deepEqual([gm.next.pa, gm.final.pa, gm.list.length], [18, 25, 3]);
  const hidden = checkpointsView({
    ...base,
    isGM: false,
    revelarProximo: false,
    revelarFinal: false,
  });
  assert.deepEqual(hidden, { next: null, final: null, list: null });
  const onlyNext = checkpointsView({
    ...base,
    isGM: false,
    revelarProximo: true,
    revelarFinal: false,
  });
  assert.deepEqual([onlyNext.next.pa, onlyNext.final, onlyNext.list], [18, null, null]);
  const onlyFinal = checkpointsView({
    ...base,
    isGM: false,
    revelarProximo: false,
    revelarFinal: true,
  });
  assert.deepEqual([onlyFinal.next, onlyFinal.final.pa, onlyFinal.list], [null, 25, null]);
});

test('selos: «abaixo» só para o mestre e só em rodada com checagem; «chegou» com PA final', () => {
  const base = { pontos: pts, rodadaAtual: 4, revelarFinal: false };
  assert.equal(participantBadges({ ...base, pa: 17, isGM: true }).abaixo, true);
  assert.equal(participantBadges({ ...base, pa: 18, isGM: true }).abaixo, false);
  assert.equal(participantBadges({ ...base, pa: 5, isGM: false }).abaixo, false);
  // rodada sem checagem: ninguém fica «abaixo»
  assert.equal(participantBadges({ ...base, rodadaAtual: 3, pa: 0, isGM: true }).abaixo, false);
  assert.equal(participantBadges({ ...base, pa: 25, isGM: true }).chegou, true);
  assert.equal(participantBadges({ ...base, pa: 25, isGM: false }).chegou, false);
  assert.equal(
    participantBadges({ ...base, pa: 25, isGM: false, revelarFinal: true }).chegou,
    true,
  );
  assert.deepEqual(
    participantBadges({ pontos: [], rodadaAtual: 2, pa: 9, isGM: true, revelarFinal: true }),
    {
      abaixo: false,
      chegou: false,
    },
  );
});

test('valor da penalidade: número de 1 a 999 ou dados NdM com bônus opcional', () => {
  assert.deepEqual(parsePenaltyValue(' 7 '), { valid: true, kind: 'fixed', fixed: 7 });
  assert.deepEqual(parsePenaltyValue('2d6'), { valid: true, kind: 'dice', formula: '2d6' });
  assert.deepEqual(parsePenaltyValue('1D8 + 2'), { valid: true, kind: 'dice', formula: '1d8+2' });
  assert.deepEqual(parsePenaltyValue('3d4-1'), { valid: true, kind: 'dice', formula: '3d4-1' });
  for (const bad of [
    '',
    '0',
    '1000',
    '-3',
    'd6',
    '0d6',
    '21d6',
    '2d1',
    '2d101',
    '2d6*5',
    'abc',
    null,
  ]) {
    assert.equal(parsePenaltyValue(bad).valid, false, String(bad));
  }
});

test('penalidade: uso único por participante, PV de agora, nunca abaixo de 0', () => {
  const flag = createPenaltyFlag({ tipo: 'pd', valor: 6, formula: '2d6' });
  assert.deepEqual(flag, { tipo: 'pd', valor: 6, formula: '2d6', aplicados: [] });
  assert.equal(createPenaltyFlag({ tipo: 'xx', valor: 3 }).tipo, 'pv');

  const first = applyPenaltyTo(flag, 'a', 10);
  assert.deepEqual([first.next, first.applied, first.reachedZero], [4, 6, false]);
  assert.deepEqual(first.flag.aplicados, [{ id: 'a', perda: 6, zerou: false }]);
  // o mesmo participante não aplica duas vezes; outro participante aplica
  assert.equal(applyPenaltyTo(first.flag, 'a', 10), null);
  const second = applyPenaltyTo(first.flag, 'b', 4);
  assert.deepEqual([second.next, second.applied, second.reachedZero], [0, 4, true]);
  assert.equal(second.flag.aplicados.length, 2);
  // a marca antiga não muda (o registro é imutável)
  assert.equal(flag.aplicados.length, 0);
});

test('barra da penalidade: uma linha por participante da pessoa', () => {
  const flag = createPenaltyFlag({ tipo: 'pv', valor: 5 });
  const done = applyPenaltyTo(flag, 'a', 3).flag;
  const view = penaltyBarView(done, [
    { combatantId: 'a', name: 'A' },
    { combatantId: 'b', name: 'B' },
  ]);
  assert.equal(view.multiple, true);
  assert.deepEqual(
    view.rows.map((row) => [
      row.combatantId,
      row.applied,
      row.showButton,
      row.appliedLoss,
      row.reachedZero,
    ]),
    [
      ['a', true, false, 3, true],
      ['b', false, true, 0, false],
    ],
  );
  assert.equal(penaltyBarView(flag, [{ combatantId: 'a', name: 'A' }]).multiple, false);
  assert.deepEqual(penaltyBarView(flag, []).rows, []);
});

// ---- 0.16.8: rodada na mão e recuperar fôlego ----
test('rodada na mão: de 1 a 99, não mexe em mais nada', () => {
  assert.equal(adjustRound(3, 1), 4);
  assert.equal(adjustRound(3, -1), 2);
  assert.equal(adjustRound(1, -1), 1);
  assert.equal(adjustRound(99, 1), 99);
  assert.equal(adjustRound('x', 1), 1);
});

test('recuperar fôlego: soma 2 dados sem teto de 6 e marca «já agiu» na rodada', () => {
  assert.equal(BREATH_RECOVERY, 2);
  assert.deepEqual(recoverBreathPatch({ participant: { folego: 1 }, rodadaAtual: 3 }), {
    folego: 3,
    ultimaRodada: 3,
  });
  // passa de 6: a regra não fala em fôlego máximo
  assert.deepEqual(recoverBreathPatch({ participant: { folego: 6 }, rodadaAtual: 2 }), {
    folego: 8,
    ultimaRodada: 2,
  });
  assert.equal(
    recoverBreathPatch({ participant: { folego: 98 }, rodadaAtual: 2 }).folego,
    MAX_BREATH_DICE,
  );
  assert.equal(recoverBreathPatch({ participant: { folego: -4 }, rodadaAtual: 2 }).folego, 2);
});

test('recuperar fôlego é bloqueado como o avanço: fora da perseguição e depois de agir', () => {
  const base = { ativa: true, rodadaAtual: 2, participant: { ultimaRodada: 1 } };
  assert.equal(breathBlockReason(base), null);
  assert.equal(breathBlockReason({ ...base, ativa: false }), 'inativa');
  assert.equal(breathBlockReason({ ...base, participant: { ultimaRodada: 2 } }), 'agiu');
  // depois de recuperar o fôlego, o participante fica «já agiu» e não pode avançar nem recuperar de novo
  const patch = recoverBreathPatch({ participant: { folego: 1 }, rodadaAtual: 2 });
  const after = { ...base, participant: { ultimaRodada: patch.ultimaRodada } };
  assert.equal(breathBlockReason(after), 'agiu');
  assert.equal(advanceBlockReason(after), 'agiu');
});
