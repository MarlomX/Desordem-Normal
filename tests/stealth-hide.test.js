import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRollModel,
  emptySelection,
  evaluateSelection,
  selectionToOptions,
} from '../scripts/rolls/roll-dialog.js';
import {
  HIDE_TEST_KEEP,
  HIDE_CLAIM_TIMEOUT_MS,
  canOfferHideTest,
  createHideFlag,
  critExtraSides,
  defaultHideKeep,
  finishHide,
  hideBarView,
  hideDiceFromTest,
  hideTestPatch,
  isHideClaimable,
  normalizeHideKeep,
  releaseHide,
  reserveHide,
} from '../scripts/rolls/stealth.js';
import { legacyDice } from './helpers.js';

// ---------------------------------------------------------------------------------------------
// Janela pré-teste
// ---------------------------------------------------------------------------------------------

const baseInput = {
  skillKey: 'furtividade',
  attrDie: 8,
  skillDie: 6,
  has: {},
  resources: { impeto: 0, pd: 5 },
  fearDie: 6,
  dt: 7,
};
const withHide = (on, extra = {}) => ({ ...emptySelection(7), esconderijo: { on }, ...extra });

test('sem cena de furtividade, a opção de esconderijo não existe', () => {
  const model = buildRollModel(baseInput);
  assert.equal(model.esconderijo, null);
  const evaluated = evaluateSelection(model, withHide(true));
  assert.equal(evaluated.esconderijo.on, false);
  assert.equal(evaluated.dt, 7);
  assert.equal('esconderijo' in selectionToOptions(model, withHide(true)), false);
});

test('a escolha vazia começa com o esconderijo desmarcado', () => {
  assert.deepEqual(emptySelection(7).esconderijo, { on: false });
});

test('teste de esconderijo: sem DT e sem pavor (nem custo de controlar ou abraçar)', () => {
  const model = buildRollModel({ ...baseInput, stealth: { teste: true } });
  assert.deepEqual(model.esconderijo, {});
  const evaluated = evaluateSelection(
    model,
    withHide(true, { controlFear: true, embraceFear: true }),
  );
  assert.equal(evaluated.esconderijo.on, true);
  assert.equal(evaluated.dt, null);
  assert.equal(evaluated.fear, null);
  assert.equal(evaluated.pdCost, 0);
  // Sem pavor abraçado, o espaço continua livre para os bônus
  assert.deepEqual(evaluated.rolledSides, [8, 6]);

  const options = selectionToOptions(model, withHide(true, { controlFear: true }));
  assert.equal(options.esconderijo, true);
  assert.equal('dt' in options, false);
  assert.equal(options.controlFear, false);
  assert.equal(options.embraceFear, false);
});

test('desmarcado, o pavor e a DT continuam valendo', () => {
  const model = buildRollModel({ ...baseInput, stealth: { teste: true } });
  const evaluated = evaluateSelection(model, withHide(false));
  assert.equal(evaluated.esconderijo.on, false);
  assert.equal(evaluated.dt, 7);
  assert.equal(evaluated.fear.die, 6);
});

test('o esconderijo não vale ao mesmo tempo como avanço da perseguição', () => {
  const model = buildRollModel({
    ...baseInput,
    stealth: { teste: true },
    chase: { blocked: null, folego: 3, effortDice: 1, dt: 10 },
  });
  const evaluated = evaluateSelection(
    model,
    withHide(true, { avanco: { on: true, breath: 2, effort: true } }),
  );
  assert.equal(evaluated.avanco.on, false);
  assert.equal(evaluated.esconderijo.on, true);
  assert.deepEqual(evaluated.rolledSides, [8, 6]);
});

test('bônus manuais e Sorrateiro continuam entrando no teste de esconderijo', () => {
  const model = buildRollModel({
    ...baseInput,
    stealth: { teste: true },
    diceOptions: legacyDice('furtividade', { impeto: false }),
  });
  const evaluated = evaluateSelection(
    model,
    withHide(true, { active: ['sorrateiro'], bonus: [4] }),
  );
  assert.deepEqual(evaluated.rolledSides, [8, 6, 4, 8]);
  assert.equal(evaluated.pdCost, 3);
});

// ---------------------------------------------------------------------------------------------
// Oferta, escolha dos dados e crítico
// ---------------------------------------------------------------------------------------------

test('a opção só aparece para quem participa, controla o personagem e não se escondeu', () => {
  const ok = { ativa: true, isParticipant: true, isOwner: true, escondeu: false };
  assert.equal(canOfferHideTest(ok), true);
  assert.equal(canOfferHideTest({ ...ok, ativa: false }), false);
  assert.equal(canOfferHideTest({ ...ok, isParticipant: false }), false);
  assert.equal(canOfferHideTest({ ...ok, isOwner: false }), false);
  // Já escondido (ou encontrado): a vaga é do «esconder-se», numa versão futura
  assert.equal(canOfferHideTest({ ...ok, escondeu: true }), false);
});

