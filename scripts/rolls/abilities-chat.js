/**
 * Ligação ao Foundry das habilidades: ímpeto, análise, repetir dado, esquiva, cura, ativações para
 * o próximo teste e reinício de cena. Os botões de análise e de repetir dado aparecem nos cartões
 * de teste, só para quem pode usá-los.
 */
import { SYSTEM_ID, ATRIBUTOS, PERICIAS, APTIDOES } from '../config.js';
import { describeEffect } from './ability-effects-editor.js';
import { render, postMessage, rebuildTest, rollTest, skillTestOptions } from './chat.js';
import { startGroupDice } from './bonus-dice-chat.js';
import { adjustLabel, resourceName } from '../sheets/ability-controls.js';
import { applyAnalysis, rerollCandidates, replaceDie, sceneReset } from './abilities.js';
import { newStepEffect } from './effects.js';
import {
  canPay,
  conditionFlips,
  effectsOfType,
  fromAbility,
  payUpdates,
  sceneResources,
  syncConditionalEffects,
} from './ability-effects.js';
import {
  actorEffects,
  actorResources,
  adjustResource,
  effectById,
  findEffect,
  firstEffect,
  resourceUpdates,
  roundUseUpdate,
  rerollActors,
  resourceChanges,
  GAINS_HOOK,
  triggerUpdates,
  usableThisRound,
  walletOf,
} from './ability-effects-actor.js';
import { createPending } from './pending-table.js';
import { disasterSync } from './critical-failure.js';

const TEMPLATE_HABILIDADE = `systems/${SYSTEM_ID}/templates/chat/habilidade.hbs`;
const TEMPLATE_CURA = `systems/${SYSTEM_ID}/templates/chat/cura.hbs`;
const SOCKET = `system.${SYSTEM_ID}`;

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const warn = (key, data) => ui.notifications.warn(t(key, data));

/**
 * Aviso de habilidade no chat. O personagem já aparece no cabeçalho da mensagem; o título do
 * cartão é o nome da habilidade (sem ele, o nome do personagem), e abaixo vem o resumo do efeito
 * usado, se houver.
 * @param {Actor} actor
 * @param {Object} note
 * @param {string} [note.title] Nome da habilidade.
 * @param {string} note.text O que aconteceu («rola de novo o d6: 3 → 1.»).
 * @param {string} [note.detail] Linha extra (ex.: «3/4»).
 * @param {object} [note.entry] Efeito usado: o cartão mostra o resumo dele.
 * @param {Roll[]} [note.rolls]
 */
export async function abilityNote(
  actor,
  { title = '', text, detail = '', entry = null, rolls = [] },
) {
  const effect = entry ? describeEffect(entry, { t, skill: skillName }) : '';
  return postMessage({
    actor,
    content: await render(TEMPLATE_HABILIDADE, {
      title: title || entry?.itemName || actor.name,
      text,
      detail,
      effect,
    }),
    rolls,
  });
}

/** Nome de uma perícia ou de uma área de Aptidão (resumos dos efeitos). */
export function skillName(key) {
  if (PERICIAS[key]) return t(`DESORDEM.Pericias.${key}`);
  if (APTIDOES.includes(key)) {
    return `${t('DESORDEM.Ficha.Aptidoes')}: ${t(`DESORDEM.Aptidoes.${key}`)}`;
  }
  return key;
}

/** Diálogo simples com um campo; devolve o valor escolhido ou null se for cancelado. */
async function ask({ title, content, read }) {
  return foundry.applications.api.DialogV2.prompt({
    window: { title },
    content,
    ok: {
      label: t('DESORDEM.Habilidade.Confirmar'),
      callback: (event, button) => read(button.form),
    },
    rejectClose: false,
    modal: true,
  });
}

// ---------- Botões das habilidades ----------

/** Efeitos das habilidades antigas, pelo id fixo: avisos e textos de antes. */
const LEGACY = Object.freeze({
  passo: 'impetoPasso',
  acao: 'impetoAcao',
  ganho: 'analisar',
  cura: 'curandeiro',
});

