/**
 * Ligação ao Foundry do dano, do teste de lesão e das lesões (estado de saúde do personagem).
 */
import { SYSTEM_ID } from '../config.js';
import { render, postMessage, runTest, skillTestOptions } from './chat.js';
import { applyDamage } from './damage.js';
import { reduceDamageWithArmor, ARMOR_REDUCTION } from './equipment.js';
import { armorAvailable, askSpendArmor, spendArmorPoint } from './armor-chat.js';
import {
  LESION_DIE,
  LESIONS,
  injuryTestOptions,
  injuryOutcome,
  outcomeEffects,
  lesionRollCount,
  bestLesionRoll,
  pickLesion,
  applyInjuryOutcome,
  applyLesion,
  resolveNonLethal,
} from './injury.js';
import { buildInjuryContext, buildTableResultContext } from './presenter.js';
import { createPending } from './pending-table.js';

const TEMPLATE_LESAO = `systems/${SYSTEM_ID}/templates/chat/lesao.hbs`;
const TEMPLATE_TABELA = `systems/${SYSTEM_ID}/templates/chat/tabela.hbs`;
const TEMPLATE_DANO = `systems/${SYSTEM_ID}/templates/chat/dano.hbs`;
const MAX_LESION_REROLLS = 50;

/** Estado de saúde usado pela lógica pura, lido da ficha do ator. */
function healthState(actor) {
  const { system } = actor;
  return {
    pv: system.pv.value,
    pvMax: system.pv.max,
    inconsciente: system.estado.inconsciente,
    moribundo: system.estado.moribundo,
    morto: system.estado.morto,
    morteLenta: system.estado.morteLenta,
    contusao: system.estado.contusao,
    lesoes: [...system.lesoes],
  };
}

/**
 * Atualização da ficha a partir do estado de saúde. O contador de testes de lesão da cena só entra
 * quando informado (o teste conta; aplicar a lesão depois, não).
 */
function healthUpdate(state, testsInScene) {
  return {
    'system.pv.value': state.pv,
    'system.pv.max': state.pvMax,
    'system.estado.inconsciente': state.inconsciente,
    'system.estado.moribundo': state.moribundo,
    'system.estado.morto': state.morto,
    'system.estado.morteLenta': state.morteLenta,
    'system.estado.contusao': state.contusao,
    'system.lesoes': state.lesoes,
    ...(testsInScene === undefined ? {} : { 'system.cena.testesLesao': testsInScene }),
  };
}

/**
 * Rola na tabela de lesões (d20, ou 2d20 ficando o melhor se o dano foi não letal),
 * repetindo enquanto cair uma lesão permanente que o personagem já tem. Só rola e escolhe a
 * entrada: aplicar a lesão à ficha é `applyLesionDraw`.
 * @param {string[]} owned Chaves das lesões que o personagem já possui.
 * @param {boolean} nonLethal
 * @returns {Promise<{entry: object, rolls: Roll[], shown: number[]}>} `rolls` são todos os d20
 *   rolados (inclui repetições) e `shown` são os valores da última tentativa (os que a janela mostra).
 */
export async function drawLesion(owned, nonLethal) {
  const allRolls = [];
  for (let attempt = 0; attempt < MAX_LESION_REROLLS; attempt++) {
    const rolls = await Promise.all(
      Array.from({ length: lesionRollCount(nonLethal) }, () =>
        new Roll(`1d${LESION_DIE}`).evaluate(),
      ),
    );
    allRolls.push(...rolls);
    const shown = rolls.map((r) => r.total);
    const { entry, reroll } = pickLesion(bestLesionRoll(shown), owned);
    if (!reroll) return { entry, rolls: allRolls, shown };
  }
  // Praticamente inalcançável; evita laço infinito
  const shown = allRolls.slice(-lesionRollCount(nonLethal)).map((r) => r.total);
  return { entry: LESIONS.find((e) => e.key === 'lacearacaoProfunda'), rolls: allRolls, shown };
}

/**
 * Aplica à ficha uma lesão já sorteada e publica o resultado no chat. Lê o estado de saúde de
 * agora (não o do momento do teste), porque a tabela pode ser rolada depois.
 * @param {Actor} actor
 * @param {{kind: string, nonLethal: boolean, testNumber: number}} pending Estado pendente do cartão.
 * @param {{entry: object, rolls: Roll[]}} drawn Retorno de `drawLesion`.
 */
