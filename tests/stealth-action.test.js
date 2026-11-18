import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRollModel,
  emptySelection,
  evaluateSelection,
  selectionToOptions,
} from '../scripts/rolls/roll-dialog.js';
import {
  STEALTH_MAX_USES,
  actionBarView,
  actionEligibleDice,
  createActionFlag,
  defaultActionDie,
  distractRecipients,
  finishHide,
  normalizeUses,
  stealthActionDt,
  stealthOptions,
  validActionChoice,
} from '../scripts/rolls/stealth.js';

// ---------------------------------------------------------------------------------------------
// DT e opções oferecidas
// ---------------------------------------------------------------------------------------------

test('DT das ações: 7, depois +3 a cada uso', () => {
  assert.equal(stealthActionDt(0), 7);
  assert.equal(stealthActionDt(1), 10);
  assert.equal(stealthActionDt(2), 13);
  assert.equal(stealthActionDt(undefined), 7);
  assert.equal(normalizeUses(-2), 0);
  assert.equal(normalizeUses('3'), 3);
  assert.equal(normalizeUses(999), STEALTH_MAX_USES);
});

const recipients = [{ id: 'a', name: 'Ana', self: true }];
const base = {
  ativa: true,
  isParticipant: true,
  isOwner: true,
  escondeu: false,
  esconderUsos: 0,
  distrairUsos: 0,
  recipients,
};

test('a vaga da janela: teste de esconderijo antes, esconder-se depois; distrair sempre', () => {
  const before = stealthOptions(base);
  assert.equal(before.teste, true);
  assert.equal(before.esconder, null);
  assert.deepEqual(before.distrair, { dt: 7, recipients });

  const after = stealthOptions({ ...base, escondeu: true, esconderUsos: 1, distrairUsos: 2 });
  assert.equal(after.teste, false);
  assert.deepEqual(after.esconder, { dt: 10 });
  assert.equal(after.distrair.dt, 13);

  // Sem ninguém para receber o dado, o distrair não aparece
  assert.equal(stealthOptions({ ...base, recipients: [] }).distrair, null);
  assert.equal(stealthOptions({ ...base, ativa: false }), null);
  assert.equal(stealthOptions({ ...base, isParticipant: false }), null);
  assert.equal(stealthOptions({ ...base, isOwner: false }), null);
});

test('destinos do distrair: escondidos e encontrados, o próprio personagem primeiro', () => {
  const list = distractRecipients(
    [
      { id: 'b', name: 'Bia', status: 'encontrado' },
      { id: 'c', name: 'Caio', status: 'aguardando' },
      { id: 'a', name: 'Ana', status: 'escondido' },
      { id: 'd', name: 'Davi', status: 'escondido' },
    ],
    'a',
  );
  assert.deepEqual(list, [
    { id: 'a', name: 'Ana', self: true },
    { id: 'b', name: 'Bia', self: false },
    { id: 'd', name: 'Davi', self: false },
  ]);
  // Quem ainda não fez o teste de esconderijo também não recebe pelo próprio distrair
  assert.deepEqual(distractRecipients([{ id: 'a', name: 'Ana', status: 'aguardando' }], 'a'), []);
});

// ---------------------------------------------------------------------------------------------
// Janela pré-teste
// ---------------------------------------------------------------------------------------------

const input = {
  skillKey: 'enganacao',
  attrDie: 8,
  skillDie: 6,
  has: {},
  resources: { impeto: 0, pd: 5 },
  fearDie: 6,
  dt: 7,
};
const others = [
  { id: 'a', name: 'Ana', self: true },
  { id: 'b', name: 'Bia', self: false },
];
const stealth = {
  teste: false,
  esconder: { dt: 10 },
  distrair: { dt: 13, recipients: others },
};
const pick = (acao, destino = '') => ({ ...emptySelection(7), furtiva: { acao, destino } });

test('esconder-se usa a DT da ação e mantém o pavor', () => {
  const model = buildRollModel({ ...input, stealth });
  assert.equal(model.esconderijo, null);
  const evaluated = evaluateSelection(model, pick('esconder'));
  assert.deepEqual(evaluated.furtiva, { acao: 'esconder', destino: '', dt: 10 });
  assert.equal(evaluated.dt, 10);
  assert.equal(evaluated.fear.die, 6);
  const options = selectionToOptions(model, pick('esconder'));
  assert.deepEqual(options.furtiva, { acao: 'esconder', destino: '', dt: 10 });
  assert.equal(options.dt, 10);
});

