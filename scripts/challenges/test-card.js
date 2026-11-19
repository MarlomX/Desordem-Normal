/**
 * Teste estendido pela janela pré-teste (Foundry). Como o avanço da perseguição, o teste estendido
 * não tem janela própria: é uma opção da janela pré-teste («usar no teste estendido»).
 *   - Antes da rolagem (`withExtendedTest`): confere que o desafio ainda está ativo e que o
 *     personagem participa, e guarda na mensagem o registro do teste (flag `desafio`).
 *   - No cartão do chat (`renderChallengeBar`, hook renderChatMessageHTML): mostra quanto o teste
 *     vale e, para o dono do personagem e para o mestre, um botão de uso único que soma os pontos.
 *   - O clique (`applyChallengePoints`): sempre o mestre grava. O jogador pede por socket só com o
 *     id da mensagem; o mestre confere o dono, reserva o clique (contra o duplo clique) e recalcula
 *     o valor dos dados que o cartão tem agora (a Análise pode ter mudado o resultado).
 */
import { SYSTEM_ID } from '../config.js';
import { resolveWithValues } from '../rolls/abilities.js';
import {
  finishAdvanceFlag,
  isAdvanceClaimable,
  releaseAdvance,
  reserveAdvance,
} from '../rolls/chase.js';
import {
  applyChallengeTest,
  challengeBarView,
  challengeTestChoices,
  challengeTestGain,
  createChallengeTestFlag,
} from '../rolls/challenge.js';
import { SOCKET } from '../chase/store.js';
import { getChallenge, mutateChallenge, readChallenges, worldActorId } from './store.js';

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

/** Caminho do registro na mensagem (para `message.update`). */
const FLAG = `flags.${SYSTEM_ID}.desafio`;

/** Nome mostrado do desafio (o padrão, se o mestre apagou o nome). */
const shownName = (nome) => nome || t('DESORDEM.Desafio.Estendido.SemNome');

/** Desafios que a janela pré-teste oferece a este personagem (ativos, de que ele participa). */
export const challengeChoicesFor = (actor) =>
  challengeTestChoices(readChallenges(), worldActorId(actor)).map((entry) => ({
    ...entry,
    nome: shownName(entry.nome),
  }));

/**
 * Prepara as opções de um teste que vale para um teste estendido: guarda o registro na mensagem.
 * Se o desafio deixou de valer enquanto a janela estava aberta (o mestre encerrou, por exemplo),
 * avisa e rola um teste comum.
 * @param {Actor} actor
 * @param {object} options Opções devolvidas pela janela pré-teste (com `estendido`).
 */
export function withExtendedTest(actor, options) {
  const { estendido, ...rest } = options;
  const actorId = worldActorId(actor);
  const challenge = getChallenge(estendido.id);
  const joined = challenge?.participantes.some((entry) => entry.actorId === actorId);
  if (!challenge?.ativo || !joined) {
    ui.notifications.warn(t('DESORDEM.Desafio.Teste.Indisponivel'));
    return rest;
  }
  return {
    ...rest,
    desafioFlag: createChallengeTestFlag({ challenge, actorId, dt: estendido.dt }),
  };
}

/** Resultado do teste do cartão com os dados como estão agora (depois de Análise ou Prontidão). */
const currentResult = (test) => resolveWithValues(test.plan, test.values);

/**
 * Mensagens sendo atendidas agora pelo mestre. A reserva na mensagem só vale depois que o servidor
 * confirma a gravação; esta trava local impede que dois pedidos chegados juntos (o duplo clique
 * do jogador e o do mestre, por exemplo) leiam os dois a mensagem ainda «pendente».
 */
const inFlight = new Set();

/** Soma os pontos do teste ao desafio (executado pelo mestre ativo, um pedido por mensagem). */
export async function applyChallengePoints(message, userId) {
  if (!message || inFlight.has(message.id)) return;
  inFlight.add(message.id);
  try {
    await applyNow(message, userId);
  } finally {
    inFlight.delete(message.id);
  }
}

