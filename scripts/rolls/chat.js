/**
 * Ligação entre a lógica pura dos testes e o Foundry (rolagem de dados e mensagem no chat).
 */
import { SYSTEM_ID, PERICIAS } from '../config.js';
import { resolveTest } from './test.js';
import { buildChatContext } from './presenter.js';

const TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/teste.hbs`;

/**
 * Gerador que rola cada dado pelo motor do Foundry e guarda o Roll,
 * para que as rolagens sejam anexadas à mensagem (e animadas por módulos de dados 3D).
 */
function createFoundryRng(rolls) {
  return (sides) => {
    const roll = new Roll(`1d${sides}`).evaluateSync({ allowInteractive: false });
    rolls.push(roll);
    return roll.total;
  };
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
  const rolls = [];
  const result = resolveTest({
    attrDie,
    skillDie,
    dt,
    extraDice,
    stepMods,
    rng: createFoundryRng(rolls),
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
