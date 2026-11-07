/**
 * Ligação ao Foundry das relações: invocar um laço (o cartão do chat traz os benefícios e, nos graus
 * 2 e 3, o botão de motivar, que rola a recuperação de PD) e o botão de recuperar, que quem recebe
 * clica para aplicar o valor ao próprio personagem.
 */
import { SYSTEM_ID } from '../config.js';
import { render, postMessage } from './chat.js';
import { degreeKey, invokeCheck, updateRelation, buildInvocationContext } from './relation.js';
import { applyRecovery } from './recovery.js';

const TEMPLATE_RELACAO = `systems/${SYSTEM_ID}/templates/chat/relacao.hbs`;
const TEMPLATE_RECUPERACAO = `systems/${SYSTEM_ID}/templates/chat/recuperacao.hbs`;
const TEMPLATE_CURADO = `systems/${SYSTEM_ID}/templates/chat/curado.hbs`;
const SOCKET = `system.${SYSTEM_ID}`;

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

/** Relação do índice informado (erro se ela não existir). */
function relationOf(actor, index) {
  const relation = actor.system.relacoes[index];
  if (!relation) throw new Error(`${SYSTEM_ID} | relação inexistente: ${index}`);
  return relation;
}

/** Marca a relação como usada nesta missão. */
async function markUsed(actor, index) {
  const list = updateRelation(actor.toObject().system.relacoes, index, { usada: true });
  await actor.update({ 'system.relacoes': list });
}

/**
 * Invoca uma relação: marca como usada e avisa a mesa no chat, listando os benefícios do grau
 * (aplicados à mão pelos jogadores). Devolve null, com um aviso, se a relação não puder ser invocada.
 * @param {Actor} actor
 * @param {number} index Posição da relação na ficha.
 */
export async function invokeRelation(actor, index) {
  const relation = relationOf(actor, index);
  const check = invokeCheck(relation);
  if (!check.ok) {
    ui.notifications.warn(t(`DESORDEM.Relacao.Aviso.${check.reason}`));
    return null;
  }
  await markUsed(actor, index);
  const context = buildInvocationContext(relation, {
    actorName: actor.name,
    degreeLabel: t(`DESORDEM.Relacao.Grau.${degreeKey(relation.grau)}`),
    noPerson: t('DESORDEM.Relacao.SemNome'),
  });
  await postMessage({
    actor,
    content: await render(TEMPLATE_RELACAO, context),
    flags: {
      invocacao: {
        actorUuid: actor.uuid,
        pessoa: context.pessoa,
        motivar: context.benefits.motivate,
        motivado: false,
      },
    },
  });
  return context;
}

/**
 * Botão "motivar" do cartão de invocação: rola a recuperação de PD (2d4 no grau 2, 2d6 no grau 3)
 * e publica o cartão com o botão de recuperar. Só o dono do personagem que invocou pode usar, e
 * só uma vez por cartão.
 * @param {ChatMessage} message Cartão de invocação.
 * @returns {Promise<boolean>} Se a motivação foi rolada.
 */
async function rollMotivation(message) {
  const data = message.flags?.[SYSTEM_ID]?.invocacao;
  if (!data?.motivar || data.motivado) return false;
  const actor = await foundry.utils.fromUuid(data.actorUuid);
  if (!actor?.isOwner || !message.canUserModify(game.user, 'update')) {
    ui.notifications.warn(t('DESORDEM.Relacao.Aviso.SoDono'));
    return false;
  }
  // Reserva o cartão antes de rolar, para não rolar duas vezes com cliques repetidos
  await message.update({ [`flags.${SYSTEM_ID}.invocacao.motivado`]: true });
  const { count, sides } = data.motivar;
  const roll = await new Roll(`${count}d${sides}`).evaluate();
  const values = roll.dice.flatMap((die) => die.results.map((result) => result.result));
  const content = await render(TEMPLATE_RECUPERACAO, {
    actorName: actor.name,
    pessoa: data.pessoa,
    formula: `${count}d${sides}`,
    values: values.join(' + '),
    total: roll.total,
    resourceLabel: t('DESORDEM.Ficha.PD'),
  });
  await postMessage({
    actor,
    content,
    rolls: [roll],
    flags: { recuperacao: { recurso: 'pd', total: roll.total, curado: false } },
  });
  return true;
}

