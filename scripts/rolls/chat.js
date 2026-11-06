/**
 * Ligação entre a lógica pura dos testes e o Foundry (rolagem de dados e mensagem no chat).
 */
import { SYSTEM_ID, PERICIAS, APTIDOES } from '../config.js';
import { sequenceRng } from './dice.js';
import { planDice, resolveTest } from './test.js';
import { buildChatContext } from './presenter.js';

const TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/teste.hbs`;

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
 * Faz um teste básico e publica o resultado no chat.
 * @param {Object} opts
 * @param {number} opts.attrDie
 * @param {number} opts.skillDie
 * @param {number} [opts.dt]
 * @param {number[]} [opts.extraDice]
 * @param {import('./test.js').StepMod[]} [opts.stepMods]
 * @param {string} [opts.label]
 * @param {string} [opts.attrLabel]
 * @param {string} [opts.skillLabel]
 * @param {Actor} [opts.actor] Ator que fala no chat.
 */
export async function rollTest({
  attrDie,
  skillDie,
  dt,
  extraDice,
  stepMods,
  label,
  attrLabel = game.i18n.localize('DESORDEM.Teste.Atributo'),
  skillLabel = game.i18n.localize('DESORDEM.Teste.Pericia'),
  actor,
}) {
  // Os dados são definidos e rolados antes; a lógica pura só os interpreta
  const { rolledSides } = planDice({ attrDie, skillDie, extraDice, stepMods });
  const rolls = await rollDice(rolledSides);
  const result = resolveTest({
    attrDie,
    skillDie,
    dt,
    extraDice,
    stepMods,
    rng: sequenceRng(rolls.map((roll) => roll.total)),
  });

  const context = buildChatContext(result, { label, attrLabel, skillLabel });
  const content = await foundry.applications.handlebars.renderTemplate(TEMPLATE, context);

  const messageData = {
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls,
    sound: CONFIG.sounds.dice,
  };
  ChatMessage.applyRollMode(messageData, game.settings.get('core', 'rollMode'));
  await ChatMessage.create(messageData);

  return result;
}

/**
 * Teste de uma perícia de um ator, usando o atributo-base da perícia (ou outro, se informado).
 * @param {Actor} actor
 * @param {string} skillKey Chave da perícia (ex.: 'luta').
 * @param {Object} [options] Aceita dt, extraDice, stepMods e attribute (chave do atributo).
 */
export function rollSkill(actor, skillKey, { attribute, ...options } = {}) {
  const attrKey = attribute ?? PERICIAS[skillKey];
  if (!attrKey) throw new Error(`${SYSTEM_ID} | perícia desconhecida: ${skillKey}`);

  const { atributos, pericias } = actor.system;
  return rollTest({
    ...options,
    actor,
    attrDie: atributos[attrKey],
    skillDie: pericias[skillKey],
    attrLabel: game.i18n.localize(`DESORDEM.Atributos.${attrKey}`),
    skillLabel: game.i18n.localize(`DESORDEM.Pericias.${skillKey}`),
  });
}

/**
 * Teste de uma área de Aptidão (usa Mente como atributo-base, salvo se outro for informado).
 * @param {Actor} actor
 * @param {string} areaKey Chave da área (ex.: 'erudicao').
 * @param {Object} [options] Aceita dt, extraDice, stepMods e attribute (chave do atributo).
 */
export function rollAptitude(actor, areaKey, { attribute = 'mente', ...options } = {}) {
  if (!APTIDOES.includes(areaKey)) {
    throw new Error(`${SYSTEM_ID} | área de aptidão desconhecida: ${areaKey}`);
  }

  const { atributos, aptidoes } = actor.system;
  return rollTest({
    ...options,
    actor,
    attrDie: atributos[attribute],
    skillDie: aptidoes[areaKey],
    attrLabel: game.i18n.localize(`DESORDEM.Atributos.${attribute}`),
    skillLabel: game.i18n.localize(`DESORDEM.Aptidoes.${areaKey}`),
  });
}