test('distrair: destino escolhido antes de rolar; destino inválido vira o primeiro', () => {
  const model = buildRollModel({ ...input, stealth });
  assert.equal(evaluateSelection(model, pick('distrair', 'b')).furtiva.destino, 'b');
  assert.equal(evaluateSelection(model, pick('distrair', 'x')).furtiva.destino, 'a');
  assert.equal(evaluateSelection(model, pick('distrair', 'b')).dt, 13);
});

test('ação que o personagem não tem é ignorada; teste comum sem nada', () => {
  const model = buildRollModel({ ...input, stealth: { ...stealth, esconder: null } });
  assert.equal(evaluateSelection(model, pick('esconder')).furtiva.acao, '');
  assert.equal('furtiva' in selectionToOptions(model, pick('')), false);
  // Sem cena, nada muda
  const plain = buildRollModel(input);
  assert.equal(plain.furtiva, null);
  assert.equal(evaluateSelection(plain, pick('distrair', 'a')).furtiva.acao, '');
  assert.equal(evaluateSelection(plain, pick('distrair', 'a')).dt, 7);
});

test('esconder-se não vale ao mesmo tempo como avanço nem como teste de esconderijo', () => {
  const model = buildRollModel({
    ...input,
    stealth: { ...stealth, teste: true },
    chase: { blocked: null, folego: 2, effortDice: 1, dt: 10 },
  });
  const evaluated = evaluateSelection(model, {
    ...pick('esconder'),
    esconderijo: { on: true },
    avanco: { on: true, breath: 1, effort: false },
  });
  assert.equal(evaluated.furtiva.acao, 'esconder');
  assert.equal(evaluated.esconderijo.on, false);
  assert.equal(evaluated.avanco.on, false);
});

// ---------------------------------------------------------------------------------------------
// Cartão: escolha do dado
// ---------------------------------------------------------------------------------------------

test('dados possíveis: os 3 maiores; com 4, o que ficou de fora não é opção', () => {
  assert.deepEqual(actionEligibleDice([3, 5]), [0, 1]);
  assert.deepEqual(actionEligibleDice([2, 7, 1, 5]), [0, 1, 3]);
  assert.equal(defaultActionDie([2, 7, 1, 5]), 1);
  assert.equal(defaultActionDie([4, 4]), 0);
  assert.equal(validActionChoice([2, 7, 1, 5], 2), false);
  assert.equal(validActionChoice([2, 7, 1, 5], 3), true);
  assert.equal(validActionChoice([2, 7, 1, 5], ''), false);
  assert.equal(validActionChoice([2, 7, 1, 5], null), false);
});

test('registro da ação: no esconder-se o dado é de quem rolou', () => {
  const hide = createActionFlag({ kind: 'esconder', combatantId: 'a', recipientId: 'b', dt: 10 });
  assert.equal(hide.recipientId, 'a');
  assert.equal(hide.contado, false);
  const distract = createActionFlag({
    kind: 'distrair',
    combatantId: 'a',
    recipientId: 'b',
    dt: 13,
  });
  assert.equal(distract.recipientId, 'b');
});

test('barra da ação: só passa com sucesso, destino válido e dono', () => {
  const flag = createActionFlag({ kind: 'esconder', combatantId: 'a', dt: 10 });
  const test4 = { sides: [8, 6, 4, 8], values: [2, 6, 1, 5], success: true };
  const view = actionBarView(flag, test4, { canApply: true, recipientOk: true, now: 0 });
  assert.equal(view.showButton, true);
  assert.deepEqual(view.eligible, [0, 1, 3]);
  assert.equal(view.chosen, 1);

  const failed = actionBarView(
    flag,
    { ...test4, success: false },
    { canApply: true, recipientOk: true, now: 0 },
  );
  assert.equal(failed.showButton, false);
  assert.equal(
    actionBarView(flag, test4, { canApply: false, recipientOk: true, now: 0 }).showButton,
    false,
  );
  assert.equal(
    actionBarView(flag, test4, { canApply: true, recipientOk: false, now: 0 }).showButton,
    false,
  );
  const done = finishHide(flag, { dados: [{ lados: 6, valor: 6 }] });
  const applied = actionBarView(done, test4, { canApply: true, recipientOk: true, now: 0 });
  assert.equal(applied.applied, true);
  assert.equal(applied.showButton, false);
});
