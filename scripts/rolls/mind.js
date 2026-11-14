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
import { buildTraumaContext, buildTableResultContext } from './presenter.js';
import { createPending } from './pending-table.js';

const TEMPLATE_TRAUMA = `systems/${SYSTEM_ID}/templates/chat/trauma.hbs`;
const TEMPLATE_TABELA = `systems/${SYSTEM_ID}/templates/chat/tabela.hbs`;
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

/**
 * Atualização da ficha a partir do estado mental. O contador de testes de trauma da cena só entra
 * quando informado (o teste conta; aplicar o trauma depois, não).
 */
function mindUpdate(state, testsInScene) {
  return {
    'system.pd.value': state.pd,
    'system.pd.max': state.pdMax,
    'system.estado.pavor': state.pavor,
    'system.estado.estupor': state.estupor,
    'system.estado.colapso': state.colapso,
    'system.traumas': state.traumas,
    ...(testsInScene === undefined ? {} : { 'system.cena.testesTrauma': testsInScene }),
  };
}

/**
 * Rola na tabela de traumas (d20), repetindo enquanto cair um trauma persistente que o
 * personagem já tem. Só rola e escolhe a entrada: aplicar o trauma à ficha é `applyTraumaDraw`.
 * @param {string[]} owned Chaves dos traumas que o personagem já possui.
 * @returns {Promise<{entry: object, rolls: Roll[], shown: number[]}>} `rolls` são todos os d20
 *   rolados (inclui repetições) e `shown` é o valor da última tentativa (o que a janela mostra).
 */
export async function drawTrauma(owned) {
  const allRolls = [];
  for (let attempt = 0; attempt < MAX_TRAUMA_REROLLS; attempt++) {
    const roll = await new Roll(`1d${TRAUMA_DIE}`).evaluate();
    allRolls.push(roll);
    const { entry, reroll } = pickTrauma(roll.total, owned);
    if (!reroll) return { entry, rolls: allRolls, shown: [roll.total] };
  }
  // Praticamente inalcançável; evita laço infinito
  return {
    entry: TRAUMAS.find((e) => e.key === 'chagaAlma'),
    rolls: allRolls,
    shown: [allRolls.at(-1).total],
  };
}

/**
 * Aplica à ficha um trauma já sorteado e publica o resultado no chat. Lê o estado mental de agora
 * (não o do momento do teste), porque a tabela pode ser rolada depois.
 * @param {Actor} actor
 * @param {{testNumber: number}} pending Estado pendente do cartão.
 * @param {{entry: object, rolls: Roll[]}} drawn Retorno de `drawTrauma`.
 */
export async function applyTraumaDraw(actor, pending, drawn) {
  const state = applyTrauma(mindState(actor), drawn.entry);
  await actor.update(mindUpdate(state));
  const context = buildTableResultContext({
    kind: 'trauma',
    entry: drawn.entry,
    rolls: drawn.rolls.map((roll) => roll.total),
    testNumber: pending.testNumber,
  });
  await postMessage({
    actor,
    content: await render(TEMPLATE_TABELA, context),
    rolls: drawn.rolls,
  });
  return { entry: drawn.entry, state };
}

/**
 * Teste de trauma (Emoção + Disciplina) com as consequências imediatas aplicadas à ficha e
 * publicadas no chat. Em falha, a tabela de traumas NÃO é rolada: o cartão traz um botão para
 * rolá-la depois (veja `table-chat.js`) e o retorno tem `pending: true`.
 * @param {Actor} actor
 */
export async function rollTraumaTest(actor, { extraDice = [], active = [], dt } = {}) {
  const previousTests = actor.system.cena.testesTrauma;
  const options = skillTestOptions(actor, 'disciplina', undefined, {
    dt: dt ?? traumaDT(previousTests),
    extraDice,
    active,
    ignoreFear: true, // o teste de trauma não sofre o dado de pavor
    label: `${actor.name}: ${game.i18n.localize('DESORDEM.Trauma.TesteTitulo')}`,
  });
  const { result, rolls, card } = await runTest(actor, options);

  const outcome = traumaOutcome(result);
  const state = mindState(actor);
  await actor.update(mindUpdate(state, previousTests + 1));

  const pending = outcome === 'failure';
  const context = {
    ...buildTraumaContext({ outcome, testNumber: previousTests + 1 }),
    testCard: card,
  };
  await postMessage({
    actor,
    content: await render(TEMPLATE_TRAUMA, context),
    rolls,
    flags: pending
      ? {
          tabela: createPending({
            kind: 'trauma',
            testNumber: previousTests + 1,
            actorUuid: actor.uuid,
          }),
        }
      : undefined,
  });
  return { outcome, pending, state };
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
