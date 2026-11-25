// Teste estendido pela janela pré-teste: opções, registro e resultado.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addParticipants,
  applyChallengeTest,
  challengeBarView,
  challengeTestChoices,
  challengeTestGain,
  challengeTestSuccess,
  createChallengeTestFlag,
  newChallenge,
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

const flag = (overrides = {}) => ({
  dt: 7,
  somaPassar: 'ra',
  somaFalhar: 'nada',
  estado: 'pendente',
  ganho: null,
  actorId: 'a',
  ...overrides,
});

test('opções da janela: só testes estendidos ativos de que o personagem participa', () => {
  const data = {
    desafios: [
      { ...addParticipants(newChallenge('d1', 'Portão'), ['a']), dt: 9 },
      { ...addParticipants(newChallenge('d2', 'Muro'), ['a']), ativo: false },
      addParticipants(newChallenge('d3', 'Rio'), ['b']),
    ],
  };
  assert.deepEqual(challengeTestChoices(data, 'a'), [
    { id: 'd1', nome: 'Portão', tipo: 'estendido', dt: 9, dtRapida: 8, dtCautelosa: 6, passos: 0 },
  ]);
  assert.deepEqual(challengeTestChoices(data, ''), []);
});

test('registro do teste guarda a DT e as regras de soma da hora da rolagem', () => {
  const challenge = { ...newChallenge('d1', 'Portão'), somaPassar: 'rb', somaFalhar: 'ra' };
  assert.deepEqual(createChallengeTestFlag({ challenge, actorId: 'a', dt: 10 }), {
    desafioId: 'd1',
    actorId: 'a',
    tipo: 'estendido',
    abordagem: null,
    dt: 10,
    somaPassar: 'rb',
    somaFalhar: 'ra',
    falha: null,
    danoRolagem: null,
    zeraAoFalhar: false,
    queda: false,
    passos: 0,
    estado: 'pendente',
    ganho: null,
    dano: null,
    zerou: false,
    custo: null,
  });
  // DT inválida: a do desafio
  assert.equal(createChallengeTestFlag({ challenge, actorId: 'a', dt: 'x' }).dt, 7);
});

test('sucesso: crítico passa sempre, falha crítica falha sempre', () => {
  assert.equal(challengeTestSuccess(result({ total: 7 }), 7), true);
  assert.equal(challengeTestSuccess(result({ total: 6 }), 7), false);
  assert.equal(challengeTestSuccess(result({ total: 2, criticalSuccess: true }), 20), true);
  assert.equal(challengeTestSuccess(result({ total: 30, criticalFailure: true }), 7), false);
});

test('pontos ao passar: RA ou RB', () => {
  assert.equal(challengeTestGain(result(), flag()), 6);
  assert.equal(challengeTestGain(result(), flag({ somaPassar: 'rb' })), 3);
});

test('pontos ao falhar: nada, RB ou RA', () => {
  const failed = result({ total: 4, highRoll: 3, lowRoll: 1, highSum: 3 });
  assert.equal(challengeTestGain(failed, flag()), 0);
  assert.equal(challengeTestGain(failed, flag({ somaFalhar: 'rb' })), 1);
  assert.equal(challengeTestGain(failed, flag({ somaFalhar: 'ra' })), 3);
});

test('crítico soma as duas mais altas, mesmo com «ao passar: RB»', () => {
  const crit = result({ total: 12, highRoll: 6, lowRoll: 6, highSum: 12, criticalSuccess: true });
  assert.equal(challengeTestGain(crit, flag()), 12);
  assert.equal(challengeTestGain(crit, flag({ somaPassar: 'rb' })), 12);
});

test('falha crítica segue o «ao falhar»', () => {
  const disaster = result({ total: 2, highRoll: 1, lowRoll: 1, highSum: 1, criticalFailure: true });
  assert.equal(challengeTestGain(disaster, flag()), 0);
  assert.equal(challengeTestGain(disaster, flag({ somaFalhar: 'rb' })), 1);
  assert.equal(challengeTestGain(disaster, flag({ somaFalhar: 'ra' })), 1);
});

test('somar ao desafio: individual, grupo, encerrado e quem saiu', () => {
  const individual = addParticipants(newChallenge('d1'), ['a', 'b']);
  assert.equal(applyChallengeTest(individual, 'a', 5).participantes[0].pontos, 5);
  const grupo = { ...individual, modo: 'grupo', total: 2 };
  assert.equal(applyChallengeTest(grupo, 'b', 5).total, 7);
  assert.equal(applyChallengeTest({ ...individual, ativo: false }, 'a', 5), null);
  assert.equal(applyChallengeTest(individual, 'fora', 5), null);
  assert.equal(applyChallengeTest(null, 'a', 5), null);
});

