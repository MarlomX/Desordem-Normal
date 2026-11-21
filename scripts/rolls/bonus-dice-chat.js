/* global document */
/**
 * Dados bônus ao grupo (efeito `testeAcao` com resultado «dá dados bônus», como um plano de ação):
 *
 * 1. O botão da habilidade gasta o custo e faz o teste (perícia ou área de Aptidão, DT do efeito).
 *    O teste leva a marca `planoDados` (tamanho do dado, margem, nome da habilidade, estado).
 * 2. Se passou, o cartão ganha o botão «Distribuir», de uso único, para o dono de quem testou.
 * 3. Quem grava é sempre o mestre (por socket): recalcula, a partir do próprio teste (com análise
 *    e repetições já aplicadas), quantos dados são (1, mais 1 a cada `margem` acima da DT) e soma
 *    à reserva `system.dadosBonus` de quem testou e de todos os personagens de jogador.
 * 4. A reserva aparece no cabeçalho da ficha e esvazia na Nova cena.
 */
import { SYSTEM_ID } from '../config.js';
import { postMessage, rollTest, skillTestOptions } from './chat.js';
import { resolveWithValues } from './abilities.js';
import { bonusDiceGranted, canPay, payUpdates } from './ability-effects.js';
import { walletOf } from './ability-effects-actor.js';

const SOCKET = `system.${SYSTEM_ID}`;
const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const warn = (key, data) => ui.notifications.warn(t(key, data));

/** Marca do teste que dá dados ao grupo. */
const planFlag = (message) => message?.flags?.[SYSTEM_ID]?.planoDados ?? null;

/** Resultado atual do teste (com análise e repetições já aplicadas). */
function testResult(message) {
  const data = message?.flags?.[SYSTEM_ID]?.teste;
  if (!data?.plan || !Array.isArray(data.values)) return null;
  return resolveWithValues(data.plan, data.values);
}

/** Ator que fez o teste (pelo orador da mensagem). */
const testerOf = (message) => game.actors.get(message?.speaker?.actor) ?? null;

/** Quantos dados o teste dá agora (0 se não passou). */
function grantedDice(message) {
  const flag = planFlag(message);
  const result = testResult(message);
  if (!flag || !result?.success) return 0;
  return Math.max(1, bonusDiceGranted(result.total, result.dt, flag.margem));
}

/**
 * Quem recebe: quem testou e todos os personagens de jogador (fichas de personagem com um
 * jogador como dono), sem repetir.
 */
function recipients(tester) {
  const list = tester ? [tester] : [];
  for (const actor of game.actors) {
    if (actor.type === 'personagem' && actor.hasPlayerOwner && !list.includes(actor)) {
      list.push(actor);
    }
  }
  return list;
}

/**
 * Botão da habilidade: gasta o custo e faz o teste, já com a marca para o cartão.
 * @param {Actor} actor
 * @param {object} entry Efeito `testeAcao` (com `itemName`).
 */
export async function startGroupDice(actor, entry) {
  const { custo, pericia, dt, dado, margem } = entry.params;
  const wallet = walletOf(actor);
  if (!canPay(custo, wallet)) {
    return warn('DESORDEM.Efeito.Aviso.SemCusto', { nome: entry.itemName });
  }
  const updates = payUpdates(custo, wallet);
  if (Object.keys(updates).length) await actor.update(updates);
  return rollTest({
    ...skillTestOptions(actor, pericia, undefined, {
      dt,
      label: `${actor.name}: ${entry.itemName}`,
    }),
    actor,
    planoFlag: { dado, margem, nome: entry.itemName, estado: 'pendente' },
  });
}

/** O mestre distribui os dados pedidos (uso único; confere quem pediu e o teste). */
async function applyGrant({ messageId, userId }) {
  const message = game.messages.get(messageId);
  const flag = planFlag(message);
  const user = game.users.get(userId);
  if (!flag || flag.estado !== 'pendente' || !user) return;
  const tester = testerOf(message);
  if (!user.isGM && !tester?.testUserPermission(user, 'OWNER')) return;
  const count = grantedDice(message);
  if (!count) return;
  const list = recipients(tester);
  const names = list.map((actor) => actor.name).join(', ');
  // Marca primeiro: um segundo clique (ou pedido repetido) não distribui de novo
  await message.update({
    [`flags.${SYSTEM_ID}.planoDados.estado`]: 'aplicado',
    [`flags.${SYSTEM_ID}.planoDados.n`]: count,
    [`flags.${SYSTEM_ID}.planoDados.alvos`]: names,
  });
  for (const actor of list) {
    const reserve = actor.system.dadosBonus ?? [];
    await actor.update({
      'system.dadosBonus': [...reserve, ...Array.from({ length: count }, () => flag.dado)],
    });
  }
  await postMessage({
    actor: tester,
    content: `<p class="desordem-ficha__dica">${t('DESORDEM.Plano.Distribuido', {
      n: count,
      dado: flag.dado,
      alvos: Handlebars.escapeExpression(names),
    })}</p>`,
  });
}

/** Clique no botão: o mestre distribui na hora; o jogador pede ao mestre. */
function requestGrant(message) {
  const data = { action: 'bonusDice', messageId: message.id, userId: game.user.id };
  if (game.user.isGM) return enqueue(() => applyGrant(data));
  if (!game.users.activeGM) {
    warn('DESORDEM.Plano.SemMestre');
    return null;
  }
  game.socket.emit(SOCKET, data);
  return null;
}

/** Hook renderChatMessageHTML: botão «Distribuir» no teste bem-sucedido. */
export function renderBonusDiceButton(message, html) {
  const flag = planFlag(message);
  if (!flag || !message.isContentVisible) return;
  const content = html.querySelector('.message-content') ?? html;
  const bar = document.createElement('div');
  bar.className = 'desordem-socorro-barra';
  if (flag.estado === 'aplicado') {
    bar.textContent = t('DESORDEM.Plano.JaDistribuido', { n: flag.n, dado: flag.dado });
    content.append(bar);
    return;
  }
  const count = grantedDice(message);
  const tester = testerOf(message);
  if (!count || (!game.user.isGM && !tester?.isOwner)) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = t('DESORDEM.Plano.Distribuir', { n: count, dado: flag.dado });
  button.addEventListener('click', (event) => {
    event.preventDefault();
    button.disabled = true;
    requestGrant(message);
  });
  bar.append(button);
  content.append(bar);
}

/** Fila do mestre: cada gravação espera a anterior. */
let queue = Promise.resolve();
function enqueue(task) {
  queue = queue.then(task).catch((error) => console.error(`${SYSTEM_ID} | dados bônus`, error));
  return queue;
}

const isActiveGM = () => game.users.activeGM?.id === game.user.id;

/** Registra o ouvinte do socket (chamar uma vez, no `init`). */
export function registerBonusDiceHooks() {
  Hooks.once('ready', () => {
    game.socket.on(SOCKET, (data) => {
      if (data?.action !== 'bonusDice' || !isActiveGM()) return;
      enqueue(() => applyGrant(data));
    });
  });
}
