import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  STEALTH_COMBAT_TYPE,
  STEALTH_COMBATANT_TYPE,
  MAX_HIDE_DICE,
  initialStealthState,
  stealthStartState,
  stealthEndState,
  stealthParticipantReset,
  stealthNextRound,
  stealthRoundChange,
  normalizeHideDie,
  cleanHideDice,
  applyHideOp,
  sanitizeHideOp,
  hideStatus,
  canSeeHideValues,
  canEditHideDice,
  hideDiceView,
  hideOpPatch,
  hideOpMessage,
} from '../scripts/rolls/stealth.js';

test('os subtipos da furtividade estão registrados no system.json', () => {
  const system = JSON.parse(readFileSync(new URL('../system.json', import.meta.url), 'utf8'));
  assert.ok(system.documentTypes.Combat[STEALTH_COMBAT_TYPE]);
  assert.ok(system.documentTypes.Combatant[STEALTH_COMBATANT_TYPE]);
  // A perseguição continua lá
  assert.ok(system.documentTypes.Combat.perseguicao);
  assert.ok(system.documentTypes.Combatant.participante);
});

test('ciclo de vida: preparação, início e encerramento', () => {
  assert.deepEqual(initialStealthState(), { ativa: false, rodadaAtual: 0 });
  assert.deepEqual(stealthStartState(), { ativa: true, rodadaAtual: 1 });
  assert.deepEqual(stealthEndState(), { ativa: false, rodadaAtual: 0 });
  assert.deepEqual(stealthParticipantReset(), { esconderijo: [], escondeu: false });
});

test('próxima rodada soma 1 sem passar de 99', () => {
  assert.deepEqual(stealthNextRound(1), { rodadaAtual: 2 });
  assert.deepEqual(stealthNextRound(99), { rodadaAtual: 99 });
});

test('rodada na mão: botões e valor digitado', () => {
  assert.deepEqual(stealthRoundChange(3, { delta: 1 }), { valid: true, value: 4 });
  assert.deepEqual(stealthRoundChange(1, { delta: -1 }), { valid: true, value: 1 });
  assert.deepEqual(stealthRoundChange(3, { raw: '7' }), { valid: true, value: 7 });
  assert.equal(stealthRoundChange(3, { raw: '' }).valid, false);
  assert.equal(stealthRoundChange(3, { raw: '  ' }).valid, false);
  assert.equal(stealthRoundChange(3, { raw: '0' }).valid, false);
  assert.equal(stealthRoundChange(3, { raw: '2.5' }).valid, false);
  assert.equal(stealthRoundChange(3, { raw: 'abc' }).valid, false);
  assert.equal(stealthRoundChange(3, { raw: '100' }).valid, false);
});

test('dado de esconderijo: lados do jogo e valor dentro do dado', () => {
  assert.deepEqual(normalizeHideDie({ lados: 8, valor: 5 }), { lados: 8, valor: 5 });
  assert.deepEqual(normalizeHideDie({ lados: '10', valor: '10' }), { lados: 10, valor: 10 });
  assert.deepEqual(normalizeHideDie({ lados: 20, valor: 1 }), { lados: 20, valor: 1 });
  assert.equal(normalizeHideDie({ lados: 7, valor: 3 }), null);
  assert.equal(normalizeHideDie({ lados: 6, valor: 7 }), null);
  assert.equal(normalizeHideDie({ lados: 6, valor: 0 }), null);
  assert.equal(normalizeHideDie({ lados: 6, valor: '' }), null);
  assert.equal(normalizeHideDie({ lados: 6, valor: 2.5 }), null);
  assert.equal(normalizeHideDie(null), null);
});

test('lista limpa descarta dados mal formados e respeita o teto', () => {
  assert.deepEqual(cleanHideDice([{ lados: 6, valor: 3 }, { lados: 5, valor: 2 }, 'x']), [
    { lados: 6, valor: 3 },
  ]);
  assert.deepEqual(cleanHideDice(undefined), []);
  const many = Array.from({ length: 20 }, () => ({ lados: 6, valor: 1 }));
  assert.equal(cleanHideDice(many).length, MAX_HIDE_DICE);
});

test('acrescentar um dado', () => {
  const before = [{ lados: 6, valor: 3 }];
  const result = applyHideOp(before, { type: 'add', lados: 8, valor: 8 });
  assert.equal(result.valid, true);
  assert.deepEqual(result.list, [
    { lados: 6, valor: 3 },
    { lados: 8, valor: 8 },
  ]);
  // A lista original não muda
  assert.deepEqual(before, [{ lados: 6, valor: 3 }]);
});

test('acrescentar recusa dado inválido e lista cheia', () => {
  assert.equal(applyHideOp([], { type: 'add', lados: 6, valor: 9 }).reason, 'dado');
  const full = Array.from({ length: MAX_HIDE_DICE }, () => ({ lados: 4, valor: 2 }));
  const result = applyHideOp(full, { type: 'add', lados: 4, valor: 1 });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'cheio');
  assert.equal(result.list.length, MAX_HIDE_DICE);
});

