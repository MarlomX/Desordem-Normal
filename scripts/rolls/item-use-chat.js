/**
 * Uso dos itens gerais (botão Usar): gasta o uso ou a unidade (se houver limite ou consumo), paga o
 * custo das ações com aviso, posta o cartão de uso e, conforme os efeitos do item, um cartão de
 * cura (botão «Aplicar cura», o mesmo dos cartões de recuperação das relações) e um cartão de
 * passo (botão «Receber efeito»: quem clica ganha o efeito na aba Condição até o fim da cena).
 * A lógica fica em ability-effects.js (`itemUsePlan`), equipment.js (`itemUseState`) e
 * effects.js (`itemStepEffect`).
 */
import { SYSTEM_ID } from '../config.js';
import { render, postMessage } from './chat.js';
import { itemUse, itemUseState } from './equipment.js';
import { bagUpdates, costShortfall, itemUsePlan, ownEffects } from './ability-effects.js';
import { walletOf } from './ability-effects-actor.js';
import { itemStepEffect } from './effects.js';
import { pickReceiver } from './damage-dialog.js';

const TEMPLATE_USO = `systems/${SYSTEM_ID}/templates/chat/item-uso.hbs`;
const TEMPLATE_EFEITO = `systems/${SYSTEM_ID}/templates/chat/item-efeito.hbs`;
const SOCKET = `system.${SYSTEM_ID}`;

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

/** Texto do passo de um item: «Físico +1». */
const stepText = ({ atributo, passos }) =>
  `${t(`DESORDEM.Atributos.${atributo}`)} ${passos > 0 ? `+${passos}` : passos}`;

/**
 * Usa um item geral: confere se dá (usos, unidades, custo das ações com aviso), grava o gasto e
 * posta os cartões. Um uso dispara todos os efeitos de uso do item.
 * @param {Actor} actor Dono do item.
 * @param {Item} item
 * @returns {Promise<boolean>} Se o item foi usado.
 */
export async function useItem(actor, item) {
  const plan = itemUsePlan(ownEffects(item));
  const state = itemUseState(item.system, plan.hasUse);
  if (!state.canUse) {
    ui.notifications.warn(t('DESORDEM.Equipamento.SemUso', { nome: item.name }));
    return false;
  }
  // Custo das ações com aviso (PD, PV ou recurso de habilidade)
  const wallet = walletOf(actor);
  if (costShortfall(plan.cost, wallet).length) {
    ui.notifications.warn(t('DESORDEM.Equipamento.SemCusto', { nome: item.name }));
    return false;
  }
  const payment = bagUpdates(plan.cost, wallet);
  if (Object.keys(payment).length) await actor.update(payment);
  if (state.changes) await item.update(state.changes);
  const use = itemUse(item.system);
  await postMessage({
    actor,
    content: await render(TEMPLATE_USO, {
      name: actor.name,
      item: item.name,
      descricao: item.system.descricao,
      notes: plan.notes,
      byUses: use.kind === 'usos' || use.kind === 'unidadeUsos',
      remaining: use.remaining,
      max: use.max,
      // Consumível com usos: unidades que sobraram (a unidade atual conta)
      units: use.kind === 'unidadeUsos' ? use.units : null,
    }),
  });
  // Dados bônus (ex.: crucifixo): entram na reserva de quem usou e valem em um teste
  if (plan.dice.length && Array.isArray(actor.system.dadosBonus)) {
    await actor.update({ 'system.dadosBonus': [...actor.system.dadosBonus, ...plan.dice] });
    for (const dado of plan.dice) {
      await postMessage({
        actor,
        content: `<p class="desordem-ficha__dica">${Handlebars.escapeExpression(
          t('DESORDEM.Equipamento.DadoBonusRecebido', { nome: actor.name, dado }),
        )}</p>`,
      });
    }
  }
  for (const heal of plan.heals) await postHeal(actor, item, heal);
  for (const step of plan.steps) await postStep(actor, item, step);
  return true;
}

/**
 * Cartão de cura: rola a fórmula e põe o botão «Aplicar cura». O botão e a gravação são os dos
 * cartões de recuperação (relation-chat.js): o jogador aplica na própria ficha; o mestre escolhe
 * quem recebe.
 */