/** Aviso de custo que não dá para pagar: o das habilidades antigas ou o genérico. */
function warnCost(entry, legacyKey) {
  if (legacyKey) return warn(legacyKey);
  return warn('DESORDEM.Efeito.Aviso.SemCusto', { nome: entry.itemName });
}

/**
 * Usa o efeito de um botão da aba Habilidades (a defesa livre é tratada na ficha, porque passa
 * pela janela pré-teste).
 * @param {Actor} actor
 * @param {string} itemId
 * @param {string} effectId
 */
export async function useAbilityEffect(actor, itemId, effectId) {
  const entry = effectById(actor, itemId, effectId);
  if (!entry) return undefined;
  switch (entry.tipo) {
    case 'passoCena':
      return impetoStep(actor, itemId, effectId);
    case 'acaoNota':
      return impetoAction(actor, itemId, effectId);
    case 'ganharRecurso':
      return gainAnalysisMarkers(actor, itemId, effectId);
    case 'testeAcao':
      return entry.params.resultado === 'curarPV'
        ? healAlly(actor, itemId, effectId)
        : startGroupDice(actor, entry);
    default:
      return undefined;
  }
}

/**
 * Aumento de passo até o fim da cena (efeito `passoCena`; no ímpeto, 3 espaços para subir um
 * passo um atributo à escolha).
 * @param {Actor} actor
 * @param {string|null} [itemId] Habilidade cujo botão foi clicado (sem ela, a primeira que tiver).
 * @param {string|null} [effectId] Efeito do botão (sem ele, o primeiro do tipo).
 */
export async function impetoStep(actor, itemId = null, effectId = null) {
  const entry = findEffect(actor, 'passoCena', { itemId, effectId });
  if (!entry) return undefined;
  const legacy = entry.id === LEGACY.passo;
  const wallet = walletOf(actor);
  if (!canPay(entry.params.custo, wallet)) {
    return warnCost(entry, legacy && 'DESORDEM.Habilidade.ImpetoInsuficiente');
  }
  let attribute = entry.params.atributo;
  if (!attribute) {
    const options = ATRIBUTOS.map(
      (key) => `<option value="${key}">${t(`DESORDEM.Atributos.${key}`)}</option>`,
    ).join('');
    attribute = await ask({
      title: legacy ? t('DESORDEM.Habilidade.ImpetoPassoTitulo') : entry.itemName,
      content: `<label>${t('DESORDEM.Habilidade.ImpetoPassoEscolha')} <select name="atributo">${options}</select></label>`,
      read: (form) => form.elements.atributo.value,
    });
  }
  if (!attribute) return undefined;
  const { passos } = entry.params;
  // Efeito novo na aba Condição: passos no atributo escolhido até o fim da cena
  const effects = [
    ...actor.toObject().system.efeitos,
    newStepEffect({
      id: foundry.utils.randomID(),
      nome: legacy ? t('DESORDEM.Habilidade.EfeitoImpeto') : entry.itemName,
      descricao: legacy
        ? t('DESORDEM.Habilidade.EfeitoImpetoDescricao')
        : t('DESORDEM.Efeito.Nota.passoDescricao', { passos }),
      atributo: attribute,
      passos,
      duracao: 'cena',
    }),
  ];
  await actor.update({
    ...payUpdates(entry.params.custo, wallet),
    'system.efeitos': effects,
  });
  const atributo = t(`DESORDEM.Atributos.${attribute}`);
  return abilityNote(actor, {
    entry,
    text: legacy
      ? t('DESORDEM.Habilidade.ImpetoPassoTexto', { atributo })
      : t('DESORDEM.Efeito.Nota.passoCena', { atributo, passos }),
  });
}

/**
 * Ação com aviso no chat (efeito `acaoNota`; no ímpeto, 3 espaços para uma ação extra). Só gasta
 * o custo e avisa: a mesa resolve o resto.
 */