test('descartar remove só o dado da posição pedida', () => {
  const list = [
    { lados: 6, valor: 3 },
    { lados: 6, valor: 3 },
    { lados: 8, valor: 1 },
  ];
  const result = applyHideOp(list, { type: 'remove', index: 1 });
  assert.equal(result.valid, true);
  assert.deepEqual(result.list, [
    { lados: 6, valor: 3 },
    { lados: 8, valor: 1 },
  ]);
  assert.equal(applyHideOp(list, { type: 'remove', index: 3 }).reason, 'indice');
  assert.equal(applyHideOp(list, { type: 'remove', index: -1 }).reason, 'indice');
  assert.equal(applyHideOp(list, { type: 'remove', index: '' }).reason, 'indice');
  assert.equal(applyHideOp(list, { type: 'trocar' }).reason, 'operacao');
});

test('operação limpa para o socket só leva os campos esperados', () => {
  assert.deepEqual(sanitizeHideOp({ type: 'add', lados: '6', valor: '2', extra: 'x' }), {
    type: 'add',
    lados: 6,
    valor: 2,
  });
  assert.deepEqual(sanitizeHideOp({ type: 'remove', index: '0', lados: 6 }), {
    type: 'remove',
    index: 0,
  });
  // Índice vazio não pode virar 0 (descartaria o primeiro dado)
  const blank = sanitizeHideOp({ type: 'remove', index: '' });
  assert.equal(blank.index, null);
  assert.equal(applyHideOp([{ lados: 6, valor: 1 }], blank).valid, false);
  assert.equal(sanitizeHideOp({ type: 'apagarTudo' }), null);
  assert.equal(sanitizeHideOp(null), null);
});

test('situação: preparação, aguardando, escondido e encontrado', () => {
  assert.equal(hideStatus({ ativa: false, escondeu: true, count: 2 }), 'preparacao');
  assert.equal(hideStatus({ ativa: true, escondeu: false, count: 0 }), 'aguardando');
  assert.equal(hideStatus({ ativa: true, escondeu: true, count: 1 }), 'escondido');
  assert.equal(hideStatus({ ativa: true, escondeu: true, count: 0 }), 'encontrado');
  // Recuperar um dado depois de encontrado volta a esconder
  assert.equal(hideStatus({ ativa: true, escondeu: true, count: 1 }), 'escondido');
});

test('valores: o jogador dono vê; o mestre só depois de revelar', () => {
  assert.equal(canSeeHideValues({ isGM: false, isOwner: true, revealed: false }), true);
  assert.equal(canSeeHideValues({ isGM: false, isOwner: false, revealed: true }), false);
  // O mestre é dono de todos os personagens no Foundry, mas isso não basta
  assert.equal(canSeeHideValues({ isGM: true, isOwner: true, revealed: false }), false);
  assert.equal(canSeeHideValues({ isGM: true, isOwner: true, revealed: true }), true);
});

test('edição à mão só com a cena em andamento e os valores visíveis', () => {
  assert.equal(canEditHideDice({ isGM: false, isOwner: true, revealed: false, ativa: true }), true);
  assert.equal(
    canEditHideDice({ isGM: false, isOwner: true, revealed: false, ativa: false }),
    false,
  );
  assert.equal(canEditHideDice({ isGM: true, isOwner: true, revealed: false, ativa: true }), false);
  assert.equal(canEditHideDice({ isGM: true, isOwner: true, revealed: true, ativa: true }), true);
  assert.equal(
    canEditHideDice({ isGM: false, isOwner: false, revealed: true, ativa: true }),
    false,
  );
});

test('visão da janela esconde os valores de quem não pode ver', () => {
  const esconderijo = [
    { lados: 6, valor: 4 },
    { lados: 8, valor: 2 },
  ];
  const other = hideDiceView({
    ativa: true,
    escondeu: true,
    esconderijo,
    isGM: false,
    isOwner: false,
    revealed: false,
  });
  assert.equal(other.count, 2);
  assert.equal(other.status, 'escondido');
  assert.equal(other.visible, false);
  assert.deepEqual(other.dice, []);

  const own = hideDiceView({
    ativa: true,
    escondeu: true,
    esconderijo,
    isGM: false,
    isOwner: true,
    revealed: false,
  });
  assert.equal(own.visible, true);
  assert.equal(own.canEdit, true);
  assert.deepEqual(own.dice, [
    { lados: 6, valor: 4, index: 0 },
    { lados: 8, valor: 2, index: 1 },
  ]);

  const gm = hideDiceView({
    ativa: true,
    escondeu: true,
    esconderijo,
    isGM: true,
    isOwner: true,
    revealed: false,
  });
  assert.equal(gm.count, 2);
  assert.deepEqual(gm.dice, []);
});

test('patch e mensagem de cada operação', () => {
  const list = [{ lados: 6, valor: 1 }];
  assert.deepEqual(hideOpPatch({ type: 'add' }, list, false), {
    esconderijo: list,
    escondeu: true,
  });
  assert.deepEqual(hideOpPatch({ type: 'remove' }, [], true), { esconderijo: [], escondeu: true });
  assert.deepEqual(hideOpPatch({ type: 'remove' }, [], false), {
    esconderijo: [],
    escondeu: false,
  });
  assert.equal(hideOpMessage({ type: 'add' }, 1), 'adicionou');
  assert.equal(hideOpMessage({ type: 'remove' }, 2), 'descartou');
  assert.equal(hideOpMessage({ type: 'remove' }, 0), 'encontrado');
  assert.equal(hideOpMessage({ type: 'x' }, 0), null);
});
