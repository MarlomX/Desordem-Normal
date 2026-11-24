/* global document */
/**
 * Assumir ataque (efeito `interceptar`) nos cartões do chat: o botão aparece no cartão de ataque
 * comum e no cartão de teste oposto de ataque × defesa, para quem tem a habilidade pronta. Quem
 * grava é sempre o mestre: ele confere o dono, a rodada e o custo, cobra, grava no cartão
 * «Alvo: X (habilidade)» e avisa no chat. Daí em diante o dano daquele cartão vai para o Guardião.
 *
 * Cada tipo de cartão registra o seu tratador (`registerGuardHandler`), que confere se o cartão
 * ainda aceita e grava a marca. Assim este módulo não depende dos cartões (sem import circular).
 */
import { SYSTEM_ID } from '../config.js';
import { canPay, payUpdates } from './ability-effects.js';
import { firstEffect, roundUseUpdate, usableThisRound, walletOf } from './ability-effects-actor.js';
import { abilityNote } from './abilities-chat.js';
import { guardianData } from './guardian.js';
import { t } from '../shared/i18n.js';
import { SOCKET, onSocketAction, hasActiveGM } from '../shared/socket.js';

const ACTION = 'guardiao';

/** Tratadores por tipo de cartão (veja `registerGuardHandler`). */
const handlers = new Map();

/**
 * Registra o tratador de um tipo de cartão.
 * @param {string} kind 'arma' ou 'oposto'.
 * @param {{check: Function, enqueue?: Function}} handler `check(message, dados, guardian)` confere
 *   se o cartão ainda aceita e devolve {text, apply()} (o aviso do chat e a gravação do cartão) ou
 *   null; `enqueue` põe tudo na fila do cartão (opcional; sem ela, uma fila própria).
 */
export function registerGuardHandler(kind, handler) {
  handlers.set(kind, handler);
}

/** O personagem tem o Assumir ataque pronto (efeito, rodada livre e custo pago)? */
function readyEntry(actor) {
  const entry = actor?.type === 'personagem' ? firstEffect(actor, 'interceptar') : null;
  if (!entry || !usableThisRound(actor, entry)) return null;
  return canPay(entry.params.custo, walletOf(actor)) ? entry : null;
}

/**
 * Personagens deste usuário que podem assumir o ataque agora, fora os de `exclude` (atacante e
 * alvo). O mestre usa o token selecionado; o jogador, todos os personagens dele.
 * @param {string[]} exclude Uuids que não podem assumir.
 * @returns {{actor: Actor, entry: object}[]}
 */
export function readyGuardians(exclude = []) {
  const candidates = game.user?.isGM
    ? (globalThis.canvas?.tokens?.controlled ?? []).map((token) => token.actor)
    : [...(game.actors ?? [])].filter((actor) => actor.isOwner);
  const seen = new Set();
  const list = [];
  for (const actor of candidates) {
    if (!actor || seen.has(actor.uuid) || exclude.includes(actor.uuid)) continue;
    seen.add(actor.uuid);
    const entry = readyEntry(actor);
    if (entry) list.push({ actor, entry });
  }
  return list;
}

/** Cria o botão de assumir o ataque de um personagem (com o nome dele, se houver mais de um). */
function guardButton({ actor, entry }, several, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'desordem-oposto__botao';
  const icon = document.createElement('i');
  icon.className = 'fa-solid fa-shield-halved';
  icon.setAttribute('aria-hidden', 'true');
  const label = several
    ? t('DESORDEM.Efeito.Guardiao.BotaoAtor', { habilidade: entry.itemName, nome: actor.name })
    : t('DESORDEM.Efeito.Guardiao.Botao', { habilidade: entry.itemName });
  button.append(icon, document.createTextNode(` ${label}`));
  button.addEventListener('click', (event) => {
    event.preventDefault();
    button.disabled = true;
    onClick(actor);
  });
  return button;
}

/**
 * Botões de assumir o ataque para um cartão.
 * @param {ChatMessage} message
 * @param {Object} options
 * @param {string} options.kind Tipo do cartão ('arma' ou 'oposto').
 * @param {string[]} options.exclude Uuids que não podem assumir (atacante e alvo).
 * @param {object} [options.extra] Dados a mais do pedido (ex.: o lado do cartão oposto).
 * @returns {HTMLButtonElement[]}
 */
export function guardButtons(message, { kind, exclude, extra = {} }) {
  const ready = readyGuardians(exclude);
  return ready.map((item) =>
    guardButton(item, ready.length > 1, (actor) =>
      requestGuard({
        action: ACTION,
        kind,
        messageId: message.id,
        actorUuid: actor.uuid,
        ...extra,
      }),
    ),
  );
}

/** O mestre atende na hora; o jogador pede ao mestre ativo. */
function requestGuard(data) {
  const payload = { ...data, userId: game.user.id };
  if (game.user.isGM) return handleGuard(payload);
  if (!hasActiveGM('DESORDEM.Efeito.Guardiao.SemMestre')) return null;
  game.socket.emit(SOCKET, payload);
  return null;
}

/** Fila própria (para os cartões que não têm a sua): cada gravação espera a anterior. */
let queue = Promise.resolve();
function ownQueue(task) {
  queue = queue.then(task).catch((error) => console.error(`${SYSTEM_ID} | guardião`, error));
  return queue;
}

/** Pedido de assumir o ataque: vai para a fila do cartão. */
function handleGuard(data) {
  const handler = handlers.get(data?.kind);
  if (!handler) return null;
  return (handler.enqueue ?? ownQueue)(() => guard(handler, data));
}

/**
 * O mestre confere e grava: quem pediu é dono do Guardião, ele tem o efeito pronto (rodada e
 * custo), o cartão ainda aceita; então cobra o custo, marca a rodada, grava o Guardião no cartão
 * e avisa no chat.
 */
async function guard(handler, { messageId, actorUuid, userId, ...rest }) {
  const message = game.messages.get(messageId);
  const user = game.users.get(userId);
  const actor = await foundry.utils.fromUuid(String(actorUuid ?? ''));
  if (!message || !user || !actor?.testUserPermission(user, 'OWNER')) return;
  const entry = readyEntry(actor);
  if (!entry) return;
  const guardian = guardianData(actor, entry);
  const plan = await handler.check(message, rest, guardian);
  if (!plan) return;
  const wallet = walletOf(actor);
  const updates = { ...payUpdates(entry.params.custo, wallet), ...roundUseUpdate(entry) };
  if (Object.keys(updates).length) await actor.update(updates);
  await plan.apply();
  await abilityNote(actor, { entry, text: plan.text });
}

/** Registra o ouvinte do socket (chamar uma vez, no `ready`). */
export function registerGuardianSocket() {
  onSocketAction(ACTION, (data) => {
    handleGuard(data);
  });
}