export async function applyLesionDraw(actor, pending, drawn) {
  const state = applyLesion(healthState(actor), drawn.entry);
  await actor.update(healthUpdate(state));
  const context = buildTableResultContext({
    kind: 'lesion',
    entry: drawn.entry,
    rolls: drawn.rolls.map((roll) => roll.total),
    testNumber: pending.testNumber,
    nonLethal: pending.nonLethal,
  });
  await postMessage({
    actor,
    content: await render(TEMPLATE_TABELA, context),
    rolls: drawn.rolls,
  });
  return { entry: drawn.entry, state };
}

/**
 * Teste de lesão (Físico + Vigor) com as consequências aplicadas à ficha e publicadas no chat.
 * O "teste de morte" do moribundo, no fim de cada rodada, também é feito por aqui.
 * Em falha, a tabela de lesões NÃO é rolada: o cartão traz um botão para rolá-la depois
 * (veja `table-chat.js`) e o retorno tem `pending: true`.
 * @param {Actor} actor
 * @param {Object} [options]
 * @param {boolean} [options.nonLethal=false] O dano não letal ajudou a zerar o PV: +1d6 no teste
 *   e 2d20 (o melhor) na tabela de lesões. Também vale se a habilidade "naoLetal" vier em `active`.
 */
export async function rollInjuryTest(
  actor,
  { nonLethal: nonLethalFlag = false, extraDice = [], active: chosen = [], dt } = {},
) {
  const previousTests = actor.system.cena.testesLesao;
  // Dano não letal: marcador direto (arma) ou a habilidade escolhida na janela do teste (+d6 uma vez)
  const { nonLethal, active } = resolveNonLethal(nonLethalFlag, chosen);
  const rule = injuryTestOptions({ previousTests, nonLethal: nonLethalFlag });
  const options = skillTestOptions(actor, 'vigor', undefined, {
    dt: dt ?? rule.dt,
    extraDice: [...rule.extraDice, ...extraDice],
    active,
    allowNonLethal: true,
    ignoreFear: true, // o teste de lesão não sofre o dado de pavor
    label: `${actor.name}: ${game.i18n.localize('DESORDEM.Lesao.TesteTitulo')}`,
  });
  const { result, rolls, card } = await runTest(actor, options);

  const outcome = injuryOutcome(result);
  const before = healthState(actor);
  let state = applyInjuryOutcome(before, outcome);

  await actor.update(healthUpdate(state, previousTests + 1));

  const pending = outcome === 'failure';
  const context = {
    ...buildInjuryContext({
      outcome,
      effects: outcomeEffects(outcome),
      nonLethal,
      testNumber: previousTests + 1,
    }),
    testCard: card,
  };
  await postMessage({
    actor,
    content: await render(TEMPLATE_LESAO, context),
    rolls,
    flags: pending
      ? {
          tabela: createPending({
            kind: 'lesion',
            nonLethal,
            testNumber: previousTests + 1,
            actorUuid: actor.uuid,
          }),
        }
      : undefined,
  });
  return { outcome, pending, state };
}

/**
 * Aplica dano físico a um personagem. Se ele tiver pontos de armadura, pergunta se quer gastar um
 * (reduz o dano em 10). Se o PV chegar a 0 (ou ele já estava em 0), faz o teste de lesão em seguida.
 * @param {Actor} actor
 * @param {number} amount Dano já calculado (ex.: RA + modificador da arma).
 * @param {Object} [options]
 * @param {boolean} [options.nonLethal=false] Dano não letal (veja `rollInjuryTest`).
 * @param {boolean} [options.spendArmor] true gasta o ponto sem perguntar, false nunca gasta;
 *   sem valor, pergunta ao jogador quando houver pontos.
 */
export async function damageActor(actor, amount, { nonLethal = false, spendArmor } = {}) {
  const rawAmount = Math.trunc(amount);
  let finalAmount = rawAmount;
  let armorUsed = false;
  if (rawAmount > 0 && spendArmor !== false && armorAvailable(actor) > 0) {
    const confirmed = spendArmor === true ? true : await askSpendArmor(actor, rawAmount);
    if (confirmed && (await spendArmorPoint(actor))) {
      finalAmount = reduceDamageWithArmor(rawAmount);
      armorUsed = true;
    }
  }
  const { before, after, needsInjuryTest } = applyDamage({
    current: actor.system.pv.value,
    amount: finalAmount,
  });
  await actor.update({ 'system.pv.value': after });
  await postMessage({
    actor,
    content: await render(TEMPLATE_DANO, {
      name: actor.name,
      amount: finalAmount,
      before,
      after,
      nonLethal,
      armorUsed,
      armorReduction: ARMOR_REDUCTION,
      rawAmount,
    }),
  });
  if (needsInjuryTest) await rollInjuryTest(actor, { nonLethal });
  return { before, after, needsInjuryTest, armorUsed };
}
