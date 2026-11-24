/**
 * Pedidos dos jogadores ao mestre ativo pelo socket (v0.28.2). Fixam o comportamento dos
 * ouvintes antes e depois de eles passarem pelo roteador comum (`scripts/shared/socket.js`):
 * só o mestre ativo atende, cada ação chega ao seu ouvinte e uma ação desconhecida não faz nada.
 */
import { deliver, log, makeMessage, makeUser, resetFoundry, runHook } from './foundry-stub.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerRelationSocket } from '../scripts/rolls/relation-chat.js';
import { registerItemUseSocket } from '../scripts/rolls/item-use-chat.js';
import { registerAbilitySocket } from '../scripts/rolls/abilities-chat.js';
import { registerGuardianSocket } from '../scripts/rolls/guardian-chat.js';
import { registerEquipmentSocket } from '../scripts/rolls/equipment-chat.js';
import { registerTableSocket } from '../scripts/rolls/table-chat.js';
import { registerChaseSocket } from '../scripts/chase/hooks.js';
import { registerStealthSocket } from '../scripts/stealth/hooks.js';
import { registerChallengeSocket } from '../scripts/challenges/test-card.js';
import { registerBalanceSocket } from '../scripts/challenges/balance-card.js';
import { registerLockSocket } from '../scripts/challenges/lock-card.js';
import { registerOpposedHooks } from '../scripts/opposed/opposed-chat.js';
import { registerFirstAidHooks } from '../scripts/rolls/first-aid-chat.js';
import { registerBonusDiceHooks } from '../scripts/rolls/bonus-dice-chat.js';

const FLAGS = 'desordem-normal';
const gm = makeUser('gm', { isGM: true });
const player = makeUser('player');

// Os ouvintes são registrados uma vez, como no `ready` do sistema
registerRelationSocket();
registerItemUseSocket();
registerAbilitySocket();
registerGuardianSocket();
registerEquipmentSocket();
registerTableSocket();
registerChaseSocket();
registerStealthSocket();
registerChallengeSocket();
registerBalanceSocket();
registerLockSocket();
registerOpposedHooks();
registerFirstAidHooks();
registerBonusDiceHooks();
await runHook('ready');

/** Espera as filas do mestre (`enqueue`) terminarem. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

function withMessage(message, options) {
  resetFoundry(options);
  game.messages.add(message);
  return message;
}

test('recuperação da relação: o mestre ativo marca o cartão pedido pelo jogador', async () => {
  const message = withMessage(makeMessage('m1', { [FLAGS]: { recuperacao: {} } }), { user: gm });
  await deliver({ action: 'markRecovered', messageId: 'm1', by: 'Ana' });
  assert.deepEqual(message.updates, [
    {
      [`flags.${FLAGS}.recuperacao.curado`]: true,
      [`flags.${FLAGS}.recuperacao.curadoPor`]: 'Ana',
    },
  ]);
  // Já marcado: não grava de novo
  message.flags[FLAGS].recuperacao.curado = true;
  await deliver({ action: 'markRecovered', messageId: 'm1', by: 'Ana' });
  assert.equal(message.updates.length, 1);
});

test('só o mestre ativo atende: outro navegador (jogador ou mestre não ativo) ignora', async () => {
  const flags = { [FLAGS]: { recuperacao: {} } };
  const asPlayer = withMessage(makeMessage('m1', structuredClone(flags)), {
    user: player,
    activeGM: gm,
  });
  await deliver({ action: 'markRecovered', messageId: 'm1', by: 'Ana' });
  assert.deepEqual(asPlayer.updates, []);
  const otherGm = makeUser('gm2', { isGM: true });
  const asOtherGm = withMessage(makeMessage('m1', structuredClone(flags)), {
    user: otherGm,
    activeGM: gm,
  });
  await deliver({ action: 'markRecovered', messageId: 'm1', by: 'Ana' });
  assert.deepEqual(asOtherGm.updates, []);
  // Sem mestre conectado ninguém atende
  const noGm = withMessage(makeMessage('m1', structuredClone(flags)), { user: gm, activeGM: null });
  await deliver({ action: 'markRecovered', messageId: 'm1', by: 'Ana' });
  assert.deepEqual(noGm.updates, []);
});

test('passo de item: o mestre ativo marca quem recebeu', async () => {
  const message = withMessage(makeMessage('m2', { [FLAGS]: { passoItem: {} } }), { user: gm });
  await deliver({ action: 'itemStepReceived', messageId: 'm2', by: 'Bia' });
  assert.deepEqual(message.updates, [
    {
      [`flags.${FLAGS}.passoItem.recebido`]: true,
      [`flags.${FLAGS}.passoItem.recebidoPor`]: 'Bia',
    },
  ]);
});

test('dano da arma: o mestre ativo marca o cartão como aplicado (pela fila)', async () => {
  const message = withMessage(makeMessage('m3', { [FLAGS]: { danoArma: {} } }), { user: gm });
  await deliver({ action: 'weaponDamageApplied', messageId: 'm3' });
  await settle();
  assert.deepEqual(message.updates, [{ [`flags.${FLAGS}.danoArma.aplicado`]: true }]);
});

test('pedidos com mensagem ou documento inexistente não gravam nem quebram', async () => {
  resetFoundry({ user: gm });
  const actions = [
    'markRecovered',
    'itemStepReceived',
    'rewriteTest',
    'weaponDamageApplied',
    'tableState',
    'chaseAdvancePoints',
    'chasePenalty',
    'chaseParticipant',
    'stealthHideDice',
    'stealthHideUses',
    'challengePoints',
    'challengeBalance',
    'lockAttempt',
  ];
  for (const action of actions) {
    await deliver({ action, messageId: 'nao-existe', combatId: 'nao-existe' });
  }
  await settle();
  assert.deepEqual(log.errors, []);
});

test('ação desconhecida não faz nada', async () => {
  const message = withMessage(makeMessage('m1', { [FLAGS]: { recuperacao: {} } }), { user: gm });
  await deliver({ action: 'inventada', messageId: 'm1' });
  await deliver(null);
  await settle();
  assert.deepEqual(message.updates, []);
});

test('cada pedido mandado pelo socket tem um atendente no mestre ativo', async () => {
  const { socketActions } = await import('../scripts/shared/socket.js');
  assert.deepEqual(socketActions().sort(), [
    'bonusDice',
    'challengeBalance',
    'challengePoints',
    'chaseAdvancePoints',
    'chaseParticipant',
    'chasePenalty',
    'firstAid',
    'guardiao',
    'itemStepReceived',
    'lockAttempt',
    'lockBoard',
    'markRecovered',
    'opposedDamage',
    'rewriteTest',
    'stealthAction',
    'stealthAttention',
    'stealthHideDice',
    'stealthHideTest',
    'stealthHideUses',
    'stealthSearch',
    'tableState',
    'weaponDamageApplied',
    'weaponDamageCreature',
  ]);
  // Ações escritas direto no pedido (`game.socket.emit(SOCKET, { action: 'x', ... })`)
  const { readdirSync, readFileSync } = await import('node:fs');
  const files = (dir) =>
    readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? files(`${dir}/${e.name}`)
        : e.name.endsWith('.js')
          ? [`${dir}/${e.name}`]
          : [],
    );
  const sent = files('scripts').flatMap((path) => [
    ...readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').matchAll(
      /game\.socket\.emit\(SOCKET, \{\s*action: '(\w+)'/g,
    ),
  ]);
  assert.ok(sent.length > 10);
  for (const [, action] of sent) assert.ok(socketActions().includes(action), action);
});