/** Personagem que recebe a recuperação: o token selecionado ou, sem ele, o personagem do usuário. */
function recoveryTarget() {
  return game.canvas?.tokens?.controlled?.[0]?.actor ?? game.user.character ?? null;
}

const recoveredChanges = (name) => ({
  [`flags.${SYSTEM_ID}.recuperacao.curado`]: true,
  [`flags.${SYSTEM_ID}.recuperacao.curadoPor`]: name,
});

/** Marca o cartão como aplicado; quem não pode editar a mensagem pede ao mestre ativo (socket). */
async function markRecovered(message, name) {
  if (message.canUserModify(game.user, 'update')) {
    await message.update(recoveredChanges(name));
  } else {
    game.socket.emit(SOCKET, { action: 'markRecovered', messageId: message.id, by: name });
  }
}

/**
 * Aplica ao personagem de quem clicou a recuperação do cartão (sem passar do máximo).
 * @returns {Promise<boolean>} Se a recuperação foi aplicada.
 */
async function applyRecoveryFromMessage(message) {
  const data = message.flags?.[SYSTEM_ID]?.recuperacao;
  if (!data || data.curado) return false;
  const actor = recoveryTarget();
  if (!actor || !actor.isOwner) {
    ui.notifications.warn(t('DESORDEM.Recuperacao.SemAlvo'));
    return false;
  }
  const resource = actor.system[data.recurso];
  const { before, after, recovered } = applyRecovery({
    current: resource.value,
    max: resource.max,
    amount: data.total,
  });
  await actor.update({ [`system.${data.recurso}.value`]: after });
  await postMessage({
    actor,
    content: await render(TEMPLATE_CURADO, {
      name: actor.name,
      resourceLabel: t(`DESORDEM.Ficha.${data.recurso.toUpperCase()}`),
      before,
      after,
      recovered,
    }),
  });
  await markRecovered(message, actor.name);
  return true;
}

/** Troca um botão por um aviso em texto. */
function replaceWithNote(button, text) {
  const note = button.ownerDocument.createElement('p');
  note.className = 'desordem-ficha__dica';
  note.textContent = text;
  button.replaceWith(note);
}

/** Liga o botão de motivar do cartão de invocação (ou o troca por um aviso, se já foi usado). */
function renderMotivateButton(message, html) {
  const data = message.flags?.[SYSTEM_ID]?.invocacao;
  const button = html.querySelector('[data-desordem-motivar]');
  if (!data || !button) return;
  if (data.motivado) {
    replaceWithNote(button, t('DESORDEM.Relacao.Chat.JaMotivou'));
    return;
  }
  button.addEventListener('click', async (event) => {
    event.preventDefault();
    button.disabled = true;
    let done = false;
    try {
      done = await rollMotivation(message);
    } finally {
      if (!done) button.disabled = false;
    }
  });
}

/** Liga o botão de recuperar dos cartões de motivar (ou o troca por um aviso, se já aplicado). */
function renderRecoveryButton(message, html) {
  const data = message.flags?.[SYSTEM_ID]?.recuperacao;
  const button = html.querySelector('[data-desordem-curar]');
  if (!data || !button) return;
  if (data.curado) {
    replaceWithNote(button, t('DESORDEM.Recuperacao.JaAplicada', { nome: data.curadoPor ?? '' }));
    return;
  }
  button.addEventListener('click', async (event) => {
    event.preventDefault();
    button.disabled = true;
    let applied = false;
    try {
      applied = await applyRecoveryFromMessage(message);
    } finally {
      if (!applied) button.disabled = false;
    }
  });
}

/** Hook renderChatMessageHTML: liga os botões dos cartões de invocação e de recuperação. */
export function renderRelationCard(message, html) {
  renderMotivateButton(message, html);
  renderRecoveryButton(message, html);
}

/** Escuta o pedido dos jogadores para marcar cartões como aplicados (só o mestre ativo atende). */
export function registerRelationSocket() {
  game.socket.on(SOCKET, async (data) => {
    if (data?.action !== 'markRecovered') return;
    if (game.users.activeGM?.id !== game.user.id) return;
    const message = game.messages.get(data.messageId);
    if (!message || message.flags?.[SYSTEM_ID]?.recuperacao?.curado) return;
    await message.update(recoveredChanges(String(data.by ?? '')));
  });
}