export async function impetoAction(actor, itemId = null, effectId = null) {
  const entry = findEffect(actor, 'acaoNota', { itemId, effectId });
  if (!entry) return undefined;
  const legacy = entry.id === LEGACY.acao;
  const wallet = walletOf(actor);
  if (!canPay(entry.params.custo, wallet)) {
    return warnCost(entry, legacy && 'DESORDEM.Habilidade.ImpetoInsuficiente');
  }
  const updates = payUpdates(entry.params.custo, wallet);
  if (Object.keys(updates).length) await actor.update(updates);
  if (entry.params.texto) return abilityNote(actor, { entry, text: entry.params.texto });
  // Sem texto próprio: o aviso da ação extra do ímpeto, ou «é usada»
  return legacy
    ? abilityNote(actor, {
        entry,
        text: t('DESORDEM.Habilidade.ImpetoAcaoTexto'),
        detail: t('DESORDEM.Habilidade.ImpetoAcaoDetalhe'),
      })
    : abilityNote(actor, { entry, text: t('DESORDEM.Efeito.Nota.acaoNota') });
}

// ---------- Análise ----------

/**
 * Gasta uma ação para ganhar num recurso (efeito `ganharRecurso` com gatilho «ação»; na análise,
 * 2 marcadores, até 4).
 */
export async function gainAnalysisMarkers(actor, itemId = null, effectId = null) {
  const gain = findEffect(actor, 'ganharRecurso', {
    itemId,
    effectId,
    test: (params) => params.gatilho === 'acao',
  });
  if (!gain) return undefined;
  const entries = actorEffects(actor);
  const { defs, values } = actorResources(actor, entries);
  const chave = gain.params.recurso;
  if (!defs[chave]) return undefined;
  // Só o ganho deste efeito (não os outros ganhos por ação da mesma habilidade)
  const after = Math.min(defs[chave].maximo, values[chave] + gain.params.quantidade);
  await actor.update(resourceUpdates({ [chave]: after }));
  const valor = after - values[chave];
  return abilityNote(actor, {
    entry: gain,
    text:
      gain.id === LEGACY.ganho
        ? t('DESORDEM.Habilidade.AnaliseGanha', { valor })
        : t('DESORDEM.Efeito.Nota.ganho', {
            valor,
            recurso: resourceName(defs[chave], t),
          }),
    detail: `${after}/${defs[chave].maximo}`,
  });
}

// ---------- Esquiva ----------

/**
 * Teste da esquiva (efeito `defesaLivre`; livre, oposto ao ataque; a mesa compara).
 * @param {Actor} actor
 * @param {Object} [options] Escolhas da janela pré-teste.
 * @param {string} [skill] Perícia do efeito (sem ela, a do primeiro efeito de defesa livre).
 * @param {string} [name] Nome da habilidade (título da rolagem; sem ele, «Esquiva»).
 */
export function rollDodge(actor, options = {}, skill = null, name = '') {
  const dodge = firstEffect(actor, 'defesaLivre');
  const key = skill || dodge?.params.pericia || 'acrobacia';
  const title = name || dodge?.itemName || t('DESORDEM.Habilidade.EsquivaTitulo');
  return rollTest({
    ...skillTestOptions(actor, key, undefined, {
      ...options,
      showDt: false,
      label: `${actor.name}: ${title}`,
    }),
    actor,
  });
}

// ---------- Cura de aliado ----------

/**
 * Cura um aliado (efeito `testeAcao` que cura PV; o alvo é o token mirado): gasta o custo e faz o
 * teste (Medicina DT 7 no curandeiro; aceita também uma área de Aptidão); se passar, o cartão traz
 * o botão de recuperar PV (igual à rolagem alta, somando as duas maiores em crítico) que o aliado
 * clica. Com «uma vez por alvo», cada aliado só pode ser curado uma vez por cena.
 */
