/**
 * Ligação ao Foundry do dano, do teste de lesão e das lesões (estado de saúde do personagem).
 */
import { SYSTEM_ID } from '../config.js';
import { render, postMessage, runTest, skillTestOptions } from './chat.js';
import { applyDamage } from './damage.js';
import { armorAvailable, spendArmorPoint } from './armor-chat.js';
import { resolveDamage } from './damage-resolve.js';
import { askDamage } from './damage-dialog.js';
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
import { isThreat, threatDamage } from './threat.js';

import { storesEffect, tableEffect } from './condition-tables.js';

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
    // As lesões que ficam e a contusão são efeitos da aba Condição (v0.22.2)
    efeitos: actor.toObject().system.efeitos,
  };
}

/**
 * Atualização da ficha a partir do estado de saúde. O contador de testes de lesão da cena só entra
 * quando informado (o teste conta; aplicar a lesão depois, não).
 */
function healthUpdate(state, testsInScene) {
  return {
    // O máximo não é gravado: ele sai da base menos as reduções dos efeitos (Laceração Profunda)
    'system.pv.value': state.pv,
    'system.estado.inconsciente': state.inconsciente,
    'system.estado.moribundo': state.moribundo,
    'system.estado.morto': state.morto,
    'system.estado.morteLenta': state.morteLenta,
    'system.efeitos': state.efeitos,
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
  const before = healthState(actor);
  // Lesão que fica na ficha: vira um efeito da aba Condição (texto traduzido pela chave)
  const effect = storesEffect(drawn.entry)
    ? tableEffect('lesao', drawn.entry, foundry.utils.randomID())
    : null;
  const state = applyLesion(before, drawn.entry, effect);
  await actor.update(healthUpdate(state));
  const context = buildTableResultContext({
    kind: 'lesion',
    entry: drawn.entry,
    rolls: drawn.rolls.map((roll) => roll.total),
    testNumber: pending.testNumber,
    nonLethal: pending.nonLethal,
    recoveredDying: before.moribundo && !state.moribundo,
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
    companion: false, // nem o companheiro animal (não é um teste de perícia)
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
 * Aplica dano físico a um personagem ou criatura, com as escolhas da janela Resolver dano.
 * - Personagem: gasta 1 ponto de armadura (−10) se escolhido e houver; usa a redução do escudo se
 *   escolhida e valer; o PV desce. Se o PV chegar a 0 (ou já estava em 0), o cartão só avisa: o
 *   teste de lesão é feito à mão (pelo «DT» do cabeçalho).
 * - Criatura: desconta a RD (sempre, mesmo no Shift+clique) e manda os números só ao mestre.
 * @param {Actor} actor
 * @param {number} amount Dano já calculado (ex.: RA + modificador da arma).
 * @param {Object} [options]
 * @param {boolean} [options.nonLethal=false] Dano não letal (só muda o texto do cartão).
 * @param {{useArmor: boolean, useShield: boolean, shield: object|null}|null} [options.choices]
 *   Escolhas já feitas na janela (`askDamage`). Sem elas, a janela abre aqui.
 * @param {boolean} [options.shift=false] Shift+clique: dano cheio, sem a janela.
 * @param {{total: number, lowRoll: number}|null} [options.defender] Resumo do teste de quem recebe
 *   (teste oposto: redução do escudo).
 * @returns {Promise<object|null>} O que mudou, ou null se a janela foi cancelada.
 */
export async function damageActor(
  actor,
  amount,
  { nonLethal = false, choices = null, shift = false, defender = null } = {},
) {
  const picked = choices ?? (await askDamage(actor, amount, { nonLethal, shift, defender }));
  if (!picked) return null;
  if (isThreat(actor)) return damageThreat(actor, amount, { nonLethal });
  const rawAmount = Math.trunc(amount);
  // O ponto só é gasto se a armadura entra na conta (marcado, com pontos, dano maior que 0)
  let available = armorAvailable(actor);
  const wantsArmor = picked.useArmor && available > 0 && rawAmount > 0;
  if (wantsArmor && !(await spendArmorPoint(actor))) available = 0;
  const resolved = resolveDamage({
    amount: rawAmount,
    useArmor: wantsArmor,
    armorAvailable: available,
    useShield: picked.useShield,
    shield: picked.shield,
  });
  const { before, after, needsInjuryTest } = applyDamage({
    current: actor.system.pv.value,
    amount: resolved.final,
  });
  await actor.update({ 'system.pv.value': after });
  await postMessage({
    actor,
    content: await render(TEMPLATE_DANO, {
      name: actor.name,
      amount: resolved.final,
      before,
      after,
      nonLethal,
      armorUsed: resolved.armorUsed,
      armorReduction: resolved.armorAmount,
      shieldUsed: resolved.shieldUsed,
      shieldReduction: resolved.shieldAmount,
      rawAmount,
      // PV zerado (ou já em 0): só o aviso; o teste de lesão é manual
      injuryWarning: needsInjuryTest,
    }),
  });
  return { before, after, needsInjuryTest, armorUsed: resolved.armorUsed };
}

/**
 * Dano físico numa ameaça (criatura): desconta a redução de dano (RD) e diminui o PV. Não há
 * pontos de armadura nem teste de lesão; com 0 PV o cartão avisa que ela foi derrotada. O cartão
 * com os números vai só ao mestre; os jogadores veem só que a criatura sofreu o dano.
 * @param {Actor} actor
 * @param {number} amount Dano já calculado (ex.: RA + modificador da arma).
 * @param {{nonLethal?: boolean}} [options] Só muda o texto do cartão.
 */
async function damageThreat(actor, amount, { nonLethal = false } = {}) {
  const outcome = threatDamage({
    current: actor.system.pv.value,
    amount: Math.trunc(amount),
    rd: actor.system.rd,
  });
  await actor.update({ 'system.pv.value': outcome.after });
  // Números (dano, RD, PV, derrotada) só para o mestre; no chat público, só que o dano foi
  // aplicado
  await postMessage({
    actor,
    rollMode: 'gmroll',
    content: await render(TEMPLATE_DANO, {
      name: actor.name,
      amount: outcome.amount,
      before: outcome.before,
      after: outcome.after,
      nonLethal,
      rdUsed: outcome.reduced > 0,
      rd: outcome.reduced,
      rawAmount: outcome.rawAmount,
      defeated: outcome.newlyDefeated,
    }),
  });
  await postMessage({
    actor,
    rollMode: 'publicroll',
    content: `<p class="desordem-dano__linha">${Handlebars.escapeExpression(
      game.i18n.format('DESORDEM.Dano.CriaturaPublico', { nome: actor.name }),
    )}</p>`,
  });
  return {
    before: outcome.before,
    after: outcome.after,
    needsInjuryTest: false,
    armorUsed: false,
    defeated: outcome.defeated,
  };
}
