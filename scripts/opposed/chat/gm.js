/**
 * Teste oposto: o que o mestre ativo grava (respostas, dano reservado) e os ganchos.
 * Parte de `opposed-chat.js` (v0.28.8).
 */
import { SYSTEM_ID } from '../../config.js';
import {
  actorResources,
  firstEffect,
  resourceChanges,
  triggerUpdates,
} from '../../rolls/ability-effects-actor.js';
import { ammoEffectOf } from '../../rolls/ability-effects.js';
import { announceGains } from '../../rolls/abilities-chat.js';
import { registerGuardHandler } from '../../rolls/guardian-chat.js';
import {
  assignGuardian,
  bothRolled,
  cardType,
  damageTargetUuid,
  loserSide,
  markDamage,
  registerSide,
  resolveState,
} from '../../rolls/opposed-card.js';
import { t } from '../../shared/i18n.js';
import { isActiveGM, onSocketAction } from '../../shared/socket.js';
import { answerFlag, cardState, otherSide, renderCard } from './common.js';
import { applyReservedDamage, damageRequests, testResult } from './card.js';

/**
 * Compara os dois lados (se ambos rolaram) e grava o cartão. Na primeira vez que o cartão tem um
 * perdedor, dispara os ganhos dele de «ao perder um oposto» (ex.: enche o ímpeto), como no teste
 * oposto pela API.
 */
async function saveCard(card, state) {
  let next = state;
  if (bothRolled(next)) {
    const resultA = testResult(game.messages.get(next.a.testId));
    const resultB = testResult(game.messages.get(next.b.testId));
    if (resultA && resultB) next = resolveState(next, resultA, resultB);
  }
  const loser = loserSide(next);
  if (loser && !next.impetoAplicado) {
    const actor = await foundry.utils.fromUuid(next[loser].actorUuid);
    // Ganhos de «ao perder um oposto» (efeitos `ganharRecurso`; ex.: enche o ímpeto)
    const before = actor ? actorResources(actor).values : {};
    const updates = actor ? triggerUpdates(actor, 'perdeOposto') : {};
    if (Object.keys(updates).length) {
      await actor.update(updates);
      await announceGains(actor, before, resourceChanges(updates), 'perdeOposto');
    }
    next = { ...next, impetoAplicado: true };
  }
  await card.update({ content: await renderCard(next), [`flags.${SYSTEM_ID}.oposto`]: next });
}

/**
 * Arma do teste, lida do próprio ator (nunca do pedido), no formato do cartão. Com munição, o
 * bônus de dano dela entra no `bonusDano` (o efeito é lido do item do ator, não do pedido).
 */
function weaponOf(actor, armaId, municaoId = null) {
  const item = armaId ? actor.items.get(armaId) : null;
  if (item?.type !== 'arma') return null;
  // A munição já foi gasta ao rolar: confere só o efeito (alcance e bônus), não as unidades
  const ammoItem = municaoId ? actor.items.get(municaoId) : null;
  const ammoEffect = ammoItem ? ammoEffectOf(ammoItem, item.system) : null;
  return {
    id: item.id,
    nome: item.name,
    bonusDano: item.system.bonusDano + (ammoEffect?.dano ?? 0),
    baseDano: item.system.baseDano,
    naoLetal: Boolean(item.system.naoLetal),
    tipo: item.system.tipo,
    pericia: item.system.pericia ?? '',
  };
}

/** O mestre registra no cartão o teste que acabou de chegar, se ele for válido. */
async function registerAnswer(test) {
  const flag = answerFlag(test);
  const card = game.messages.get(flag?.cardId);
  const state = cardState(card);
  if (!state || !['a', 'b'].includes(flag.lado)) return;
  const actor = await foundry.utils.fromUuid(flag.actorUuid);
  // Quem rolou precisa ser dono do ator, e o teste precisa ser dele (falando pelo ator)
  if (!actor || !test.author || !actor.testUserPermission(test.author, 'OWNER')) return;
  if (test.speaker?.actor && test.speaker.actor !== actor.id) return;
  const display = test.flags?.[SYSTEM_ID]?.teste?.display ?? {};
  // Esquiva: só vale se o ator tem a defesa livre com essa perícia (conferido pelo mestre)
  const dodge = firstEffect(actor, 'defesaLivre');
  const esquiva =
    Boolean(flag.esquiva) && Boolean(dodge) && (dodge.params.pericia || 'acrobacia') === flag.skill;
  const next = registerSide(state, flag.lado, {
    actorUuid: actor.uuid,
    nome: actor.name,
    skill: flag.skill,
    skillLabel: display.skillLabel ?? '',
    arma: weaponOf(actor, flag.armaId, flag.municaoId ?? null),
    testId: test.id,
    esquiva,
    // Nome da habilidade de esquiva, mostrado no lugar de «Esquiva»
    esquivaNome: esquiva ? dodge.itemName : '',
  });
  if (next) await saveCard(card, next);
}