export async function healAlly(actor, itemId = null, effectId = null) {
  const entry = findEffect(actor, 'testeAcao', {
    itemId,
    effectId,
    test: (params) => params.resultado === 'curarPV',
  });
  if (!entry) return undefined;
  const { custo, pericia, dt, umaVezPorAlvo } = entry.params;
  const target = [...game.user.targets][0]?.actor;
  if (!target) return warn('DESORDEM.Habilidade.CuraSemAlvo');
  if (target.id === actor.id) return warn('DESORDEM.Habilidade.CuraEmSi');
  if (umaVezPorAlvo && actor.system.cena.curados.includes(target.id)) {
    return warn('DESORDEM.Habilidade.CuraJaCurou', { nome: target.name });
  }
  const wallet = walletOf(actor);
  if (!canPay(custo, wallet)) {
    return warnCost(entry, entry.id === LEGACY.cura && 'DESORDEM.Habilidade.CuraSemPD');
  }
  await actor.update({
    ...payUpdates(custo, wallet),
    ...(umaVezPorAlvo
      ? { 'system.cena.curados': [...actor.toObject().system.cena.curados, target.id] }
      : {}),
  });
  const result = await rollTest({ ...skillTestOptions(actor, pericia, undefined, { dt }), actor });
  if (!result.success) return result;
  await postMessage({
    actor,
    content: await render(TEMPLATE_CURA, {
      actorName: actor.name,
      alvo: target.name,
      total: result.highSum,
      resourceLabel: t('DESORDEM.Ficha.PV'),
    }),
    flags: {
      recuperacao: { recurso: 'pv', total: result.highSum, curado: false, alvoUuid: target.uuid },
    },
  });
  return result;
}

// ---------- Início do combate ----------

/**
 * Ganhos de «início do combate» (efeitos `ganharRecurso`): quando um combate começa, o mestre
 * que o iniciou soma os ganhos de cada personagem do encontro (uma vez por ator) e zera o
 * marcador das armas que já atacaram na cena.
 * @param {Combat} combat
 */
export async function combatStartGains(combat) {
  if (!game.user.isGM) return;
  const seen = new Set();
  for (const combatant of combat?.combatants ?? []) {
    const actor = combatant.actor;
    if (!actor || seen.has(actor.uuid)) continue;
    seen.add(actor.uuid);
    const before = actorResources(actor).values;
    const updates = triggerUpdates(actor, 'inicioCombate');
    // O combate começa: o próximo ataque de cada arma volta a ser o «primeiro» (efeito passoAtaque)
    const reset = actor.system.cena?.armasAtacaram?.length
      ? { 'system.cena.armasAtacaram': [] }
      : {};
    if (!Object.keys(updates).length && !Object.keys(reset).length) continue;
    await actor.update({ ...updates, ...reset });
    if (Object.keys(updates).length) {
      await announceGains(actor, before, resourceChanges(updates), 'inicioCombate');
    }
  }
}

/**
 * Avisa no chat cada ganho automático de recurso: «Ímpeto +1 ao falhar um teste com DT (3/5)».
 * @param {Actor} actor
 * @param {Object<string, number>} before Valores antes do ganho.
 * @param {Object<string, number>} changes Valores novos (só os que mudaram).
 * @param {string} trigger Gatilho (falha, perdeOposto, defender, inicioCena, inicioCombate).
 */
export async function announceGains(actor, before, changes, trigger) {
  const { defs } = actorResources(actor);
  for (const [chave, value] of Object.entries(changes)) {
    const gained = value - (before[chave] ?? 0);
    if (!defs[chave] || gained <= 0) continue;
    await abilityNote(actor, {
      title: resourceName(defs[chave], t),
      text: t('DESORDEM.Efeito.Nota.ganhoGatilho', {
        n: gained,
        quando: t(`DESORDEM.Efeito.Resumo.Quando.${trigger}`),
      }),
      detail: `${value}/${defs[chave].maximo}`,
    });
  }
}

