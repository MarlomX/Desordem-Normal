/**
 * Ligação ao Foundry do dano emocional, do teste de trauma e dos traumas (estado mental).
 */
import { SYSTEM_ID } from '../config.js';
import { render, postMessage, runTest, skillTestOptions } from './chat.js';
import {
  TRAUMA_DIE,
  TRAUMAS,
  traumaDT,
  traumaOutcome,
  pickTrauma,
  applyEmotionalDamage,
  applyTrauma,
} from './emotional.js';
import { buildTraumaContext } from './presenter.js';

const TEMPLATE_TRAUMA = `systems/${SYSTEM_ID}/templates/chat/trauma.hbs`;
const TEMPLATE_DANO = `systems/${SYSTEM_ID}/templates/chat/dano.hbs`;
const MAX_TRAUMA_REROLLS = 50;

/** Estado mental usado pela lógica pura, lido da ficha do ator. */
function mindState(actor) {
  const { system } = actor;
  return {
    pd: system.pd.value,
    pdMax: system.pd.max,
    pavor: system.estado.pavor,
    estupor: system.estado.estupor,
    colapso: system.estado.colapso,
    traumas: [...system.traumas],
  };
}

/** Atualização da ficha a partir do estado mental (e do contador de testes de trauma da cena). */
function mindUpdate(state, testsInScene) {
  return {
    'system.pd.value': state.pd,
    'system.pd.max': state.pdMax,
    'system.estado.pavor': state.pavor,
    'system.estado.estupor': state.estupor,
    'system.estado.colapso': state.colapso,
    'system.traumas': state.traumas,
    'system.cena.testesTrauma': testsInScene,
  };
}

/**
 * Rola na tabela de traumas (d20), repetindo enquanto cair um trauma persistente que o
 * personagem já tem.
 * @returns {Promise<{entry: object, rolls: Roll[]}>}
 */
async function rollTrauma(owned) {
  const allRolls = [];
  for (let attempt = 0; attempt < MAX_TRAUMA_REROLLS; attempt++) {
    const roll = await new Roll(`1d${TRAUMA_DIE}`).evaluate();
    allRolls.push(roll);
    const { entry, reroll } = pickTrauma(roll.total, owned);
    if (!reroll) return { entry, rolls: allRolls };
  }
  // Praticamente inalcançável; evita laço infinito
  return { entry: TRAUMAS.find((e) => e.key === 'chagaAlma'), rolls: allRolls };
}

/**
 * Teste de trauma (Emoção + Disciplina) com as consequências aplicadas à ficha e publicadas no
 * chat. Em falha, rola na tabela de traumas.
 * @param {Actor} actor
 */
export async function rollTraumaTest(actor, { extraDice = [] } = {}) {
  const previousTests = actor.system.cena.testesTrauma;
  const options = skillTestOptions(actor, 'disciplina', undefined, {
    dt: traumaDT(previousTests),
    extraDice,
    ignoreFear: true, // o teste de trauma não sofre o dado de pavor
    label: `${actor.name}: ${game.i18n.localize('DESORDEM.Trauma.TesteTitulo')}`,
  });
  const { result, rolls, card } = await runTest(actor, options);

  const outcome = traumaOutcome(result);
  let state = mindState(actor);
  let trauma = null;
  let traumaRolls = [];
  if (outcome === 'failure') {
    const drawn = await rollTrauma(state.traumas);
    trauma = drawn.entry;
    traumaRolls = drawn.rolls;
    state = applyTrauma(state, trauma);
  }

  await actor.update(mindUpdate(state, previousTests + 1));

  const context = {
    ...buildTraumaContext({
      outcome,
      trauma,
      traumaRolls: traumaRolls.map((roll) => roll.total),
      testNumber: previousTests + 1,
    }),
    testCard: card,
  };
  await postMessage({
    actor,
    content: await render(TEMPLATE_TRAUMA, context),
    rolls: [...rolls, ...traumaRolls],
  });
  return { outcome, trauma, state };
}

/**
 * Aplica dano emocional a um personagem, somando o dano extra dos traumas. Se o PD chegar a 0
 * (ou ele já estava em 0), faz o teste de trauma em seguida. Gastar PD não é dano emocional.
 * @param {Actor} actor
 * @param {number} amount Dano emocional já calculado.
 */
export async function emotionalDamage(actor, amount) {
  const base = Math.trunc(amount);
  const {
    before,
    after,
    amount: total,
    needsTraumaTest,
  } = applyEmotionalDamage({
    current: actor.system.pd.value,
    amount: base,
    owned: actor.system.traumas,
  });
  await actor.update({ 'system.pd.value': after });
  await postMessage({
    actor,
    content: await render(TEMPLATE_DANO, {
      name: actor.name,
      amount: total,
      extra: total - base,
      before,
      after,
      emotional: true,
    }),
  });
  if (needsTraumaTest) await rollTraumaTest(actor);
  return { before, after, needsTraumaTest };
}