test('barra do cartão: tipo, valor, botão e desafio fechado', () => {
  const challenge = addParticipants(newChallenge('d1', 'Portão'), ['a']);
  const viewer = { canApply: true, claimable: true, busy: false, challenge };
  let view = challengeBarView(flag(), result(), viewer);
  assert.equal(view.kind, 'passou');
  assert.equal(view.pontos, 6);
  assert.equal(view.nome, 'Portão');
  assert.equal(view.showButton, true);
  assert.equal(view.fechado, false);

  assert.equal(challengeBarView(flag(), result({ total: 3 }), viewer).kind, 'falhou');
  assert.equal(
    challengeBarView(flag(), result({ criticalSuccess: true, highSum: 12 }), viewer).kind,
    'crit',
  );
  assert.equal(
    challengeBarView(flag(), result({ criticalFailure: true }), viewer).kind,
    'falhaCritica',
  );
  assert.equal(
    challengeBarView(flag(), result(), { ...viewer, canApply: false }).showButton,
    false,
  );

  view = challengeBarView(flag(), result(), { ...viewer, challenge: null });
  assert.equal(view.fechado, true);
  assert.equal(view.showButton, false);
  view = challengeBarView(flag({ actorId: 'b' }), result(), viewer);
  assert.equal(view.fechado, true);

  // Já somado: mostra o valor somado, não fica «fechado» nem com botão
  view = challengeBarView(flag({ estado: 'aplicado', ganho: 4 }), result(), {
    ...viewer,
    claimable: false,
    challenge: null,
  });
  assert.equal(view.applied, true);
  assert.equal(view.appliedPontos, 4);
  assert.equal(view.fechado, false);
  assert.equal(view.showButton, false);
});

const model = (overrides = {}) =>
  buildRollModel({
    skillKey: 'atletismo',
    attrDie: 8,
    skillDie: 6,
    has: {},
    resources: { impeto: 0, pd: 10 },
    challenges: [
      { id: 'd1', nome: 'Portão', dt: 9 },
      { id: 'd2', nome: 'Muro', dt: 7 },
    ],
    ...overrides,
  });

test('janela pré-teste: sem desafios, sem opção', () => {
  assert.equal(model({ challenges: [] }).estendido, null);
  assert.equal(model({ challenges: undefined }).estendido, null);
  assert.equal(model().estendido.desafios.length, 2);
});

test('janela pré-teste: marcar escolhe o desafio e usa a DT do campo', () => {
  const m = model();
  const selection = { ...emptySelection(7), dt: 9, estendido: { on: true, id: 'd2' } };
  const evaluated = evaluateSelection(m, selection);
  assert.deepEqual(evaluated.estendido, { on: true, id: 'd2', dt: 9, abordagem: null, passos: 0 });
  assert.deepEqual(selectionToOptions(m, selection).estendido, {
    on: true,
    id: 'd2',
    dt: 9,
    abordagem: null,
    passos: 0,
  });
  // Id desconhecido: o primeiro da lista
  assert.equal(
    evaluateSelection(m, { ...selection, estendido: { on: true, id: 'x' } }).estendido.id,
    'd1',
  );
  // Desmarcado: nada nas opções
  assert.equal(selectionToOptions(m, emptySelection(7)).estendido, undefined);
});

test('janela pré-teste: sem campo de DT, vale a DT do desafio', () => {
  const m = model({ showDt: false });
  const evaluated = evaluateSelection(m, {
    ...emptySelection(7),
    estendido: { on: true, id: 'd1' },
  });
  assert.equal(evaluated.estendido.dt, 9);
});

test('janela pré-teste: teste estendido desliga avanço, esconderijo e esconder-se', () => {
  const m = model({
    chase: { blocked: null, folego: 3, effortDice: 1, dt: 10 },
    stealth: { teste: true, esconder: { dt: 7 }, distrair: null },
  });
  const on = { on: true, id: 'd1' };
  const withAdvance = evaluateSelection(m, {
    ...emptySelection(7),
    avanco: { on: true, breath: 1, effort: false },
    estendido: on,
  });
  assert.equal(withAdvance.avanco.on, false);
  assert.equal(withAdvance.estendido.on, true);
  const withHide = evaluateSelection(m, {
    ...emptySelection(7),
    esconderijo: { on: true },
    estendido: on,
  });
  assert.equal(withHide.esconderijo.on, false);
  assert.equal(withHide.dt, 7);
  const withAction = evaluateSelection(m, {
    ...emptySelection(7),
    furtiva: { acao: 'esconder', destino: '' },
    estendido: on,
  });
  assert.equal(withAction.furtiva.acao, '');
  // Sem o teste estendido, o avanço continua valendo
  assert.equal(
    evaluateSelection(m, { ...emptySelection(7), avanco: { on: true, breath: 0, effort: false } })
      .avanco.on,
    true,
  );
});