/** PV e PD atuais e máximos de um ator (condições dos passos condicionais). */
const conditionState = (actor) => ({
  pv: actor.system.pv?.value ?? 0,
  pvMax: actor.system.pv?.max ?? 0,
  pd: actor.system.pd?.value ?? 0,
  pdMax: actor.system.pd?.max ?? 0,
});

/** Nome do atributo de um passo condicional («todos os atributos» ou um só). */
const stepAttributeName = (atributo) =>
  !atributo || atributo === 'todos'
    ? t('DESORDEM.Efeito.TodosAtributos')
    : t(`DESORDEM.Atributos.${atributo}`);

/**
 * Confere os efeitos da aba Condição que os passos condicionais criam: põe o da habilidade cuja
 * condição vale e tira o que deixou de valer (veja `syncConditionalEffects`).
 */
async function syncConditionalSteps(actor) {
  if (actor?.type !== 'personagem' || !actor.isOwner) return;
  const current = actor.toObject().system.efeitos ?? [];
  const next = syncConditionalEffects(current, actorEffects(actor), conditionState(actor));
  if (next) await actor.update({ 'system.efeitos': next });
}

/** A gravação mexeu no PV ou no PD (o que pode ligar ou desligar um passo condicional)? */
const touchesCondition = (changes) =>
  foundry.utils.hasProperty(changes, 'system.pv') ||
  foundry.utils.hasProperty(changes, 'system.pd');

/**
 * Passo condicional: quando o PV (ou o PD) cruza a metade, a habilidade vira um efeito na aba
 * Condição (com o nome dela, passos no dado do atributo) e um cartão avisa; quando deixa de valer,
 * o efeito sai. O estado de antes é guardado no `preUpdateActor`, nas opções da gravação; só quem
 * fez a gravação avisa e grava (para não repetir em cada navegador). Ganhar, editar ou perder a
 * habilidade também confere o efeito.
 */
function registerConditionalSteps() {
  const key = `${SYSTEM_ID}CondicaoAntes`;
  Hooks.on('preUpdateActor', (actor, changes, options) => {
    if (effectsOfType(actorEffects(actor), 'passoCondicional').length) {
      options[key] = conditionState(actor);
    }
  });
  Hooks.on('updateActor', async (actor, changes, options, userId) => {
    if (userId !== game.user.id) return;
    const hasSteps = Boolean(options[key]) || (actor.system.efeitos ?? []).some(fromAbility);
    if (!hasSteps || !touchesCondition(changes)) return;
    await syncConditionalSteps(actor);
    if (!options[key]) return;
    for (const { entry, active } of conditionFlips(
      actorEffects(actor),
      options[key],
      conditionState(actor),
    )) {
      const condicao = t(`DESORDEM.Efeito.Condicoes.${entry.params.condicao}`);
      await abilityNote(actor, {
        entry,
        text: active
          ? t('DESORDEM.Efeito.Nota.condicaoAtiva', {
              passos: entry.params.passos,
              atributo: stepAttributeName(entry.params.atributo),
              condicao,
            })
          : t('DESORDEM.Efeito.Nota.condicaoInativa', { condicao }),
      });
    }
  });
  // Habilidade nova, editada ou apagada: confere o efeito de quem a tem
  const onItem = (item, userId) => {
    if (userId !== game.user.id || item.type !== 'habilidade') return;
    syncConditionalSteps(item.parent);
  };
  Hooks.on('createItem', (item, options, userId) => onItem(item, userId));
  Hooks.on('updateItem', (item, changes, options, userId) => onItem(item, userId));
  Hooks.on('deleteItem', (item, options, userId) => onItem(item, userId));
}

/**
 * Registra os hooks das habilidades (chamar uma vez, no `init`): ganhos do início do combate,
 * avisos de ganhos vindos de chat.js e o passo condicional (efeito na aba Condição e aviso).
 */
