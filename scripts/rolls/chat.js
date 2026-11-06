/**
 * Ligação entre a lógica pura dos testes e o Foundry (rolagem de dados e mensagem no chat).
 */
import { SYSTEM_ID, PERICIAS, APTIDOES } from '../config.js';
import { sequenceRng } from './dice.js';
import { planDice, resolveTest } from './test.js';
import { canHelp, applyHelp } from './help.js';
import { resolveOpposed } from './opposed.js';
import { buildChatContext, buildOpposedContext } from './presenter.js';

const TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/teste.hbs`;
const TEMPLATE_OPOSTO = `systems/${SYSTEM_ID}/templates/chat/oposto.hbs`;

const render = (template, context) =>
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

/** Publica uma mensagem de rolagem no chat, respeitando o modo de rolagem. */
async function postMessage({ actor, content, rolls }) {
  const messageData = {
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls,
    sound: CONFIG.sounds.dice,
  };
  ChatMessage.applyRollMode(messageData, game.settings.get('core', 'rollMode'));
  return ChatMessage.create(messageData);
}

/** Nome traduzido de uma perícia ou área de Aptidão. */
function skillName(key) {
  const group = PERICIAS[key] ? 'Pericias' : 'Aptidoes';
  return game.i18n.localize(`DESORDEM.${group}.${key}`);
}

/** Dado de uma perícia ou área de Aptidão de um ator. */
function skillDieOf(actor, key) {
  if (PERICIAS[key]) return actor.system.pericias[key];
  if (APTIDOES.includes(key)) return actor.system.aptidoes[key];
  throw new Error(`${SYSTEM_ID} | perícia ou aptidão desconhecida: ${key}`);
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
        pericia: skillName(skill),
      });
      ui.notifications.warn(message);
      throw new Error(message);
    }
    current = applyHelp(current, die, bonusDice);
    notes.push({ name: actor.name, skillLabel: skillName(skill), die });
  }
  return { ...current, notes };
}

/**
 * Rola os dados de um teste e monta o resultado e o cartão HTML, sem publicar nada.
 * @returns {Promise<{result: object, rolls: Roll[], card: string}>}
 */
async function executeTest({
  attrDie,
  skillDie,
  dt,
  extraDice = [],
  stepMods = [],
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
  const rolls = await rollDice(rolledSides);
  const result = resolveTest({
    attrDie,
    skillDie,
    dt,
    extraDice: helped.extraDice,
    stepMods: helped.stepMods,
    rng: sequenceRng(rolls.map((roll) => roll.total)),
  });

  const context = buildChatContext(result, {
    label,
    attrLabel,
    skillLabel,
    showDt,
    helpers: helped.notes,
  });
  return { result, rolls, card: await render(TEMPLATE, context) };
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
 */
export async function rollTest({
  attrLabel = game.i18n.localize('DESORDEM.Teste.Atributo'),
  skillLabel = game.i18n.localize('DESORDEM.Teste.Pericia'),
  actor,
  ...options
}) {
  const { result, rolls, card } = await executeTest({ ...options, attrLabel, skillLabel });
  await postMessage({ actor, content: card, rolls });
  return result;
}

/** Opções de teste de um ator para uma perícia ou aptidão (atributo-base ou o informado). */
function skillTestOptions(actor, skillKey, attribute, options) {
  const isAptitude = !PERICIAS[skillKey];
  const attrKey = attribute ?? (isAptitude ? 'mente' : PERICIAS[skillKey]);
  return {
    ...options,
    attrDie: actor.system.atributos[attrKey],
    skillDie: skillDieOf(actor, skillKey),
    attrLabel: game.i18n.localize(`DESORDEM.Atributos.${attrKey}`),
    skillLabel: skillName(skillKey),
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
  if (!APTIDOES.includes(areaKey)) {
    throw new Error(`${SYSTEM_ID} | área de aptidão desconhecida: ${areaKey}`);
  }
  return rollTest({ ...skillTestOptions(actor, areaKey, attribute, options), actor });
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
    return executeTest({
      ...opts,
      showDt: false,
      label: `${actor.name}: ${opts.attrLabel} + ${opts.skillLabel}`,
    });
  };

  const [sideA, sideB] = await Promise.all([prepare(a), prepare(b)]);
  const outcome = resolveOpposed(sideA.result, sideB.result);

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