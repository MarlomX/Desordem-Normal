/**
 * Barra "adicionar PA" no cartão do teste de avanço (hook renderChatMessageHTML).
 *
 * O teste de avanço guarda na mensagem um registro (flag `avanco`, veja chase.js) com a DT usada.
 * Esta barra mostra quantos PA o teste vale e, para o dono do personagem e para o mestre, um botão
 * de uso único que os soma ao participante. O valor é recalculado dos dados que o cartão mostra
 * agora, então usar a Análise (ou repetir um dado) antes do clique já muda o valor.
 *
 * Quem grava é sempre o mestre: o jogador pede por socket (só com o id da mensagem) e o mestre
 * recalcula o valor, confere que o pedido vem de um dono do personagem e reserva o clique, para o
 * duplo clique não somar duas vezes.
 */
import { SYSTEM_ID } from '../config.js';
import { resolveWithValues } from '../rolls/abilities.js';
import {
  advanceBarView,
  advanceGain,
  finishAdvanceFlag,
  releaseAdvance,
  reserveAdvance,
} from '../rolls/chase.js';
import { findChase } from './store.js';
import { t } from '../shared/i18n.js';
import { SOCKET, hasActiveGM } from '../shared/socket.js';

const FLAG = `flags.${SYSTEM_ID}.avanco`;

/** Resultado do teste do cartão com os dados como estão agora (depois de Análise ou Prontidão). */
const currentResult = (test) => resolveWithValues(test.plan, test.values);

/** O usuário atual pode usar o botão? (dono do personagem do participante, ou o mestre) */
function canApplyHere(flag) {
  const chase = findChase();
  const combatant = chase?.combatants.get(flag.combatantId);
  if (!chase?.system.ativa || !combatant?.actor) return false;
  return Boolean(combatant.actor.isOwner);
}

/** Soma os PA do teste ao participante (executado pelo mestre). */
export async function applyAdvancePoints(message, userId) {
  const info = message?.flags?.[SYSTEM_ID];
  const flag = info?.avanco;
  const test = info?.teste;
  if (!flag || !test) return;

  const chase = findChase();
  const combatant = chase?.combatants.get(flag.combatantId);
  const requester = game.users.get(userId);
  if (!chase?.system.ativa || !combatant?.actor || !requester) return;
  // Nunca confia no pedido: só um dono do personagem (ou o mestre) soma os PA dele.
  if (!combatant.actor.testUserPermission(requester, 'OWNER')) return;

  const reserved = reserveAdvance(flag, Date.now());
  if (!reserved) return;
  await message.update({ [FLAG]: reserved });
  try {
    // O valor vem dos dados que o cartão tem agora, e não de algo enviado pelo jogador.
    const gain = advanceGain(currentResult(test), flag.dt);
    await combatant.update({ system: { pa: combatant.system.pa + gain } });
    await message.update({ [FLAG]: finishAdvanceFlag(reserved, gain) });
  } catch (error) {
    console.error(`${SYSTEM_ID} | falha ao somar os pontos de avanço`, error);
    await message.update({ [FLAG]: releaseAdvance(reserved) });
  }
}

/** O mestre aplica direto; o jogador pede ao mestre ativo por socket. */
function requestApply(message) {
  if (game.user.isGM) return applyAdvancePoints(message, game.user.id);
  if (!hasActiveGM('DESORDEM.Perseguicao.Erro.SemMestre')) return undefined;
  return game.socket.emit(SOCKET, { action: 'chaseAdvancePoints', messageId: message.id });
}

/** Hook renderChatMessageHTML: mostra o valor do avanço e o botão de somar os PA. */
export function renderAdvanceBar(message, html) {
  const info = message.flags?.[SYSTEM_ID];
  const flag = info?.avanco;
  const test = info?.teste;
  const container = html.querySelector('.message-content');
  if (!flag || !test || !container) return;

  const view = advanceBarView(flag, currentResult(test), {
    canApply: canApplyHere(flag),
    now: Date.now(),
  });
  const doc = html.ownerDocument;
  const bar = doc.createElement('div');
  bar.className = 'desordem-teste__avanco';

  const text = doc.createElement('span');
  text.className = 'desordem-teste__avanco-texto';
  if (view.applied) {
    text.textContent = t('DESORDEM.Perseguicao.Barra.Adicionado', { pa: view.appliedPa });
  } else {
    text.textContent = `${t('DESORDEM.Perseguicao.Barra.Titulo', { dt: view.dt })}: ${t(
      `DESORDEM.Perseguicao.Barra.${view.kind}`,
      { pa: view.pa },
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
    button.textContent = t('DESORDEM.Perseguicao.Barra.Adicionar', { pa: view.pa });
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