export function registerAbilityHooks() {
  Hooks.on('combatStart', (combat) => combatStartGains(combat));
  Hooks.on(GAINS_HOOK, (actor, before, changes, trigger) =>
    announceGains(actor, before, changes, trigger),
  );
  registerConditionalSteps();
}

// ---------- Reinício de cena ----------

/**
 * Reinicia a cena: zera contadores, recursos e efeitos "até o fim da cena" e dá 1 PV a quem está
 * com 0. Sem argumento, vale para todos os personagens do mundo que o usuário controla (mestre).
 * @param {Actor|Actor[]} [actors]
 */
export async function endScene(actors) {
  const list = (
    actors ? [actors].flat() : game.actors.filter((a) => a.type === 'personagem')
  ).filter((actor) => actor.isOwner);
  for (const actor of list) {
    // Recursos das habilidades: esvaziam (se o efeito mandar) e recebem os ganhos de início de cena
    const entries = actorEffects(actor);
    const { values } = actorResources(actor, entries);
    const recursos = sceneResources(entries, values);
    await actor.update(
      sceneReset({
        pv: actor.system.pv.value,
        contusao: actor.system.estado.contusao,
        estupor: actor.system.estado.estupor,
        efeitos: actor.toObject().system.efeitos,
        recursos,
      }),
    );
    // Aviso dos ganhos de início de cena (comparados com a barra já esvaziada)
    const emptied = sceneResources(
      entries.filter((e) => !(e.tipo === 'ganharRecurso' && e.params.gatilho === 'inicioCena')),
      values,
    );
    await announceGains(actor, emptied, recursos, 'inicioCena');
  }
  ui.notifications.info(t('DESORDEM.Habilidade.NovaCenaFeita', { n: list.length }));
}

// ---------- Botões nos cartões de teste ----------

const testData = (message) => message.flags?.[SYSTEM_ID]?.teste;

/** Refaz o cartão do teste com os novos valores dos dados e guarda as notas e os usos. */
async function applyRewrite(message, values, patch = {}) {
  const data = testData(message);
  if (!data) return;
  const notes = [...(data.notes ?? []), ...(patch.notes ?? [])];
  const used = { ...data.used, ...patch.used };
  const { result, card } = await rebuildTest({
    plan: data.plan,
    display: data.display,
    values,
    notes,
  });
  const update = {
    content: card,
    [`flags.${SYSTEM_ID}.teste.values`]: values,
    [`flags.${SYSTEM_ID}.teste.notes`]: notes,
    [`flags.${SYSTEM_ID}.teste.used`]: used,
  };
  // A análise e o repetir dado podem criar ou desfazer uma falha crítica
  const sync = disasterSync(message.flags?.[SYSTEM_ID]?.tabela, result.criticalFailure);
  if (sync === 'create') {
    const actor = ChatMessage.getSpeakerActor(message.speaker);
    if (actor)
      update[`flags.${SYSTEM_ID}.tabela`] = createPending({
        kind: 'disaster',
        actorUuid: actor.uuid,
      });
  } else if (sync === 'remove') {
    update[`flags.${SYSTEM_ID}.-=tabela`] = null;
  }
  await message.update(update);
}

/** Aplica a alteração direto, ou pede ao mestre ativo (socket) se o usuário não puder editar. */
async function requestRewrite(message, values, patch) {
  if (message.canUserModify(game.user, 'update')) return applyRewrite(message, values, patch);
  return game.socket.emit(SOCKET, { action: 'rewriteTest', messageId: message.id, values, patch });
}

/** Os valores pedidos cabem nos dados do cartão (o dado de pavor, no fim, não muda)? */
function validValues(data, values) {
  if (!Array.isArray(values) || values.length !== data.values.length) return false;
  return values.every((value, i) =>
    i < data.sides.length
      ? Number.isInteger(value) && value >= 1 && value <= data.sides[i]
      : value === data.values[i],
  );
}

