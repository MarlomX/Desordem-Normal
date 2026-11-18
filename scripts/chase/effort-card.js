/* global fromUuid, fromUuidSync */
/**
 * Barra do esforço extra no cartão do chat (hook renderChatMessageHTML).
 *
 * O esforço extra do avanço rola os d4 de perda de PV, mas NÃO desconta nada sozinho: a mensagem
 * guarda um registro (flag `esforco`, veja chase.js) e esta barra oferece um botão de uso único,
 * «Aplicar N PV». Ao clicar, o PV atual do personagem é lido naquele momento e a perda é descontada
 * (nunca abaixo de 0). Se o PV chegar a 0, só avisa: o teste de lesão é do jogador.
 *
 * Quem clica é o dono do personagem que é também o autor da mensagem, ou o mestre (só eles podem
 * editar a mensagem, onde fica o estado «aplicado»). O duplo clique é barrado por uma reserva
 * guardada na mensagem, a mesma usada no botão dos PA.
 */
import { SYSTEM_ID } from '../config.js';
import {
  applyEffortLoss,
  effortBarView,
  finishEffortFlag,
  releaseAdvance,
  reserveAdvance,
} from '../rolls/chase.js';

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

const FLAG = `flags.${SYSTEM_ID}.esforco`;

/** Personagem (ator) do registro, ou `null` se não existe mais. */
async function actorOf(flag) {
  try {
    const doc = await fromUuid(flag.actorUuid);
    return doc?.documentName === 'Actor' ? doc : null;
  } catch {
    return null;
  }
}

/** Versão que não espera (para desenhar o cartão): `null` se o ator não está carregado. */
function actorOfSync(flag) {
  try {
    const doc = fromUuidSync(flag.actorUuid);
    return doc?.documentName === 'Actor' ? doc : null;
  } catch {
    return null;
  }
}

/** O usuário atual pode usar o botão? */
function canApplyHere(message, flag) {
  if (!game.user.isGM && !message.isAuthor) return false;
  return Boolean(actorOfSync(flag)?.isOwner);
}

/** Desconta o PV do esforço extra do personagem (clique no botão). */
async function applyEffort(message) {
  const flag = message.flags?.[SYSTEM_ID]?.esforco;
  if (!flag) return;
  const actor = await actorOf(flag);
  if (!actor?.isOwner) return;

  const reserved = reserveAdvance(flag, Date.now());
  if (!reserved) return;
  await message.update({ [FLAG]: reserved });
  try {
    // Usa o PV de agora (ele pode ter mudado desde a rolagem)
    const before = actor.system.pv.value;
    const { pv, reachedZero } = applyEffortLoss(before, flag.perda);
    await actor.update({ 'system.pv.value': pv });
    await message.update({
      [FLAG]: finishEffortFlag(reserved, { applied: before - pv, reachedZero }),
    });
    if (reachedZero) ui.notifications.warn(t('DESORDEM.Perseguicao.Chat.EsforcoZero'));
  } catch (error) {
    console.error(`${SYSTEM_ID} | falha ao descontar o PV do esforço extra`, error);
    await message.update({ [FLAG]: releaseAdvance(reserved) });
  }
}

/** Hook renderChatMessageHTML: mostra se o PV do esforço já foi descontado e o botão de aplicar. */
export function renderEffortBar(message, html) {
  const flag = message.flags?.[SYSTEM_ID]?.esforco;
  const container = html.querySelector('.message-content');
  if (!flag || !container) return;

  const view = effortBarView(flag, { canApply: canApplyHere(message, flag), now: Date.now() });
  const doc = html.ownerDocument;
  const bar = doc.createElement('div');
  bar.className = 'desordem-teste__avanco';

  const text = doc.createElement('span');
  text.className = 'desordem-teste__avanco-texto';
  if (view.applied) {
    text.textContent = t('DESORDEM.Perseguicao.Chat.EsforcoAplicado', { pv: view.appliedLoss });
    if (view.reachedZero) text.textContent += ` ${t('DESORDEM.Perseguicao.Chat.EsforcoZero')}`;
  } else {
    text.textContent = t('DESORDEM.Perseguicao.Chat.EsforcoPendente', { pv: view.loss });
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
    button.textContent = t('DESORDEM.Perseguicao.Chat.EsforcoAplicar', { pv: view.loss });
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      button.disabled = true;
      try {
        await applyEffort(message);
      } finally {
        // Se o cartão não for redesenhado (erro, por exemplo), o botão volta
        globalThis.setTimeout(() => {
          button.disabled = false;
        }, 5000);
      }
    });
    bar.append(button);
  }
  container.append(bar);
}
