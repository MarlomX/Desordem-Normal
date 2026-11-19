/**
 * Ligação entre a lógica pura dos testes e o Foundry (rolagem de dados e mensagem no chat).
 */
import { SYSTEM_ID, PERICIAS, APTIDOES, OFICIOS } from '../config.js';
import { findExtra } from './extras.js';
import { resolveSkillAttribute } from './attribute.js';
import { sequenceRng } from './dice.js';
import { planDice, resolveTest } from './test.js';
import { canHelp, applyHelp } from './help.js';
import { resolveOpposed } from './opposed.js';
import { buildChatContext, buildOpposedContext } from './presenter.js';
import { lesionModifier, contusionStepMods } from './injury.js';
import { traumaModifier } from './emotional.js';
import { collectStepMods } from './steps.js';
import {
  hasAbility,
  addImpeto,
  impetoFillsOnFailure,
  opposedLoser,
  activeBoosts,
  resolveWithValues,
} from './abilities.js';
import { resolveFearOptions } from './fear.js';
import { createPending } from './pending-table.js';
import { isThreat, testResources } from './threat.js';

const TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/teste.hbs`;
const TEMPLATE_OPOSTO = `systems/${SYSTEM_ID}/templates/chat/oposto.hbs`;

export const render = (template, context) =>
  foundry.applications.handlebars.renderTemplate(template, context);

/**
 * Rola os dados pelo motor do Foundry (assíncrono, respeita a configuração de dados do jogador).
 * Devolve os Rolls, que serão anexados à mensagem (e animados por módulos de dados 3D).
 * @param {number[]} sides
 * @returns {Promise<Roll[]>}
 */
function rollDice(sides) {
  return Promise.all(sides.map((faces) => new Roll(`1d${faces}`).evaluate()));
}

/**
 * Publica uma mensagem de rolagem no chat, respeitando o modo de rolagem. `rollMode` força um modo
 * (por exemplo 'selfroll', só quem rolou vê); sem ele, vale o modo escolhido no chat.
 */
export async function postMessage({ actor, content, rolls = [], flags, rollMode }) {
  const messageData = {
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls,
    sound: rolls.length ? CONFIG.sounds.dice : undefined,
    ...(flags ? { flags: { [SYSTEM_ID]: flags } } : {}),
  };
  ChatMessage.applyRollMode(messageData, rollMode ?? game.settings.get('core', 'rollMode'));
  return ChatMessage.create(messageData);
}

/**
 * Nome de uma perícia ou área de Aptidão ou de Ofício. Em áreas extras, é o nome digitado na
 * ficha do `actor` (ou um texto padrão, se estiver vazio).
 */
export function skillName(key, actor) {
  const found = actor ? findExtra(actor.system, key) : null;
  if (found) {
    return found.extra.nome || game.i18n.localize(`DESORDEM.Ficha.ExtraSemNome.${found.group}`);
  }
  const group = PERICIAS[key] ? 'Pericias' : OFICIOS.includes(key) ? 'Oficios' : 'Aptidoes';
  return game.i18n.localize(`DESORDEM.${group}.${key}`);
}

/** Dado de uma perícia ou área de Aptidão ou de Ofício de um ator. */
function skillDieOf(actor, key) {
  if (PERICIAS[key]) return actor.system.pericias[key];
  if (APTIDOES.includes(key)) return actor.system.aptidoes[key];
  if (OFICIOS.includes(key)) return actor.system.oficios[key];
  const found = findExtra(actor.system, key);
  if (found) return found.extra.dado;
  throw new Error(`${SYSTEM_ID} | perícia, aptidão ou ofício desconhecido: ${key}`);
}

/**
 * Aplica as ajudas recebidas (ação de ajuda) às opções do teste.
 * @param {{stepMods: object[], extraDice: number[]}} opts
 * @param {{actor: Actor, skill: string, bonusDice?: number[]}[]} helpers
 */
function applyHelpers(opts, helpers) {
  let current = opts;
  const notes = [];
  for (const { actor, skill, bonusDice = [] } of helpers) {
    const die = skillDieOf(actor, skill);
    if (!canHelp(die)) {
      const message = game.i18n.format('DESORDEM.Ajuda.SemDado', {
        nome: actor.name,
        pericia: skillName(skill, actor),
      });
      ui.notifications.warn(message);
      throw new Error(message);
    }
    current = applyHelp(current, die, bonusDice);
    notes.push({ name: actor.name, skillLabel: skillName(skill, actor), die });
  }
  return { ...current, notes };
}

/**
 * Rola os dados de um teste e monta o resultado e o cartão HTML, sem publicar nada.
 * @returns {Promise<{result: object, rolls: Roll[], card: string}>}
 */
export async function executeTest({
  attrDie,
  skillDie,
  dt,
  extraDice = [],
  stepMods = [],
  modifier = 0,
  fearDie = null,
  helpers = [],
  label,
  attrLabel,
  skillLabel,
  showDt = true,
}) {
  const helped = applyHelpers({ stepMods, extraDice }, helpers);

  // Os dados são definidos e rolados antes; a lógica pura só os interpreta
  const { rolledSides } = planDice({
    attrDie,
    skillDie,
    extraDice: helped.extraDice,
    stepMods: helped.stepMods,
  });
  // O dado de pavor é rolado junto, depois dos demais dados
  const rolls = await rollDice(fearDie ? [...rolledSides, fearDie] : rolledSides);
  const result = resolveTest({
    attrDie,
    skillDie,
    dt,
    extraDice: helped.extraDice,
    stepMods: helped.stepMods,
    modifier,
    fearDie,
    rng: sequenceRng(rolls.map((roll) => roll.total)),
  });

  const display = { label, attrLabel, skillLabel, showDt, helpers: helped.notes };
  const context = buildChatContext(result, display);
  return {
    result,
    rolls,
    card: await render(TEMPLATE, context),
    // O necessário para refazer o teste com outros valores nos dados (análise, repetir dado)
    plan: {
      attrDie,
      skillDie,
      dt,
      extraDice: helped.extraDice,
      stepMods: helped.stepMods,
      modifier,
      fearDie,
    },
    display,
    sides: rolledSides,
    values: rolls.map((roll) => roll.total),
  };
}

/**
 * Refaz um teste já rolado com novos valores nos dados e devolve o resultado e o cartão HTML.
 * @param {{plan: object, display: object, values: number[], notes?: string[]}} data
 */
export async function rebuildTest({ plan, display, values, notes = [] }) {
  const result = resolveWithValues(plan, values);
  const context = { ...buildChatContext(result, display), notes };
  return { result, card: await render(TEMPLATE, context) };
}

/**
 * Executa um teste de um ator: paga os PD de controlar/abraçar o pavor, rola e, se o dado de
 * pavor tirar 1, encerra o pavor guardado na ficha. Sem ator, só rola.
 * @returns {Promise<{result: object, rolls: Roll[], card: string}>}
 */
export async function runTest(actor, options) {
  if (actor && options.pdCost > 0) {
    await actor.update({ 'system.pd.value': Math.max(0, actor.system.pd.value - options.pdCost) });
  }
  const outcome = await executeTest(options);
  if (actor && options.fearStored && outcome.result.fear?.ended) {
    await actor.update({ 'system.estado.pavor': 0 });
  }
  if (actor) await settleAbilities(actor, options, outcome.result);
  return outcome;
}

/**
 * Efeitos das habilidades depois de um teste: paga o ímpeto gasto e
 * enche a barra de ímpeto se o teste com DT falhou.
 */
async function settleAbilities(actor, options, result) {
  // Ameaças (criaturas) não têm barra de ímpeto
  if (!actor.system.recursos) return;
  const updates = {};
  const before = actor.system.recursos.impeto;
  let impeto = before - (options.impetoCost ?? 0);
  if (hasAbility(actor, 'impeto') && impetoFillsOnFailure(result, options.showDt)) {
    impeto = addImpeto(impeto);
  }
  if (impeto !== before) updates['system.recursos.impeto'] = impeto;
  if (Object.keys(updates).length) await actor.update(updates);
}

/**
 * Faz um teste básico e publica o resultado no chat.
 * @param {Object} opts
 * @param {number} opts.attrDie
 * @param {number} opts.skillDie
 * @param {number} [opts.dt]
 * @param {number[]} [opts.extraDice]
 * @param {import('./test.js').StepMod[]} [opts.stepMods]
 * @param {{actor: Actor, skill: string, bonusDice?: number[]}[]} [opts.helpers] Ajudas recebidas.
 * @param {string} [opts.label]
 * @param {string} [opts.attrLabel]
 * @param {string} [opts.skillLabel]
 * @param {Actor} [opts.actor] Ator que fala no chat.
 * @param {(result: object) => *} [opts.onResult] Chamado com o resultado, depois do cartão.
 * @param {object} [opts.avancoFlag] Registro de teste de avanço da perseguição, guardado na
 *   mensagem (flag `avanco`) para o botão do cartão.
 * @param {object} [opts.esconderijoFlag] Registro do teste de esconderijo da furtividade, guardado
 *   na mensagem (flag `esconderijo`) para o botão do cartão.
 * @param {string} [opts.rollMode] Modo de rolagem forçado (o esconderijo usa 'selfroll').
 * @param {object} [opts.acaoFlag] Registro do esconder-se ou do distrair (flag `acaoFurtiva`).
 * @param {object} [opts.desafioFlag] Registro do teste estendido da guia de desafios (flag
 *   `desafio`), para o botão «somar pontos» do cartão.
 * @param {object} [opts.opostoFlag] Lado de um teste oposto iniciado pela ficha (flag
 *   `respostaOposto`: cartão, lado, ator e perícia); o mestre registra o teste no cartão.
 */
export async function rollTest({
  attrLabel = game.i18n.localize('DESORDEM.Teste.Atributo'),
  skillLabel = game.i18n.localize('DESORDEM.Teste.Pericia'),
  actor,
  onResult,
  avancoFlag,
  esconderijoFlag,
  acaoFlag,
  desafioFlag,
  opostoFlag,
  rollMode,
  ...options
}) {
  const { result, rolls, card, plan, display, sides, values } = await runTest(actor, {
    ...options,
    attrLabel,
    skillLabel,
  });
  // O cartão guarda o teste para as habilidades que mudam os dados depois da rolagem
  const flags = actor ? { teste: { plan, display, sides, values, notes: [], used: {} } } : undefined;
  if (flags && avancoFlag) flags.avanco = avancoFlag;
  if (flags && esconderijoFlag) flags.esconderijo = esconderijoFlag;
  if (flags && acaoFlag) flags.acaoFurtiva = acaoFlag;
  if (flags && desafioFlag) flags.desafio = desafioFlag;
  if (flags && opostoFlag) flags.respostaOposto = opostoFlag;
  // Falha crítica: o cartão ganha o botão de rolar o efeito (veja critical-chat.js). O teste de
  // esconderijo não tem efeito de falha crítica (a regra não traz nenhum). Nas criaturas o mestre
  // decide a penalidade (a tabela fala de PD e de itens carregados, que elas não têm).
  if (flags && result.criticalFailure && !esconderijoFlag && !isThreat(actor)) {
    flags.tabela = createPending({ kind: 'disaster', actorUuid: actor.uuid });
  }
  await postMessage({ actor, content: card, rolls, flags, rollMode });
  // Quem pediu o teste pode reagir ao resultado (por exemplo, a perseguição soma os pontos de avanço)
  if (typeof onResult === 'function') await onResult(result);
  return result;
}

/**
 * Dados finais de um teste (atributo e perícia já com contusão, passos e efeitos), sem rolar.
 * Serve para a prévia da janela pré-teste.
 * @returns {{attrDie: number, skillDie: number, attrLabel: string, skillLabel: string}}
 */
export function testDicePreview(actor, skillKey, attribute) {
  const attrKey = resolveSkillAttribute(actor.system, skillKey, attribute);
  const { system } = actor;
  const plan = planDice({
    attrDie: system.atributos[attrKey],
    skillDie: skillDieOf(actor, skillKey),
    stepMods: [
      ...contusionStepMods(system.estado, attrKey),
      ...collectStepMods({ steps: system.passos, effects: system.efeitos, attrKey }),
    ],
  });
  return {
    attrDie: plan.attrFinal,
    skillDie: plan.skillFinal,
    attrLabel: game.i18n.localize(`DESORDEM.Atributos.${attrKey}`),
    skillLabel: skillName(skillKey, actor),
  };
}

/** Opções de teste de um ator para uma perícia ou aptidão (atributo-base ou o informado). */
export function skillTestOptions(actor, skillKey, attribute, options) {
  const attrKey = resolveSkillAttribute(actor.system, skillKey, attribute);
  const { system } = actor;
  // PD, ímpeto e pavor (0 nos campos que a ficha não tem, como numa criatura)
  const resources = testResources(system);

  // Dado de pavor (ignoreFear: testes que não sofrem pavor), com controlar/abraçar só neste teste
  const {
    ignoreFear,
    controlFear,
    embraceFear,
    active = [],
    allowNonLethal = false,
    ...rest
  } = options;
  let fear;
  try {
    fear = resolveFearOptions({
      fearDie: resources.fearDie,
      ignore: ignoreFear,
      control: controlFear,
      embrace: embraceFear,
      pd: resources.pd,
    });
  } catch (error) {
    ui.notifications.warn(game.i18n.localize('DESORDEM.Pavor.PDInsuficiente'));
    throw error;
  }

  // Habilidades escolhidas na janela pré-teste (dado extra de ímpeto, dado furtivo)
  const boosts = activeBoosts(active, {
    skillKey,
    impeto: resources.impeto,
    pd: resources.pd - fear.pdCost,
    allowNonLethal,
  });

  return {
    ...rest,
    impetoCost: boosts.impetoCost,
    // Contusão (Físico -1 passo), passos temporários e efeitos da ficha e penalidades fixas de lesões e traumas
    stepMods: [
      ...(rest.stepMods ?? []),
      ...contusionStepMods(system.estado, attrKey),
      ...collectStepMods({ steps: system.passos, effects: system.efeitos, attrKey }),
    ],
    extraDice: [
      ...(rest.extraDice ?? []),
      ...boosts.extraDice,
      ...(fear.bonusDie ? [fear.bonusDie] : []),
    ],
    modifier:
      (rest.modifier ?? 0) +
      lesionModifier(system.lesoes, skillKey) +
      traumaModifier(system.traumas, { attrKey, skillKey }),
    fearDie: fear.fearDie,
    fearStored: fear.fearDie !== null, // o dado rolado é o pavor guardado na ficha
    pdCost: fear.pdCost + boosts.pdCost,
    attrDie: actor.system.atributos[attrKey],
    skillDie: skillDieOf(actor, skillKey),
    attrLabel: game.i18n.localize(`DESORDEM.Atributos.${attrKey}`),
    skillLabel: skillName(skillKey, actor),
  };
}

/**
 * Teste de uma perícia de um ator, usando o atributo-base da perícia (ou outro, se informado).
 * @param {Actor} actor
 * @param {string} skillKey Chave da perícia (ex.: 'luta').
 * @param {Object} [options] Aceita dt, extraDice, stepMods, helpers e attribute (chave do atributo).
 */
export function rollSkill(actor, skillKey, { attribute, ...options } = {}) {
  if (!PERICIAS[skillKey]) throw new Error(`${SYSTEM_ID} | perícia desconhecida: ${skillKey}`);
  return rollTest({ ...skillTestOptions(actor, skillKey, attribute, options), actor });
}

/**
 * Teste de uma área de Aptidão (usa Mente como atributo-base, salvo se outro for informado).
 * @param {Actor} actor
 * @param {string} areaKey Chave da área (ex.: 'erudicao').
 * @param {Object} [options] Aceita dt, extraDice, stepMods, helpers e attribute (chave do atributo).
 */
export function rollAptitude(actor, areaKey, { attribute, ...options } = {}) {
  if (!APTIDOES.includes(areaKey) && findExtra(actor.system, areaKey)?.group !== 'aptidao') {
    throw new Error(`${SYSTEM_ID} | área de aptidão desconhecida: ${areaKey}`);
  }
  return rollTest({ ...skillTestOptions(actor, areaKey, attribute, options), actor });
}

/**
 * Teste de uma área de Ofício (usa Mente como atributo-base, salvo se outro for informado).
 * @param {Actor} actor
 * @param {string} areaKey Chave da área (ex.: 'metalurgia').
 * @param {Object} [options] Aceita dt, extraDice, stepMods, helpers e attribute (chave do atributo).
 */
export function rollCraft(actor, areaKey, { attribute, ...options } = {}) {
  if (!OFICIOS.includes(areaKey) && findExtra(actor.system, areaKey)?.group !== 'oficio') {
    throw new Error(`${SYSTEM_ID} | área de ofício desconhecida: ${areaKey}`);
  }
  return rollTest({ ...skillTestOptions(actor, areaKey, attribute, options), actor });
}

/**
 * Teste de uma perícia própria de uma criatura (chave `pericia:<id>`; Mente é o atributo-base,
 * salvo se outro for escolhido na ficha ou informado).
 * @param {Actor} actor
 * @param {string} key Chave da perícia própria.
 * @param {Object} [options] Aceita dt, extraDice, stepMods, helpers e attribute (chave do atributo).
 */
export function rollExtraSkill(actor, key, { attribute, ...options } = {}) {
  if (findExtra(actor.system, key)?.group !== 'pericia') {
    throw new Error(`${SYSTEM_ID} | perícia própria desconhecida: ${key}`);
  }
  return rollTest({ ...skillTestOptions(actor, key, attribute, options), actor });
}

/**
 * Teste oposto entre dois personagens, publicado em uma única mensagem.
 * Cada lado informa o ator, a perícia (ou aptidão) e, opcionalmente, atributo, extraDice,
 * stepMods e helpers (ajudas recebidas). O mestre pode escolher perícias diferentes em cada lado.
 *
 * @param {{actor: Actor, skill: string, attribute?: string}} a
 * @param {{actor: Actor, skill: string, attribute?: string}} b
 * @returns {Promise<{a: object, b: object, outcome: object}>}
 */
export async function rollOpposed(a, b) {
  const prepare = ({ actor, skill, attribute, ...options }) => {
    const opts = skillTestOptions(actor, skill, attribute, options);
    return runTest(actor, {
      ...opts,
      showDt: false,
      label: `${actor.name}: ${opts.attrLabel} + ${opts.skillLabel}`,
    });
  };

  const [sideA, sideB] = await Promise.all([prepare(a), prepare(b)]);
  const outcome = resolveOpposed(sideA.result, sideB.result);

  // Quem perde a disputa enche a barra de ímpeto (se tiver a habilidade)
  const loser = opposedLoser(outcome);
  const loserActor = loser === 'a' ? a.actor : loser === 'b' ? b.actor : null;
  if (loserActor && hasAbility(loserActor, 'impeto')) {
    await loserActor.update({
      'system.recursos.impeto': addImpeto(loserActor.system.recursos.impeto),
    });
  }

  const context = {
    ...buildOpposedContext(outcome),
    cardA: sideA.card,
    cardB: sideB.card,
    winnerName: outcome.winner === 'a' ? a.actor.name : b.actor.name,
  };
  const content = await render(TEMPLATE_OPOSTO, context);
  await postMessage({ actor: null, content, rolls: [...sideA.rolls, ...sideB.rolls] });

  return { a: sideA.result, b: sideB.result, outcome };
}