/** Só aceita do socket o que as habilidades realmente enviam. */
function cleanPatch(patch = {}) {
  return {
    used: patch.used?.prontidao === true ? { prontidao: true } : {},
    notes: (Array.isArray(patch.notes) ? patch.notes : [])
      .slice(0, 3)
      .map((note) => String(note).slice(0, 200)),
  };
}

/** Escuta os pedidos de alteração de cartões (só o mestre ativo atende). */
export function registerAbilitySocket() {
  game.socket.on(SOCKET, async (data) => {
    if (data?.action !== 'rewriteTest') return;
    if (game.users.activeGM?.id !== game.user.id) return;
    const message = game.messages.get(data.messageId);
    const info = message && testData(message);
    if (!info || !validValues(info, data.values)) return;
    await applyRewrite(message, data.values, cleanPatch(data.patch));
  });
}

/** Usa a análise: o jogador escolhe os novos valores dos dados e gasta os marcadores. */
async function useAnalysis(message, actor) {
  const info = testData(message);
  const resource = adjustResource(actor);
  if (!resource) return;
  const points = resource.points;
  const count = info.sides.length;
  const current = info.values.slice(0, count);
  const fields = current
    .map(
      (value, i) =>
        `<label class="desordem-ficha__campo"><span>d${info.sides[i]} (${value})</span><input type="number" name="die${i}" value="${value}" min="1" max="${info.sides[i]}"></label>`,
    )
    .join('');
  const newValues = await ask({
    title: t('DESORDEM.Habilidade.AnaliseTitulo'),
    content: `<p>${t('DESORDEM.Habilidade.AnaliseDica', { pontos: points })}</p>${fields}`,
    read: (form) => current.map((_, i) => Number(form.elements[`die${i}`].value)),
  });
  if (!newValues) return;
  let applied;
  try {
    applied = applyAnalysis({ values: current, sides: info.sides, newValues, points });
  } catch {
    warn('DESORDEM.Habilidade.AnaliseInvalida');
    return;
  }
  if (applied.cost === 0) return;
  await actor.update(resourceUpdates({ [resource.chave]: points - applied.cost }));
  await requestRewrite(message, [...applied.values, ...info.values.slice(count)], {
    notes: [
      t('DESORDEM.Habilidade.AnaliseNota', {
        nome: actor.name,
        habilidade: firstEffect(actor, 'ajusteDados')?.itemName ?? '',
        pontos: applied.cost,
      }),
    ],
  });
}

/**
 * Janela da repetição de dado: escolhe o dado e, se o usuário tiver mais de um personagem pronto
 * para usar, qual deles usa. Também serve ao cartão de equilíbrio.
 * @param {Actor[]} actors Personagens prontos (`rerollActors`), pelo menos um.
 * @param {{index: number, label: string}[]} dice Dados que podem ser rolados de novo.
 * @returns {Promise<{actor: Actor, index: number}|null>} `null` se a janela foi fechada.
 */
export async function askReroll(actors, dice) {
  const option = (value, label) => `<option value="${value}">${label}</option>`;
  const who =
    actors.length > 1
      ? `<label>${t('DESORDEM.Habilidade.ProntidaoQuem')} <select name="ator">${actors
          .map((actor) => option(actor.id, Handlebars.escapeExpression(actor.name)))
          .join('')}</select></label>`
      : '';
  const choice = await ask({
    title: t('DESORDEM.Habilidade.ProntidaoTitulo'),
    content: `${who}<label>${t('DESORDEM.Habilidade.ProntidaoEscolha')} <select name="dado">${dice
      .map((die) => option(die.index, die.label))
      .join('')}</select></label>`,
    read: (form) => ({
      actorId: form.elements.ator?.value ?? actors[0].id,
      index: Number(form.elements.dado.value),
    }),
  });
  if (!choice) return null;
  const actor = actors.find((candidate) => candidate.id === choice.actorId);
  return actor ? { actor, index: choice.index } : null;
}

