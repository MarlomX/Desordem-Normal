// Macros do jogador para celular (v0.25.1): escolhas puras de «Abrir chat» e «Abrir ficha».
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHAT_LIMIT,
  CHAT_LIMIT_MAX,
  chatLimit,
  chatWidth,
  isNearBottom,
  lastVisibleMessages,
  pickSheetActor,
  sheetAction,
} from '../scripts/mobile/mobile.js';

test('chatLimit: inteiro de 1 ao máximo; o resto vira o padrão', () => {
  assert.equal(chatLimit(), CHAT_LIMIT);
  assert.equal(chatLimit(0), CHAT_LIMIT);
  assert.equal(chatLimit(-3), CHAT_LIMIT);
  assert.equal(chatLimit('abc'), CHAT_LIMIT);
  assert.equal(chatLimit(5), 5);
  assert.equal(chatLimit('7'), 7);
  assert.equal(chatLimit(4.9), 4);
  assert.equal(chatLimit(999), CHAT_LIMIT_MAX);
});

test('lastVisibleMessages: só as visíveis, as últimas N, na ordem do chat', () => {
  const messages = [
    { id: 'a', visible: true },
    { id: 'b', visible: false },
    { id: 'c', visible: true },
    { id: 'd', visible: true },
    { id: 'e', visible: false },
  ];
  assert.deepEqual(
    lastVisibleMessages(messages, 2).map((m) => m.id),
    ['c', 'd'],
  );
  assert.deepEqual(
    lastVisibleMessages(messages, 10).map((m) => m.id),
    ['a', 'c', 'd'],
  );
  assert.deepEqual(lastVisibleMessages([], 5), []);
});

test('isNearBottom: perto do fim segue a mensagem nova; lendo acima, mantém', () => {
  assert.equal(isNearBottom({ scrollHeight: 1000, scrollTop: 900, clientHeight: 90 }), true);
  assert.equal(isNearBottom({ scrollHeight: 1000, scrollTop: 500, clientHeight: 90 }), false);
  assert.equal(isNearBottom({ scrollHeight: 1000, scrollTop: 500, clientHeight: 90 }, 500), true);
});

test('chatWidth: até 420 px, sem passar da tela', () => {
  assert.equal(chatWidth(1920), 420);
  assert.equal(chatWidth(360), 340);
  assert.equal(chatWidth(10), 0);
});

test('pickSheetActor: vinculado, depois token, depois os personagens do usuário', () => {
  const pc = { id: 'pc', isOwner: true, type: 'personagem' };
  const other = { id: 'pc2', isOwner: true, type: 'personagem' };
  const creature = { id: 'cr', isOwner: true, type: 'criatura' };
  const foreign = { id: 'x', isOwner: false, type: 'personagem' };

  assert.deepEqual(pickSheetActor({ character: pc, controlled: creature }), { actor: pc });
  // Token selecionado vale com qualquer tipo (o mestre abre a criatura pelo token)
  assert.deepEqual(pickSheetActor({ controlled: creature, owned: [pc] }), { actor: creature });
  // Na lista, só personagens que o usuário controla
  assert.deepEqual(pickSheetActor({ owned: [pc, creature, foreign] }), { actor: pc });
  assert.deepEqual(pickSheetActor({ owned: [pc, other, creature] }), { choices: [pc, other] });
  assert.deepEqual(pickSheetActor({ owned: [creature, foreign] }), { none: true });
  assert.deepEqual(pickSheetActor(), { none: true });
});

test('sheetAction: abrir, voltar ao tamanho normal ou trazer para a frente', () => {
  assert.equal(sheetAction({ rendered: false }), 'render');
  assert.equal(sheetAction({ rendered: true, minimized: true }), 'restore');
  assert.equal(sheetAction({ rendered: true, minimized: false }), 'front');
});