/** Um teste já registrado mudou (análise, repetir dado): o mestre recompara o cartão. */
async function refreshAnswer(test) {
  const flag = answerFlag(test);
  const card = game.messages.get(flag?.cardId);
  const state = cardState(card);
  if (!state || state[flag.lado]?.testId !== test.id) return;
  if (!['resolvido', 'empate'].includes(state.estado)) return;
  await saveCard(card, state);
}

/**
 * Pedido de dano de um jogador: o mestre confere que ele é dono do alvo e que o dano ainda está
 * pendente, e reserva o dano para ele (o navegador dele aplica ao ver a reserva).
 */
async function reserveDamage({ messageId, side, userId }) {
  const card = game.messages.get(messageId);
  const state = cardState(card);
  const user = game.users.get(userId);
  if (!state || !user || !['a', 'b'].includes(side)) return;
  const target = await foundry.utils.fromUuid(damageTargetUuid(state, side));
  if (!target?.testUserPermission(user, 'OWNER')) return;
  const next = markDamage(state, side, userId);
  if (next)
    await card.update({ content: await renderCard(next), [`flags.${SYSTEM_ID}.oposto`]: next });
}

/** Fila do mestre: cada gravação espera a anterior (dois testes ao mesmo tempo não se perdem). */
let queue = Promise.resolve();
function enqueue(task) {
  queue = queue.then(task).catch((error) => console.error(`${SYSTEM_ID} | teste oposto`, error));
  return queue;
}

/**
 * Assumir ataque no cartão oposto de ataque × defesa: o mestre confere que o dano do lado ainda
 * está pendente, que ninguém assumiu e que o Guardião não é o atacante nem o alvo, e grava.
 */
registerGuardHandler('oposto', {
  enqueue,
  check(card, { side }, guardian) {
    const state = cardState(card);
    if (!state || cardType(state) !== 'defesa' || !['a', 'b'].includes(side)) return null;
    const next = assignGuardian(state, side, guardian);
    if (!next) return null;
    return {
      text: t('DESORDEM.Efeito.Nota.interceptar', { aliado: state[otherSide(side)].nome }),
      apply: async () =>
        card.update({ content: await renderCard(next), [`flags.${SYSTEM_ID}.oposto`]: next }),
    };
  },
});

/** Registra os hooks e o socket (chamar uma vez, no `init`). */
export function registerOpposedHooks() {
  Hooks.on('createChatMessage', (message) => {
    if (isActiveGM() && answerFlag(message)) enqueue(() => registerAnswer(message));
  });
  Hooks.on('updateChatMessage', (message, changes) => {
    // Dano reservado para este navegador: aplica agora (uma vez)
    const state = cardState(message);
    for (const side of ['a', 'b']) {
      const key = `${message.id}:${side}`;
      const entry = state?.dano?.[side];
      if (!damageRequests.has(key) || entry?.estado !== 'aplicado') continue;
      const choices = damageRequests.get(key);
      damageRequests.delete(key);
      if (entry.por === game.user.id) applyReservedDamage(message, side, choices);
    }
    if (!isActiveGM() || !answerFlag(message)) return;
    if (!changes?.flags?.[SYSTEM_ID]?.teste) return;
    enqueue(() => refreshAnswer(message));
  });
  Hooks.once('ready', () => {
    onSocketAction('opposedDamage', (data) => enqueue(() => reserveDamage(data)));
  });
}