/** Rótulo do botão da repetição de dado: nome da habilidade e custo (do primeiro pronto). */
export function rerollLabel(actor) {
  const entry = firstEffect(actor, 'rerrolar');
  return t('DESORDEM.Habilidade.ProntidaoBotao', {
    nome: entry?.itemName ?? '',
    custo: entry?.params.custo.valor ?? 0,
  });
}

/**
 * Repetir dado (efeito `rerrolar`; na prontidão, 2 PD): rola de novo um dado do teste cujo
 * resultado não seja 1. Em combate, uma vez por rodada; fora de combate, sem limite.
 * @param {ChatMessage} message Cartão do teste.
 * @param {Actor|null} speaker Quem fez o teste (para a escolha do mestre).
 */
async function useReroll(message, speaker) {
  const info = testData(message);
  // Recalcula na hora do clique: o cartão pode ter sido desenhado numa rodada anterior
  const actors = rerollActors(speaker);
  if (!actors.length) return warn('DESORDEM.Habilidade.ProntidaoIndisponivel');
  const dice = rerollCandidates(info.values, info.sides).map((index) => ({
    index,
    label: `d${info.sides[index]} = ${info.values[index]}`,
  }));
  const choice = await askReroll(actors, dice);
  if (!choice) return;
  const { actor, index } = choice;
  const entries = actorEffects(actor);
  const entry = firstEffect(actor, 'rerrolar', null, entries);
  const wallet = walletOf(actor, entries);
  if (!entry || !usableThisRound(actor, entry) || !canPay(entry.params.custo, wallet)) {
    return warn('DESORDEM.Habilidade.ProntidaoIndisponivel');
  }
  const roll = await new Roll(`1d${info.sides[index]}`).evaluate();
  // Paga o custo e marca o uso nesta rodada (fora de combate, nada é marcado)
  await actor.update({ ...payUpdates(entry.params.custo, wallet), ...roundUseUpdate(entry) });
  const change = { dado: info.sides[index], de: info.values[index], para: roll.total };
  // No chat: «Prontidão rola de novo...»; no cartão do teste: quem usou e qual habilidade
  await abilityNote(actor, {
    entry,
    text: t('DESORDEM.Habilidade.ProntidaoRolou', change),
    rolls: [roll],
  });
  const text = t('DESORDEM.Habilidade.ProntidaoNota', {
    nome: actor.name,
    habilidade: entry.itemName,
    ...change,
  });
  await requestRewrite(message, replaceDie(info.values, index, roll.total), {
    used: { prontidao: true },
    notes: [text],
  });
}

/** Acrescenta um botão à barra de habilidades do cartão. */
function addButton(bar, label, handler) {
  const button = bar.ownerDocument.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', async (event) => {
    event.preventDefault();
    button.disabled = true;
    try {
      await handler();
    } finally {
      button.disabled = false;
    }
  });
  bar.append(button);
}

/** Hook renderChatMessageHTML: mostra "usar análise" e "repetir dado" a quem pode usá-los. */
export function renderTestButtons(message, html) {
  const info = testData(message);
  const container = html.querySelector('.message-content');
  if (!info || !container) return;
  // Rolagem privada de outra pessoa (os «???» do Foundry): sem botões, porque as janelas da
  // Análise e da Prontidão mostram os valores dos dados
  if (!(message.isContentVisible ?? message.visible ?? true)) return;
  const bar = html.ownerDocument.createElement('div');
  bar.className = 'desordem-teste__habilidades';

  const owner = game.actors.get(message.speaker?.actor);
  const adjust = owner?.isOwner ? adjustResource(owner) : null;
  if (adjust && adjust.points > 0) {
    addButton(bar, adjustLabel(adjust, t), () => useAnalysis(message, owner));
  }

  // Repetir dado (Prontidão): um botão só, se algum personagem do usuário estiver pronto para usar
  const ready = rerollActors(owner);
  if (ready.length && rerollCandidates(info.values, info.sides).length > 0) {
    addButton(bar, rerollLabel(ready[0]), () => useReroll(message, owner));
  }

  if (bar.children.length) container.append(bar);
}
