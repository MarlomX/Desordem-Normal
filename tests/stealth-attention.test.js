// Furtividade: ação chamativa e chamar atenção.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRollModel,
  emptySelection,
  evaluateSelection,
  selectionToOptions,
} from '../scripts/rolls/roll-dialog.js';
import {
  MAX_HIDE_DICE,
  applyAttention,
  applyHideOp,
  attentionRecipients,
  flashyOption,
  hideOpMessage,
  sanitizeAttention,
  sanitizeReason,
} from '../scripts/rolls/stealth.js';

const mine = [
  { lados: 6, valor: 4 },
  { lados: 8, valor: 2 },
  { lados: 10, valor: 7 },
];

test('descarte com o dado esperado: se a lista mudou, nada é descartado', () => {
  assert.equal(applyHideOp(mine, { type: 'remove', index: 1, lados: 8, valor: 2 }).valid, true);
  assert.equal(applyHideOp(mine, { type: 'remove', index: 1, lados: 6 }).reason, 'mudou');
  assert.equal(applyHideOp(mine, { type: 'remove', index: 1, valor: 3 }).reason, 'mudou');
  // Sem dado esperado, continua como antes (o «×» da janela)
  assert.equal(applyHideOp(mine, { type: 'remove', index: 1 }).valid, true);
});

test('mensagem da ação chamativa e motivos aceitos', () => {
  assert.equal(hideOpMessage({ type: 'remove' }, 2, 'chamativa'), 'chamativa');
  assert.equal(hideOpMessage({ type: 'remove' }, 0, 'chamativa'), 'chamativaEncontrado');
  assert.equal(hideOpMessage({ type: 'remove' }, 2, 'outro'), 'descartou');
  assert.equal(sanitizeReason('chamativa'), 'chamativa');
  assert.equal(sanitizeReason('apagarTudo'), undefined);
});

test('chamar atenção: perde dois, o aliado ganha o dado passado', () => {
  const ally = [{ lados: 4, valor: 1 }];
  const result = applyAttention(
    mine,
    ally,
    { index: 2, lados: 10, valor: 7 },
    { index: 0, lados: 6, valor: 4 },
  );
  assert.equal(result.valid, true);
  assert.deepEqual(result.own, [{ lados: 8, valor: 2 }]);
  assert.deepEqual(result.ally, [
    { lados: 4, valor: 1 },
    { lados: 10, valor: 7 },
  ]);
  // As listas recebidas não mudam
  assert.equal(mine.length, 3);
  assert.equal(ally.length, 1);
});

test('chamar atenção: aliado encontrado (sem dados) volta a ter um', () => {
  const two = mine.slice(0, 2);
  const result = applyAttention(two, [], { index: 0 }, { index: 1 });
  assert.equal(result.valid, true);
  assert.deepEqual(result.own, []);
  assert.deepEqual(result.ally, [{ lados: 6, valor: 4 }]);
});

test('chamar atenção: recusas', () => {
  assert.equal(applyAttention([mine[0]], [], { index: 0 }, { index: 0 }).reason, 'poucos');
  assert.equal(applyAttention(mine, [], { index: 1 }, { index: 1 }).reason, 'mesmo');
  assert.equal(applyAttention(mine, [], { index: 5 }, { index: 1 }).reason, 'mudou');
  assert.equal(applyAttention(mine, [], { index: 0, valor: 6 }, { index: 1 }).reason, 'mudou');
  assert.equal(applyAttention(mine, [], { index: 'x' }, { index: 1 }).reason, 'mudou');
  const full = Array.from({ length: MAX_HIDE_DICE }, () => ({ lados: 6, valor: 1 }));
  assert.equal(applyAttention(mine, full, { index: 0 }, { index: 1 }).reason, 'cheio');
});