test('até 3 dados, ficam todos; com 4, os 3 maiores por padrão', () => {
  assert.equal(HIDE_TEST_KEEP, 3);
  assert.deepEqual(defaultHideKeep([3, 5]), [0, 1]);
  assert.deepEqual(defaultHideKeep([3, 5, 1]), [0, 1, 2]);
  assert.deepEqual(defaultHideKeep([2, 7, 1, 5]), [0, 1, 3]);
  // Empate: fica o que veio primeiro
  assert.deepEqual(defaultHideKeep([4, 4, 4, 4]), [0, 1, 2]);
});

test('a escolha do jogador com 4 dados precisa ser de 3 índices válidos', () => {
  const values = [2, 7, 1, 5];
  assert.deepEqual(normalizeHideKeep(values, [3, 0, 2]), [0, 2, 3]);
  assert.deepEqual(normalizeHideKeep(values, ['1', '2', '3']), [1, 2, 3]);
  assert.equal(normalizeHideKeep(values, [0, 1]), null);
  assert.equal(normalizeHideKeep(values, [0, 0, 1]), null);
  assert.equal(normalizeHideKeep(values, [0, 1, 4]), null);
  assert.equal(normalizeHideKeep(values, [0, 1, '']), null);
  assert.equal(normalizeHideKeep(values, 'tudo'), null);
  // Com até 3 dados, a escolha é ignorada: ficam todos
  assert.deepEqual(normalizeHideKeep([4, 2], [9]), [0, 1]);
});

test('os dados escolhidos viram dados de esconderijo com lados e valor', () => {
  assert.deepEqual(
    hideDiceFromTest({ sides: [8, 6, 4, 8], values: [2, 6, 1, 5], keep: [0, 1, 3] }),
    [
      { lados: 8, valor: 2 },
      { lados: 6, valor: 6 },
      { lados: 8, valor: 5 },
    ],
  );
});

test('o dado extra do crítico é o maior dado do teste', () => {
  assert.equal(critExtraSides([8, 6]), 8);
  assert.equal(critExtraSides([6, 10, 4]), 10);
  assert.equal(critExtraSides([]), 0);
});

test('guardar substitui a lista e marca que se escondeu (o extra pode passar de 4 dados)', () => {
  const dice = [
    { lados: 8, valor: 2 },
    { lados: 6, valor: 6 },
    { lados: 8, valor: 5 },
    { lados: 8, valor: 7 },
  ];
  assert.deepEqual(hideTestPatch(dice), { esconderijo: dice, escondeu: true });
});

test('reserva de clique: uso único, reserva parada expira e falha devolve o botão', () => {
  const flag = createHideFlag({ combatantId: 'c1' });
  assert.equal(flag.estado, 'pendente');
  assert.equal(isHideClaimable(flag, 0), true);
  const reserved = reserveHide(flag, 1000);
  assert.equal(reserved.estado, 'aplicando');
  assert.equal(reserveHide(reserved, 2000), null);
  // Reserva parada há mais de 30 s pode ser retomada
  assert.ok(reserveHide(reserved, 1000 + HIDE_CLAIM_TIMEOUT_MS + 1));
  assert.deepEqual(releaseHide(reserved), { ...flag, estado: 'pendente', reservadoEm: null });
  const done = finishHide(reserved, { dados: [{ lados: 6, valor: 3 }], extra: null });
  assert.equal(done.estado, 'aplicado');
  assert.equal(isHideClaimable(done, 99999), false);
});

test('barra do cartão: escolha, crítico, já escondido e guardado', () => {
  const flag = createHideFlag({ combatantId: 'c1' });
  const four = { sides: [8, 6, 4, 8], values: [6, 6, 1, 3], critical: true };
  const view = hideBarView(flag, four, { canApply: true, alreadyHidden: false, now: 0 });
  assert.equal(view.mustChoose, true);
  assert.equal(view.keepCount, 3);
  assert.equal(view.critSides, 8);
  assert.equal(view.showButton, true);

  const two = { sides: [8, 6], values: [2, 5], critical: false };
  const small = hideBarView(flag, two, { canApply: true, alreadyHidden: false, now: 0 });
  assert.equal(small.mustChoose, false);
  assert.equal(small.keepCount, 2);
  assert.equal(small.critSides, 0);

  const hidden = hideBarView(flag, two, { canApply: true, alreadyHidden: true, now: 0 });
  assert.equal(hidden.alreadyHidden, true);
  assert.equal(hidden.showButton, false);

  const other = hideBarView(flag, two, { canApply: false, alreadyHidden: false, now: 0 });
  assert.equal(other.showButton, false);

  const done = finishHide(flag, {
    dados: [{ lados: 8, valor: 2 }],
    extra: { lados: 8, valor: 8 },
  });
  const applied = hideBarView(done, two, { canApply: true, alreadyHidden: true, now: 0 });
  assert.equal(applied.applied, true);
  assert.equal(applied.appliedCount, 2);
  assert.equal(applied.alreadyHidden, false);
  assert.equal(applied.showButton, false);
});
