/* global document */
/**
 * Teste oposto iniciado pela ficha (Foundry). A lógica do cartão fica em `rolls/opposed-card.js`.
 *
 * 1. «Propor teste oposto» na ficha: a pessoa escolhe a perícia do seu lado e, se tiver um token
 *    mirado, ele é o oponente. Sai no chat um cartão sem rolagem.
 * 2. Cada lado clica em «Rolar» (ou «Aceitar», se o oponente ainda está em aberto), passa pela
 *    janela pré-teste e rola um teste comum, público, com a marca `respostaOposto`.
 * 3. O mestre ativo vê o teste chegar (hook `createChatMessage`), confere que quem rolou é dono do
 *    ator e registra o teste no cartão. Com os dois lados, compara e mostra o vencedor. Se um dos
 *    testes mudar depois (análise, repetir dado), o cartão é recalculado (`updateChatMessage`).
 *
 * Só o mestre grava o resultado; os jogadores só criam mensagens (o cartão e os próprios testes).
 */
import { SYSTEM_ID } from '../config.js';
import { postMessage, render, skillName, skillTestOptions, rollTest } from '../rolls/chat.js';
import { askRollChoices } from '../rolls/roll-dialog-chat.js';
import { addImpeto, hasAbility, resolveWithValues } from '../rolls/abilities.js';
import {
  buildOpposedCardContext,
  bothRolled,
  canCancel,
  canRollSide,
  createOpposedState,
  loserSide,
  opposedSkillChoices,
  registerSide,
  repeatState,
  resolveState,
} from '../rolls/opposed-card.js';

const TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/oposto-cartao.hbs`;
const TEMPLATE_DIALOG = `systems/${SYSTEM_ID}/templates/dialog/oposto.hbs`;
const ACTOR_TYPES = ['personagem', 'criatura'];

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

/** Estado do cartão guardado na mensagem (ou null, se a mensagem não é um cartão de oposto). */
const cardState = (message) => message?.flags?.[SYSTEM_ID]?.oposto ?? null;

/** Marca do teste que responde a um cartão. */
const answerFlag = (message) => message?.flags?.[SYSTEM_ID]?.respostaOposto ?? null;

/** HTML do cartão para um estado. */
function renderCard(state) {
  const context = buildOpposedCardContext(state);
  return render(TEMPLATE, { ...context, lados: [context.a, context.b] });
}

/** Perícias que o ator pode usar na disputa (para os seletores das janelas). */
function skillChoicesFor(actor) {
  return opposedSkillChoices(actor.system, {
    skill: (key) => t(`DESORDEM.Pericias.${key}`),
    aptitude: (key) => `${t('DESORDEM.Ficha.Aptidoes')}: ${t(`DESORDEM.Aptidoes.${key}`)}`,
    craft: (key) => `${t('DESORDEM.Ficha.Oficios')}: ${t(`DESORDEM.Oficios.${key}`)}`,
    extra: (group, name) => name || t(`DESORDEM.Ficha.ExtraSemNome.${group}`),
  });
}

/** O único token mirado, se for de outro ator (o oponente sugerido). */
function targetedOpponent(actor) {
  const targets = [...game.user.targets].map((token) => token.actor).filter(Boolean);
  if (targets.length !== 1) return null;
  const [target] = targets;
  return target.uuid !== actor.uuid && ACTOR_TYPES.includes(target.type) ? target : null;
}

/**
 * Atores com que este usuário pode aceitar um lado em aberto: os tokens selecionados, o
 * personagem dele e, para jogadores, todos os atores de que é dono (para o mestre, os tokens da
 * cena). Nunca o ator do outro lado.
 */
function candidateActors(excludeUuid) {
  const list = [];
  const add = (actor) => {
    if (!actor?.isOwner || !ACTOR_TYPES.includes(actor.type)) return;
    if (actor.uuid === excludeUuid || list.includes(actor)) return;
    list.push(actor);
  };
  for (const token of globalThis.canvas?.tokens?.controlled ?? []) add(token.actor);
  add(game.user.character);
  if (game.user.isGM) {
    for (const token of globalThis.canvas?.scene?.tokens ?? []) add(token.actor);
  } else {
    for (const actor of game.actors) add(actor);
  }
  return list;
}

/**
 * Janela de escolha (proposta ou aceite). Devolve os valores do formulário ou null.
 * @param {object} context Dados do template `dialog/oposto.hbs`.
 */
async function askChoices(title, context) {
  const answer = await foundry.applications.api.DialogV2.wait({
    window: { title },
    classes: ['desordem-normal', 'desordem-oposto-janela'],
    content: await render(TEMPLATE_DIALOG, context),
    modal: true,
    rejectClose: false,
    buttons: [
      {
        action: 'ok',
        label: context.confirmar,
        icon: 'fa-solid fa-check',
        default: true,
        callback: (event, button) => {
          const fields = button.form.elements;
          return {
            confirmed: true,
            skill: fields.skill?.value ?? '',
            actor: fields.actor?.value ?? '',
            descricao: fields.descricao?.value ?? '',
          };
        },
      },
      { action: 'cancel', label: t('DESORDEM.Teste.Pre.Cancelar') },
    ],
  });
  // Cancelar ou fechar devolvem outra coisa (o nome da ação ou null): só {confirmed} confirma
  return answer?.confirmed === true ? answer : null;
}

/**
 * Botão «Propor teste oposto» da ficha: escolhe a perícia (e uma descrição curta) e publica o
 * cartão. Com um token mirado de outro ator, ele vira o oponente.
 * @param {Actor} actor
 */
export async function proposeOpposed(actor) {
  const opponent = targetedOpponent(actor);
  const skills = skillChoicesFor(actor);
  const answer = await askChoices(t('DESORDEM.Oposto.ProporTitulo'), {
    skills,
    showSkill: true,
    showDescription: true,
    opponentName: opponent?.name ?? '',
    confirmar: t('DESORDEM.Oposto.Propor'),
  });
  if (!answer || !skills.some((choice) => choice.key === answer.skill)) return null;
  const state = createOpposedState({
    a: {
      actorUuid: actor.uuid,
      nome: actor.name,
      skill: answer.skill,
      skillLabel: skillName(answer.skill, actor),
    },
    b: opponent ? { actorUuid: opponent.uuid, nome: opponent.name } : {},
    descricao: answer.descricao,
  });
  return postMessage({
    actor,
    content: await renderCard(state),
    flags: { oposto: state },
    rollMode: 'publicroll',
  });
}

/** Cliques em andamento neste navegador (mensagem + lado), contra o duplo clique. */
const inFlight = new Set();

/**
 * Rola um lado do cartão: escolhe o ator (lado em aberto) e a perícia (se o lado ainda não tem),
 * passa pela janela pré-teste e publica o teste comum com a marca do cartão.
 */
async function rollSide(message, side, event) {
  const state = cardState(message);
  const data = state?.[side];
  if (!data) return;
  const other = state[side === 'a' ? 'b' : 'a'];
  let actor = data.actorUuid ? await foundry.utils.fromUuid(data.actorUuid) : null;
  let skill = data.skill;

  if (!actor || !skill) {
    const candidates = actor ? [actor] : candidateActors(other.actorUuid);
    if (!candidates.length) {
      ui.notifications.warn(t('DESORDEM.Oposto.SemCandidatos'));
      return;
    }
    const answer = await askChoices(t('DESORDEM.Oposto.AceitarTitulo'), {
      actors: actor ? [] : candidates.map((c) => ({ uuid: c.uuid, name: c.name })),
      showActor: !actor,
      // Sem ator ainda, a perícia é a do mesmo nome do outro lado, se existir
      skills: skillChoicesFor(candidates[0]).map((choice) => ({
        ...choice,
        selected: choice.key === other.skill,
      })),
      showSkill: true,
      opponentName: other.nome,
      confirmar: t('DESORDEM.Oposto.Rolar'),
    });
    if (!answer) return;
    actor = actor ?? candidates.find((c) => c.uuid === answer.actor) ?? null;
    skill = answer.skill;
    if (!actor || !skillChoicesFor(actor).some((choice) => choice.key === skill)) return;
  }
  if (!actor.isOwner || !canRollSide(state, side, actor.uuid)) {
    ui.notifications.warn(t('DESORDEM.Oposto.SemPermissao'));
    return;
  }

  const options = await askRollChoices(actor, {
    skillKey: skill,
    showDt: false,
    shift: event?.shiftKey,
  });
  if (!options) return;
  const test = skillTestOptions(actor, skill, undefined, { ...options, showDt: false });
  await rollTest({
    ...test,
    actor,
    label: `${test.attrLabel} + ${test.skillLabel} · ${t('DESORDEM.Oposto.Titulo')}`,
    rollMode: 'publicroll',
    opostoFlag: { cardId: message.id, lado: side, actorUuid: actor.uuid, skill },
  });
}

/** O mestre (ou o autor do cartão) cancela um cartão ainda aberto. */
async function cancelCard(message) {
  const state = cardState(message);
  if (!canCancel(state) || !message.canUserModify(game.user, 'update')) return;
  const next = { ...state, estado: 'cancelado' };
  await message.update({ content: await renderCard(next), [`flags.${SYSTEM_ID}.oposto`]: next });
}

/** Empate: o mestre (ou o autor) abre um cartão novo com os mesmos lados e marca este como repetido. */
async function repeatCard(message) {
  const state = cardState(message);
  if (state?.estado !== 'empate' || !message.canUserModify(game.user, 'update')) return;
  const fresh = repeatState(state);
  const actor = await foundry.utils.fromUuid(state.a.actorUuid);
  await postMessage({
    actor,
    content: await renderCard(fresh),
    flags: { oposto: fresh },
    rollMode: 'publicroll',
  });
  const old = { ...state, estado: 'repetido' };
  await message.update({ content: await renderCard(old), [`flags.${SYSTEM_ID}.oposto`]: old });
}

/** Cria um botão do cartão que chama `action` uma vez por vez (sem duplo clique). */
function cardButton(message, key, label, iconName, action) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'desordem-oposto__botao';
  const icon = document.createElement('i');
  icon.className = `fa-solid ${iconName}`;
  icon.setAttribute('aria-hidden', 'true');
  button.append(icon, document.createTextNode(` ${label}`));
  button.addEventListener('click', async (event) => {
    event.preventDefault();
    const lock = `${message.id}:${key}`;
    if (inFlight.has(lock)) return;
    inFlight.add(lock);
    button.disabled = true;
    try {
      await action(event);
    } finally {
      inFlight.delete(lock);
      button.disabled = false;
    }
  });
  return button;
}

/** Este usuário pode rolar pelo lado (dono do ator fixado, ou tem quem aceite o lado aberto)? */
function userCanRoll(state, side) {
  const data = state[side];
  if (data.testId || state.estado !== 'aberto') return false;
  if (data.actorUuid) {
    const actor = foundry.utils.fromUuidSync(data.actorUuid);
    return Boolean(actor?.isOwner);
  }
  return candidateActors(state[side === 'a' ? 'b' : 'a'].actorUuid).length > 0;
}

/** Hook renderChatMessageHTML: põe os botões do cartão (rolar, aceitar, cancelar, repetir). */
export function renderOpposedCard(message, html) {
  const state = cardState(message);
  if (!state || !message.isContentVisible) return;
  for (const side of ['a', 'b']) {
    const slot = html.querySelector(`[data-oposto-acoes="${side}"]`);
    if (!slot || !userCanRoll(state, side)) continue;
    const accept = !state[side].actorUuid;
    slot.append(
      cardButton(
        message,
        side,
        t(accept ? 'DESORDEM.Oposto.Aceitar' : 'DESORDEM.Oposto.Rolar'),
        accept ? 'fa-hand' : 'fa-dice-d20',
        (event) => rollSide(message, side, event),
      ),
    );
  }
  const footer = html.querySelector('[data-oposto-rodape]');
  if (!footer || !message.canUserModify(game.user, 'update')) return;
  if (canCancel(state)) {
    footer.append(
      cardButton(message, 'cancelar', t('DESORDEM.Oposto.Cancelar'), 'fa-xmark', () =>
        cancelCard(message),
      ),
    );
  }
  if (state.estado === 'empate') {
    footer.append(
      cardButton(message, 'repetir', t('DESORDEM.Oposto.Repetir'), 'fa-rotate', () =>
        repeatCard(message),
      ),
    );
  }
}

/** Resultado atual de um teste (lido das flags da mensagem, já com análise e repetições). */
function testResult(message) {
  const data = message?.flags?.[SYSTEM_ID]?.teste;
  if (!data?.plan || !Array.isArray(data.values)) return null;
  return resolveWithValues(data.plan, data.values);
}

/**
 * Compara os dois lados (se ambos rolaram) e grava o cartão. Na primeira vez que o cartão tem um
 * perdedor, enche o ímpeto dele (se tiver a habilidade), como no teste oposto pela API.
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
    if (actor && hasAbility(actor, 'impeto')) {
      await actor.update({ 'system.recursos.impeto': addImpeto(actor.system.recursos.impeto) });
    }
    next = { ...next, impetoAplicado: true };
  }
  await card.update({ content: await renderCard(next), [`flags.${SYSTEM_ID}.oposto`]: next });
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
  const next = registerSide(state, flag.lado, {
    actorUuid: actor.uuid,
    nome: actor.name,
    skill: flag.skill,
    skillLabel: display.skillLabel ?? '',
    testId: test.id,
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

/** Fila do mestre: cada gravação espera a anterior (dois testes ao mesmo tempo não se perdem). */
let queue = Promise.resolve();
function enqueue(task) {
  queue = queue.then(task).catch((error) => console.error(`${SYSTEM_ID} | teste oposto`, error));
  return queue;
}

const isActiveGM = () => game.users.activeGM?.id === game.user.id;

/** Registra os hooks do mestre (chamar uma vez, no `init`). */
export function registerOpposedHooks() {
  Hooks.on('createChatMessage', (message) => {
    if (isActiveGM() && answerFlag(message)) enqueue(() => registerAnswer(message));
  });
  Hooks.on('updateChatMessage', (message, changes) => {
    if (!isActiveGM() || !answerFlag(message)) return;
    if (!changes?.flags?.[SYSTEM_ID]?.teste) return;
    enqueue(() => refreshAnswer(message));
  });
}
