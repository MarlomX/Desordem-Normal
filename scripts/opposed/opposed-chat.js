/* global document */
/**
 * Teste oposto iniciado pela ficha (Foundry). A lógica do cartão fica em `rolls/opposed-card.js`
 * e as regras de comparação em `rolls/opposed-rules.js`.
 *
 * 1. «Teste oposto» na ficha: a pessoa escolhe o tipo (perícia, corpo a corpo, atacar contra uma
 *    defesa ou defender-se) e o seu lado (perícia, arma ou defesa). Com um token mirado, ele é o
 *    oponente. Sai no chat um cartão sem rolagem.
 * 2. Cada lado clica em «Rolar» (ou «Aceitar», se o oponente ainda está em aberto), passa pela
 *    janela pré-teste e rola um teste comum, público, com a marca `respostaOposto`.
 * 3. O mestre ativo vê o teste chegar (hook `createChatMessage`), confere que quem rolou é dono do
 *    ator e registra o teste no cartão. Com os dois lados, compara e mostra o resultado. Se um dos
 *    testes mudar depois (análise, repetir dado), o cartão é recalculado (`updateChatMessage`).
 * 4. Nos cartões de combate, cada acerto ganha o botão «Aplicar dano», de uso único, para o dono
 *    do alvo (ou o mestre). O mestre reserva o botão para quem clicou e só então o dano é aplicado,
 *    no navegador de quem clicou (é lá que aparecem a pergunta da armadura e o teste de lesão).
 */
import { SYSTEM_ID } from '../config.js';
import { postMessage, render, skillName, skillTestOptions, rollTest } from '../rolls/chat.js';
import { askRollChoices } from '../rolls/roll-dialog-chat.js';
import { addImpeto, hasAbility, resolveWithValues } from '../rolls/abilities.js';
import { weaponDamageLabel, weaponSkill } from '../rolls/equipment.js';
import { weaponCompanionDice } from '../rolls/equipment-chat.js';
import { abilityNote } from '../rolls/abilities-chat.js';
import { damageActor } from '../rolls/health.js';
import {
  buildOpposedCardContext,
  bothRolled,
  canCancel,
  canRollSide,
  cardType,
  createOpposedState,
  defenseChoices,
  loserSide,
  markDamage,
  opposedSkillChoices,
  registerSide,
  repeatState,
  resolveState,
  weaponChoices,
} from '../rolls/opposed-card.js';

const TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/oposto-cartao.hbs`;
const TEMPLATE_DIALOG = `systems/${SYSTEM_ID}/templates/dialog/oposto.hbs`;
const SOCKET = `system.${SYSTEM_ID}`;
const ACTOR_TYPES = ['personagem', 'criatura'];

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

/** Estado do cartão guardado na mensagem (ou null, se a mensagem não é um cartão de oposto). */
const cardState = (message) => message?.flags?.[SYSTEM_ID]?.oposto ?? null;

/** Marca do teste que responde a um cartão. */
const answerFlag = (message) => message?.flags?.[SYSTEM_ID]?.respostaOposto ?? null;

const otherSide = (side) => (side === 'a' ? 'b' : 'a');

/** HTML do cartão para um estado. */
function renderCard(state) {
  const context = buildOpposedCardContext(state);
  return render(TEMPLATE, { ...context, lados: [context.a, context.b] });
}

/** Perícias que o ator pode usar na disputa simples (para os seletores das janelas). */
function skillChoicesFor(actor) {
  return opposedSkillChoices(actor.system, {
    skill: (key) => t(`DESORDEM.Pericias.${key}`),
    aptitude: (key) => `${t('DESORDEM.Ficha.Aptidoes')}: ${t(`DESORDEM.Aptidoes.${key}`)}`,
    craft: (key) => `${t('DESORDEM.Ficha.Oficios')}: ${t(`DESORDEM.Oficios.${key}`)}`,
    extra: (group, name) => name || t(`DESORDEM.Ficha.ExtraSemNome.${group}`),
  });
}

/** Armas do ator que servem para o cartão, com «Luta, RA+2» no rótulo. */
function weaponsFor(actor, tipo) {
  const items = actor.items.map((item) => ({
    id: item.id,
    name: item.name,
    type: item.type,
    system: item.system,
  }));
  return weaponChoices(items, tipo).map((weapon) => ({
    ...weapon,
    label: `${t(`DESORDEM.Pericias.${weaponSkill(weapon)}`)}, ${weaponDamageLabel(weapon.bonusDano, weapon.baseDano)}`,
  }));
}

/** Opções de Defender-se (Luta só contra corpo a corpo). */
function defenseSkillsFor(attackWeapon) {
  return defenseChoices(attackWeapon).map(({ key, soCorpo }) => ({
    key,
    label: soCorpo
      ? t('DESORDEM.Oposto.DefesaSoCorpo', { pericia: t(`DESORDEM.Pericias.${key}`) })
      : t('DESORDEM.Oposto.DefesaCom', { pericia: t(`DESORDEM.Pericias.${key}`) }),
  }));
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
 * Janela de escolha (proposta ou resposta). Devolve os valores do formulário ou null.
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
            weapon: fields.weapon?.value ?? '',
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

/** Primeiro passo da proposta: o tipo de disputa (devolve o nome do botão, ou null). */
async function askMode(actor) {
  const mode = await foundry.applications.api.DialogV2.wait({
    window: { title: t('DESORDEM.Oposto.ProporTitulo') },
    classes: ['desordem-normal', 'desordem-oposto-janela', 'desordem-oposto-modos'],
    content: `<p class="desordem-ficha__dica">${t('DESORDEM.Oposto.EscolhaTipo', {
      nome: Handlebars.escapeExpression(actor.name),
    })}</p>`,
    modal: true,
    rejectClose: false,
    buttons: [
      {
        action: 'simples',
        label: t('DESORDEM.Oposto.Modo.simples'),
        icon: 'fa-solid fa-scale-balanced',
      },
      { action: 'corpo', label: t('DESORDEM.Oposto.Modo.corpo'), icon: 'fa-solid fa-hand-fist' },
      { action: 'atacar', label: t('DESORDEM.Oposto.Modo.atacar'), icon: 'fa-solid fa-crosshairs' },
      { action: 'defender', label: t('DESORDEM.Oposto.Modo.defender'), icon: 'fa-solid fa-shield' },
    ],
  });
  return ['simples', 'corpo', 'atacar', 'defender'].includes(mode) ? mode : null;
}

/**
 * Botão «Teste oposto» da ficha: escolhe o tipo, o seu lado e uma descrição curta, e publica o
 * cartão. Com um token mirado de outro ator, ele vira o oponente.
 * @param {Actor} actor
 */
export async function proposeOpposed(actor) {
  const mode = await askMode(actor);
  if (!mode) return null;
  const tipo = mode === 'atacar' || mode === 'defender' ? 'defesa' : mode;
  const opponent = targetedOpponent(actor);
  const base = {
    showDescription: true,
    opponentName: opponent?.name ?? '',
    confirmar: t('DESORDEM.Oposto.Propor'),
  };
  let side;
  if (mode === 'simples') {
    const skills = skillChoicesFor(actor);
    const answer = await askChoices(t('DESORDEM.Oposto.Modo.simples'), {
      ...base,
      skills,
      showSkill: true,
    });
    if (!answer || !skills.some((choice) => choice.key === answer.skill)) return null;
    side = { papel: 'pericia', skill: answer.skill, descricao: answer.descricao };
  } else if (mode === 'defender') {
    const skills = defenseSkillsFor(null);
    const answer = await askChoices(t('DESORDEM.Oposto.Modo.defender'), {
      ...base,
      skills,
      showSkill: true,
      note: t('DESORDEM.Oposto.DicaDefesa'),
    });
    if (!answer || !skills.some((choice) => choice.key === answer.skill)) return null;
    side = { papel: 'defesa', skill: answer.skill, descricao: answer.descricao };
  } else {
    const weapons = weaponsFor(actor, tipo);
    if (!weapons.length) {
      ui.notifications.warn(
        t(tipo === 'corpo' ? 'DESORDEM.Oposto.SemArmaCorpo' : 'DESORDEM.Oposto.SemArma'),
      );
      return null;
    }
    const answer = await askChoices(t(`DESORDEM.Oposto.Modo.${mode}`), {
      ...base,
      weapons,
      showWeapon: true,
    });
    const arma = weapons.find((weapon) => weapon.id === answer?.weapon);
    if (!arma) return null;
    side = { papel: 'ataque', skill: weaponSkill(arma), arma, descricao: answer.descricao };
  }
  const state = createOpposedState({
    tipo,
    a: {
      actorUuid: actor.uuid,
      nome: actor.name,
      papel: side.papel,
      skill: side.skill,
      skillLabel: skillName(side.skill, actor),
      arma: side.arma ?? null,
    },
    b: opponent ? { actorUuid: opponent.uuid, nome: opponent.name } : {},
    descricao: side.descricao,
  });
  return postMessage({
    actor,
    content: await renderCard(state),
    flags: { oposto: state },
    rollMode: 'publicroll',
  });
}

/** Cliques em andamento neste navegador (mensagem + botão), contra o duplo clique. */
const inFlight = new Set();

/** Escolhe o ator de um lado em aberto (pergunta só se houver mais de um candidato). */
async function pickActor(state, side) {
  const candidates = candidateActors(state[otherSide(side)].actorUuid);
  if (!candidates.length) {
    ui.notifications.warn(t('DESORDEM.Oposto.SemCandidatos'));
    return null;
  }
  if (candidates.length === 1) return candidates[0];
  const answer = await askChoices(t('DESORDEM.Oposto.AceitarTitulo'), {
    actors: candidates.map((actor) => ({ uuid: actor.uuid, name: actor.name })),
    showActor: true,
    opponentName: state[otherSide(side)].nome,
    confirmar: t('DESORDEM.Oposto.Continuar'),
  });
  return candidates.find((actor) => actor.uuid === answer?.actor) ?? null;
}

/**
 * O que o lado vai usar no teste: a escolha já feita na proposta ou, se faltar, uma janela com a
 * perícia (simples), a arma (ataque) ou a defesa. Devolve {skill, arma} ou null.
 */
async function pickChoice(state, side, actor) {
  const data = state[side];
  const opponent = state[otherSide(side)];
  const tipo = cardType(state);
  if (data.papel === 'ataque') {
    if (data.arma) {
      const item = actor.items.get(data.arma.id);
      return item ? { skill: data.skill, arma: data.arma } : null;
    }
    const weapons = weaponsFor(actor, tipo);
    if (!weapons.length) {
      ui.notifications.warn(
        t(tipo === 'corpo' ? 'DESORDEM.Oposto.SemArmaCorpo' : 'DESORDEM.Oposto.SemArma'),
      );
      return null;
    }
    const answer = await askChoices(t('DESORDEM.Oposto.AceitarTitulo'), {
      weapons,
      showWeapon: true,
      opponentName: opponent.nome,
      note:
        opponent.papel === 'defesa' && opponent.skill === 'luta'
          ? t('DESORDEM.Oposto.DicaLuta')
          : '',
      confirmar: t('DESORDEM.Oposto.Rolar'),
    });
    const arma = weapons.find((weapon) => weapon.id === answer?.weapon);
    return arma ? { skill: weaponSkill(arma), arma } : null;
  }
  if (data.skill) return { skill: data.skill, arma: null };
  const skills =
    data.papel === 'defesa'
      ? defenseSkillsFor(opponent.arma)
      : skillChoicesFor(actor).map((choice) => ({
          ...choice,
          selected: choice.key === opponent.skill,
        }));
  const answer = await askChoices(t('DESORDEM.Oposto.AceitarTitulo'), {
    skills,
    showSkill: true,
    opponentName: opponent.nome,
    confirmar: t('DESORDEM.Oposto.Rolar'),
  });
  if (!answer || !skills.some((choice) => choice.key === answer.skill)) return null;
  return { skill: answer.skill, arma: null };
}

/**
 * Rola um lado do cartão: escolhe o ator (lado em aberto) e o que ele usa, passa pela janela
 * pré-teste e publica o teste comum com a marca do cartão. Ataque: perícia da arma (com o dado
 * do companheiro animal, como no ataque comum); Defender-se: a perícia + d6.
 */
async function rollSide(message, side, event) {
  const state = cardState(message);
  const data = state?.[side];
  if (!data) return;
  const actor = data.actorUuid
    ? await foundry.utils.fromUuid(data.actorUuid)
    : await pickActor(state, side);
  if (!actor) return;
  if (!actor.isOwner || !canRollSide(state, side, actor.uuid)) {
    ui.notifications.warn(t('DESORDEM.Oposto.SemPermissao'));
    return;
  }
  const choice = await pickChoice(state, side, actor);
  if (!choice) return;
  const { skill, arma } = choice;

  // Defender-se: o +d6 aparece na janela pré-teste já marcado (desmarcar = esquiva sem o dado)
  const allowDefense = data.papel === 'defesa';
  const options = await askRollChoices(actor, {
    skillKey: skill,
    showDt: false,
    allowDefense,
    shift: event?.shiftKey,
  });
  if (!options) return;
  const weapon = arma ? actor.items.get(arma.id) : null;
  const companion = weapon ? weaponCompanionDice(actor, weapon) : [];
  const test = skillTestOptions(actor, skill, undefined, {
    ...options,
    showDt: false,
    allowDefense,
    extraDice: [...companion, ...(options.extraDice ?? [])],
  });
  const what =
    data.papel === 'ataque'
      ? weapon.name
      : data.papel === 'defesa'
        ? t('DESORDEM.Oposto.Defender')
        : `${test.attrLabel} + ${test.skillLabel}`;
  const result = await rollTest({
    ...test,
    actor,
    label: `${what} · ${t('DESORDEM.Oposto.Titulo')}`,
    rollMode: 'publicroll',
    opostoFlag: {
      cardId: message.id,
      lado: side,
      actorUuid: actor.uuid,
      skill,
      armaId: arma?.id ?? '',
    },
  });
  // Companheiro animal: o primeiro dado extra em 1 fere o animal (como no ataque comum)
  if (companion.length && result?.dice?.[2]?.source === 'extra' && result.dice[2].value === 1) {
    await actor.update({ 'system.cena.animalFerido': true });
    await abilityNote(actor, t('DESORDEM.Habilidade.AnimalFerido'));
  }
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

/** Danos que este navegador pediu e ainda não aplicou (chave: mensagem + lado). */
const damageRequests = new Set();

/** Aplica o dano reservado para este usuário (no alvo, com a pergunta da armadura e a lesão). */
async function applyReservedDamage(message, side) {
  const state = cardState(message);
  const entry = state?.dano?.[side];
  const target = await foundry.utils.fromUuid(state?.[otherSide(side)]?.actorUuid ?? '');
  if (!entry || !target?.isOwner) return;
  await damageActor(target, entry.valor, { nonLethal: entry.naoLetal });
}

/**
 * Clique em «Aplicar dano»: quem pode editar o cartão marca e aplica na hora; os outros pedem ao
 * mestre, que reserva o dano para quem pediu (o hook de atualização aplica em seguida).
 */
async function requestDamage(message, side) {
  const state = cardState(message);
  const target = foundry.utils.fromUuidSync(state?.[otherSide(side)]?.actorUuid ?? '');
  if (!target?.isOwner || state?.dano?.[side]?.estado !== 'pendente') return;
  if (message.canUserModify(game.user, 'update')) {
    const next = markDamage(state, side, game.user.id);
    if (!next) return;
    await message.update({ content: await renderCard(next), [`flags.${SYSTEM_ID}.oposto`]: next });
    await applyReservedDamage(message, side);
    return;
  }
  damageRequests.add(`${message.id}:${side}`);
  game.socket.emit(SOCKET, {
    action: 'opposedDamage',
    messageId: message.id,
    side,
    userId: game.user.id,
  });
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
  return candidateActors(state[otherSide(side)].actorUuid).length > 0;
}

/** Hook renderChatMessageHTML: põe os botões do cartão (rolar, aceitar, dano, cancelar, repetir). */
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
  // Dano: só para o dono do alvo (o mestre, nas criaturas), enquanto pendente
  for (const side of ['a', 'b']) {
    const slot = html.querySelector(`[data-oposto-dano="${side}"]`);
    const entry = state.dano?.[side];
    if (!slot || entry?.estado !== 'pendente') continue;
    const target = foundry.utils.fromUuidSync(state[otherSide(side)].actorUuid);
    if (!target?.isOwner) continue;
    slot.append(
      cardButton(
        message,
        `dano-${side}`,
        t('DESORDEM.Oposto.AplicarDano', { valor: entry.valor, nome: target.name }),
        'fa-heart-crack',
        () => requestDamage(message, side),
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

/** Arma do teste, lida do próprio ator (nunca do pedido), no formato do cartão. */
function weaponOf(actor, armaId) {
  const item = armaId ? actor.items.get(armaId) : null;
  if (item?.type !== 'arma') return null;
  return {
    id: item.id,
    nome: item.name,
    bonusDano: item.system.bonusDano,
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
  const next = registerSide(state, flag.lado, {
    actorUuid: actor.uuid,
    nome: actor.name,
    skill: flag.skill,
    skillLabel: display.skillLabel ?? '',
    arma: weaponOf(actor, flag.armaId),
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

/**
 * Pedido de dano de um jogador: o mestre confere que ele é dono do alvo e que o dano ainda está
 * pendente, e reserva o dano para ele (o navegador dele aplica ao ver a reserva).
 */
async function reserveDamage({ messageId, side, userId }) {
  const card = game.messages.get(messageId);
  const state = cardState(card);
  const user = game.users.get(userId);
  if (!state || !user || !['a', 'b'].includes(side)) return;
  const target = await foundry.utils.fromUuid(state[otherSide(side)]?.actorUuid ?? '');
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

const isActiveGM = () => game.users.activeGM?.id === game.user.id;

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
      damageRequests.delete(key);
      if (entry.por === game.user.id) applyReservedDamage(message, side);
    }
    if (!isActiveGM() || !answerFlag(message)) return;
    if (!changes?.flags?.[SYSTEM_ID]?.teste) return;
    enqueue(() => refreshAnswer(message));
  });
  Hooks.once('ready', () => {
    game.socket.on(SOCKET, (data) => {
      if (data?.action !== 'opposedDamage' || !isActiveGM()) return;
      enqueue(() => reserveDamage(data));
    });
  });
}