async function applyNow(message, userId) {
  const info = message?.flags?.[SYSTEM_ID];
  const flag = info?.desafio;
  const test = info?.teste;
  if (!flag || !test) return;

  const actor = game.actors.get(flag.actorId);
  const requester = game.users.get(userId);
  if (!actor || !requester) return;
  // Nunca confia no pedido: só um dono do personagem (ou o mestre) soma os pontos dele.
  if (!actor.testUserPermission(requester, 'OWNER')) return;

  const reserved = reserveAdvance(flag, Date.now());
  if (!reserved) return;
  await message.update({ [FLAG]: reserved });
  try {
    // O valor vem dos dados que o cartão tem agora, e não de algo enviado pelo jogador.
    const gain = challengeTestGain(currentResult(test), flag);
    let applied = false;
    await mutateChallenge(flag.desafioId, (challenge) => {
      const next = applyChallengeTest(challenge, flag.actorId, gain);
      if (!next) return challenge;
      applied = true;
      return next;
    });
    // Desafio encerrado, excluído ou sem o personagem: nada somado (a barra mostra o motivo)
    await message.update({
      [FLAG]: applied ? finishAdvanceFlag(reserved, gain) : releaseAdvance(reserved),
    });
  } catch (error) {
    console.error(`${SYSTEM_ID} | falha ao somar os pontos do teste estendido`, error);
    await message.update({ [FLAG]: releaseAdvance(reserved) });
  }
}

/** O mestre aplica direto; o jogador pede ao mestre ativo por socket. */
function requestApply(message) {
  if (game.user.isGM) return applyChallengePoints(message, game.user.id);
  if (!game.users.activeGM) {
    ui.notifications.warn(t('DESORDEM.Perseguicao.Erro.SemMestre'));
    return undefined;
  }
  return game.socket.emit(SOCKET, { action: 'challengePoints', messageId: message.id });
}

/** Socket: o mestre ativo atende o botão «somar pontos» dos jogadores. */
export function registerChallengeSocket() {
  game.socket.on(SOCKET, async (data, userId) => {
    if (game.users.activeGM?.id !== game.user.id) return;
    if (data?.action !== 'challengePoints') return;
    await applyChallengePoints(game.messages.get(data.messageId), userId);
  });
}

/** Hook renderChatMessageHTML: mostra quanto o teste vale e o botão de somar os pontos. */
export function renderChallengeBar(message, html) {
  const info = message.flags?.[SYSTEM_ID];
  const flag = info?.desafio;
  const test = info?.teste;
  const container = html.querySelector('.message-content');
  // Rolagem privada: quem só vê «???» não vê a barra (ela entregaria o resultado)
  if (!flag || !test || !container || !message.isContentVisible) return;

  const now = Date.now();
  const claimable = isAdvanceClaimable(flag, now);
  const view = challengeBarView(flag, currentResult(test), {
    canApply: Boolean(game.actors.get(flag.actorId)?.isOwner),
    claimable,
    busy: flag.estado === 'aplicando' && !claimable,
    challenge: getChallenge(flag.desafioId),
  });
  const doc = html.ownerDocument;
  const bar = doc.createElement('div');
  bar.className = 'desordem-teste__avanco desordem-teste__desafio';

  const text = doc.createElement('span');
  text.className = 'desordem-teste__avanco-texto';
  const nome = shownName(view.nome);
  if (view.applied) {
    text.textContent = t('DESORDEM.Desafio.Barra.Somado', { pontos: view.appliedPontos, nome });
  } else if (view.fechado) {
    text.textContent = t('DESORDEM.Desafio.Barra.Fechado');
  } else {
    // Chaves montadas aqui (conferidas à mão): DESORDEM.Desafio.Barra.{passou,falhou,crit,falhaCritica}
    text.textContent = `${t('DESORDEM.Desafio.Barra.Titulo', { nome, dt: view.dt })}: ${t(
      `DESORDEM.Desafio.Barra.${view.kind}`,
      { pontos: view.pontos },
    )}`;
  }
  bar.append(text);

  if (view.busy) {
    const busy = doc.createElement('span');
    busy.className = 'desordem-ficha__dica';
    busy.textContent = t('DESORDEM.Perseguicao.Barra.Aplicando');
    bar.append(busy);
  }

  if (view.showButton) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.textContent = t('DESORDEM.Desafio.Barra.Somar', { pontos: view.pontos });
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      button.disabled = true;
      try {
        await requestApply(message);
      } finally {
        // Se o cartão não for redesenhado (mestre ausente, por exemplo), o botão volta
        globalThis.setTimeout(() => {
          button.disabled = false;
        }, 5000);
      }
    });
    bar.append(button);
  }
  container.append(bar);
}