test('pedido limpo do chamar atenção', () => {
  assert.deepEqual(
    sanitizeAttention({
      fromId: 'a',
      toId: 'b',
      transfer: { index: '2', lados: '10', valor: '7', extra: 1 },
      discard: { index: 0 },
      hack: true,
    }),
    {
      fromId: 'a',
      toId: 'b',
      transfer: { index: 2, lados: 10, valor: 7 },
      discard: { index: 0, lados: undefined, valor: undefined },
    },
  );
});

test('quem pode receber: outro participante escondido ou encontrado', () => {
  const list = attentionRecipients(
    [
      { id: 'a', name: 'Ana', status: 'escondido' },
      { id: 'b', name: 'Bia', status: 'encontrado' },
      { id: 'c', name: 'Caio', status: 'aguardando' },
    ],
    'a',
  );
  assert.deepEqual(list, [{ id: 'b', name: 'Bia' }]);
});

test('ação chamativa: só aparece para quem pode mexer nos próprios dados', () => {
  assert.deepEqual(flashyOption({ ativa: true, canEdit: true, dice: mine.slice(0, 1) }), {
    dice: [{ index: 0, lados: 6, valor: 4 }],
  });
  assert.equal(flashyOption({ ativa: true, canEdit: false, dice: mine }), null);
  assert.equal(flashyOption({ ativa: true, canEdit: true, dice: [] }), null);
  assert.equal(flashyOption({ ativa: false, canEdit: true, dice: mine }), null);
});

const input = {
  skillKey: 'atletismo',
  attrDie: 8,
  skillDie: 6,
  has: {},
  resources: { impeto: 0, pd: 5 },
  dt: 7,
};
const stealth = {
  teste: false,
  esconder: { dt: 10 },
  distrair: { dt: 7, recipients: [{ id: 'a', name: 'Ana', self: true }] },
  chamativa: {
    dice: [
      { index: 0, lados: 6, valor: 4 },
      { index: 1, lados: 8, valor: 2 },
    ],
  },
};

test('janela: ação chamativa invalida esconder-se e distrair e mantém a DT do teste', () => {
  const model = buildRollModel({ ...input, stealth });
  const selection = {
    ...emptySelection(7),
    furtiva: { acao: 'esconder', destino: '' },
    chamativa: { on: true, index: '1' },
  };
  const evaluated = evaluateSelection(model, selection);
  assert.equal(evaluated.furtiva.acao, '');
  assert.deepEqual(evaluated.chamativa, { on: true, index: 1, lados: 8, valor: 2 });
  assert.equal(evaluated.dt, 7);
  const options = selectionToOptions(model, selection);
  assert.deepEqual(options.chamativa, { on: true, index: 1, lados: 8, valor: 2 });
  assert.equal('furtiva' in options, false);
});

test('janela: dado inválido vira o primeiro; sem a opção, nada acontece', () => {
  const model = buildRollModel({ ...input, stealth });
  const evaluated = evaluateSelection(model, {
    ...emptySelection(7),
    chamativa: { on: true, index: '9' },
  });
  assert.equal(evaluated.chamativa.index, 0);
  const plain = buildRollModel({ ...input, stealth: { ...stealth, chamativa: null } });
  const off = evaluateSelection(plain, { ...emptySelection(7), chamativa: { on: true, index: 0 } });
  assert.deepEqual(off.chamativa, { on: false, index: null });
  assert.equal(
    'chamativa' in selectionToOptions(plain, { ...emptySelection(7), chamativa: { on: true } }),
    false,
  );
});

test('janela: ação chamativa combina com o avanço da perseguição', () => {
  const model = buildRollModel({
    ...input,
    stealth,
    chase: { blocked: null, folego: 2, effortDice: 1, dt: 10 },
  });
  const evaluated = evaluateSelection(model, {
    ...emptySelection(7),
    chamativa: { on: true, index: 0 },
    avanco: { on: true, breath: 1, effort: false },
  });
  assert.equal(evaluated.chamativa.on, true);
  assert.equal(evaluated.avanco.on, true);
});