async function postHeal(actor, item, { formula, recurso }) {
  let roll;
  try {
    roll = await new Roll(formula).evaluate();
  } catch {
    ui.notifications.warn(t('DESORDEM.Equipamento.FormulaInvalida', { formula, nome: item.name }));
    return;
  }
  const values = roll.dice.flatMap((die) => die.results.map((result) => result.result));
  const resourceLabel = t(`DESORDEM.Ficha.${recurso.toUpperCase()}`);
  await postMessage({
    actor,
    rolls: [roll],
    content: await render(TEMPLATE_EFEITO, {
      actorName: actor.name,
      item: item.name,
      heal: {
        formula,
        values: values.length ? values.join(' + ') : String(roll.total),
        total: roll.total,
        resourceLabel,
      },
    }),
    flags: { recuperacao: { recurso, total: roll.total, curado: false } },
  });
}

/** Cartão de passo: quem clicar em «Receber efeito» ganha o efeito (um uso, uma pessoa). */
async function postStep(actor, item, step) {
  await postMessage({
    actor,
    content: await render(TEMPLATE_EFEITO, {
      actorName: actor.name,
      item: item.name,
      step: { text: stepText(step) },
    }),
    flags: {
      passoItem: {
        nome: item.name,
        atributo: step.atributo,
        passos: step.passos,
        recebido: false,
        recebidoPor: '',
      },
    },
  });
}

/** Quem recebe o passo: o mestre escolhe numa lista; o jogador, o token selecionado ou a sua ficha. */
async function stepReceiver() {
  if (game.user.isGM) return pickReceiver({ title: t('DESORDEM.Equipamento.QuemRecebeEfeito') });
  return globalThis.canvas?.tokens?.controlled?.[0]?.actor ?? game.user.character ?? null;
}

/** Marca o cartão de passo como recebido (quem não pode editar a mensagem pede ao mestre). */
async function markStepReceived(message, name) {
  const changes = {
    [`flags.${SYSTEM_ID}.passoItem.recebido`]: true,
    [`flags.${SYSTEM_ID}.passoItem.recebidoPor`]: name,
  };
  if (message.canUserModify(game.user, 'update')) await message.update(changes);
  else game.socket.emit(SOCKET, { action: 'itemStepReceived', messageId: message.id, by: name });
}

/**
 * Entrega o passo do cartão a quem clicou: um efeito novo na aba Condição (até o fim da cena).
 * @returns {Promise<boolean>} Se o efeito foi entregue.
 */
async function receiveStep(message) {
  const data = message.flags?.[SYSTEM_ID]?.passoItem;
  if (!data || data.recebido) return false;
  const actor = await stepReceiver();
  if (!actor?.isOwner || !Array.isArray(actor.system.efeitos)) {
    ui.notifications.warn(t('DESORDEM.Recuperacao.SemAlvo'));
    return false;
  }
  const effect = itemStepEffect({
    nome: data.nome,
    descricao: t('DESORDEM.Equipamento.PassoDescricao', { texto: stepText(data) }),
    atributo: data.atributo,
    passos: data.passos,
  });
  await actor.update({ 'system.efeitos': [...actor.toObject().system.efeitos, effect] });
  await postMessage({
    actor,
    content: `<p class="desordem-ficha__dica">${Handlebars.escapeExpression(
      t('DESORDEM.Equipamento.PassoRecebido', {
        nome: actor.name,
        texto: stepText(data),
        item: data.nome,
      }),
    )}</p>`,
  });
  await markStepReceived(message, actor.name);
  return true;
}

/** Hook renderChatMessageHTML: liga o botão «Receber efeito» (ou mostra quem já recebeu). */
export function renderItemUseCard(message, html) {
  const data = message.flags?.[SYSTEM_ID]?.passoItem;
  const button = html.querySelector('[data-desordem-receber-passo]');
  if (!data || !button) return;
  if (data.recebido) {
    const note = button.ownerDocument.createElement('p');
    note.className = 'desordem-ficha__dica';
    note.textContent = t('DESORDEM.Equipamento.PassoJaRecebido', { nome: data.recebidoPor });
    button.replaceWith(note);
    return;
  }
  button.addEventListener('click', async (event) => {
    event.preventDefault();
    button.disabled = true;
    let done = false;
    try {
      done = await receiveStep(message);
    } finally {
      if (!done) button.disabled = false;
    }
  });
}

/** O mestre ativo marca os cartões de passo recebidos a pedido dos jogadores. */
export function registerItemUseSocket() {
  game.socket.on(SOCKET, async (data) => {
    if (data?.action !== 'itemStepReceived') return;
    if (game.users.activeGM?.id !== game.user.id) return;
    const message = game.messages.get(data.messageId);
    if (!message || message.flags?.[SYSTEM_ID]?.passoItem?.recebido) return;
    await message.update({
      [`flags.${SYSTEM_ID}.passoItem.recebido`]: true,
      [`flags.${SYSTEM_ID}.passoItem.recebidoPor`]: String(data.by ?? ''),
    });
  });
}
