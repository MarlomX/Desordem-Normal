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
import { conditionModifier } from './effects.js';
import { collectStepMods } from './steps.js';
import { armorPenaltyLine, armorSkillPenalties, armorStepMods } from './equipment.js';
import {
  impetoFillsOnFailure,
  opposedLoser,
  activeBoosts,
  resolveWithValues,
} from './abilities.js';
import { markCompanionHurt } from './ability-notes.js';
import { render, postMessage } from './chat-post.js';
import {
  companionHurt,
  dialogDiceOptions,
  ammoOptions,
  firstWeaponAttack,
  weaponAttackEffects,
  pickBonusDice,
  spendBonusDice,
} from './ability-effects.js';
import {
  GAINS_HOOK,
  actorEffects,
  actorResources,
  resourceChanges,
  resourceUpdates,
  triggerUpdates,
} from './ability-effects-actor.js';
import { attackUsedLines, resourceName, usedSummary } from '../sheets/ability-controls.js';

/** Tradução com ou sem dados (texto da linha «Usou»). */
const localize = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
import { resolveFearOptions } from './fear.js';
import { createPending } from './pending-table.js';
import { isThreat, testResources } from './threat.js';
import { markFearDice } from '../dice3d/dice3d.js';

const TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/teste.hbs`;
const TEMPLATE_OPOSTO = `systems/${SYSTEM_ID}/templates/chat/oposto.hbs`;

// O básico do chat mora em chat-post.js; reexportado para quem já importava daqui
export { render, postMessage };

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
  critMin = undefined,
  helpers = [],
  label,
  attrLabel,
  skillLabel,
  showDt = true,
  usos = [],
  embracedFearIndex = null,
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
  // Dice So Nice (v0.25.2): aparência e aura no dado de pavor, aura no pavor abraçado. As ajudas
  // só acrescentam dados no fim, então a posição do abraçado nos dados extras não muda.
  markFearDice(rolls, {
    rolledCount: rolledSides.length,
    hasFear: Boolean(fearDie),
    embracedExtraIndex: embracedFearIndex,
  });
  const result = resolveTest({
    attrDie,
    skillDie,
    dt,
    extraDice: helped.extraDice,
    stepMods: helped.stepMods,
    modifier,
    fearDie,
    critMin,
    rng: sequenceRng(rolls.map((roll) => roll.total)),
  });

  const display = { label, attrLabel, skillLabel, showDt, helpers: helped.notes, usos };
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
      // Crítico ampliado (arma): refazer o teste (análise, repetir dado) usa o mesmo mínimo
      ...(critMin ? { critMin } : {}),
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
  // PV gastos por habilidades marcadas na janela pré-teste
  if (actor && options.pvCost > 0) {
    await actor.update({ 'system.pv.value': Math.max(0, actor.system.pv.value - options.pvCost) });
  }
  const outcome = await executeTest(options);
  if (actor && options.fearStored && outcome.result.fear?.ended) {
    await actor.update({ 'system.estado.pavor': 0 });
  }
  if (actor) await settleAbilities(actor, options, outcome.result);
  return outcome;
}

/**
 * Efeitos das habilidades depois de um teste: paga os recursos gastos na janela pré-teste
 * (ímpeto e outros), tira da reserva os dados bônus usados e dispara os ganhos de «ao falhar»
 * (efeitos `ganharRecurso`; ex.: enche a barra de ímpeto) se o teste com DT falhou.
 */
async function settleAbilities(actor, options, result) {
  // Ameaças (criaturas) não têm recursos de habilidade
  if (!actor.system.recursosHab) return;
  const { values } = actorResources(actor);
  const paid = { ...values };
  const changed = {};
  for (const [key, cost] of Object.entries(options.resourceCosts ?? {})) {
    if (!cost || paid[key] === undefined) continue;
    paid[key] = Math.max(0, paid[key] - cost);
    changed[key] = paid[key];
  }
  const updates = {
    ...resourceUpdates(changed),
    ...(impetoFillsOnFailure(result, options.showDt)
      ? triggerUpdates(actor, 'falha', null, paid)
      : {}),
  };
  if (options.bonusDiceSpent?.length) {
    updates['system.dadosBonus'] = spendBonusDice(actor.system.dadosBonus, options.bonusDiceSpent);
  }
  if (Object.keys(updates).length) await actor.update(updates);
  // Aviso no chat dos ganhos de «ao falhar» (comparados com os valores já pagos)
  const gains = impetoFillsOnFailure(result, options.showDt)
    ? resourceChanges(triggerUpdates(actor, 'falha', null, paid))
    : {};
  if (Object.keys(gains).length) Hooks.callAll(GAINS_HOOK, actor, paid, gains, 'falha');
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
 * @param {object} [opts.socorroFlag] Primeiros socorros (flag `primeirosSocorros`: paciente e
 *   estado do botão de aplicar).
 * @param {object} [opts.planoFlag] Teste que dá dados bônus ao grupo (flag `planoDados`: dado,
 *   margem, nome da habilidade e estado do botão de distribuir).
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
  socorroFlag,
  planoFlag,
  rollMode,
  companionDie = null,
  ...options
}) {
  const { result, rolls, card, plan, display, sides, values } = await runTest(actor, {
    ...options,
    attrLabel,
    skillLabel,
  });
  // O cartão guarda o teste para as habilidades que mudam os dados depois da rolagem
  const flags = actor
    ? { teste: { plan, display, sides, values, notes: [], used: {} } }
    : undefined;
  if (flags && avancoFlag) flags.avanco = avancoFlag;
  if (flags && esconderijoFlag) flags.esconderijo = esconderijoFlag;
  if (flags && acaoFlag) flags.acaoFurtiva = acaoFlag;
  if (flags && desafioFlag) flags.desafio = desafioFlag;
  if (flags && opostoFlag) flags.respostaOposto = opostoFlag;
  if (flags && socorroFlag) flags.primeirosSocorros = socorroFlag;
  if (flags && planoFlag) flags.planoDados = planoFlag;
  // Falha crítica: o cartão ganha o botão de rolar o efeito (veja critical-chat.js). O teste de
  // esconderijo não tem efeito de falha crítica (a regra não traz nenhum). Nas criaturas o mestre
  // decide a penalidade (a tabela fala de PD e de itens carregados, que elas não têm).
  if (flags && result.criticalFailure && !esconderijoFlag && !isThreat(actor)) {
    flags.tabela = createPending({ kind: 'disaster', actorUuid: actor.uuid });
  }
  await postMessage({ actor, content: card, rolls, flags, rollMode });
  // Companheiro animal (v0.27.0): o dado dele em 1 o fere até o fim da cena
  if (actor && companionHurt(result, companionDie)) await markCompanionHurt(actor);
  // Quem pediu o teste pode reagir ao resultado (por exemplo, a perseguição soma os pontos de avanço)
  if (typeof onResult === 'function') await onResult(result);
  return result;
}

/**
 * Dados finais de um teste (atributo e perícia já com contusão, passos e efeitos), sem rolar.
 * Serve para a prévia da janela pré-teste.
 * @returns {{attrDie: number, skillDie: number, attrLabel: string, skillLabel: string}}
 */
export function testDicePreview(actor, skillKey, attribute, extraStepMods = [], { testKind } = {}) {
  const attrKey = resolveSkillAttribute(actor.system, skillKey, attribute);
  const { system } = actor;
  const plan = planDice({
    attrDie: system.atributos[attrKey],
    skillDie: skillDieOf(actor, skillKey),
    stepMods: [
      // Passos próprios deste teste (ex.: primeiros socorros sem maleta), para a prévia bater
      ...extraStepMods,
      // Penalidade passiva das armaduras vestidas e dos escudos empunhados nesta perícia
      ...armorStepMods(armorSkillPenalties(actor.items), skillKey),
      // Passos manuais e da aba Condição (os de uma perícia só e os de um tipo de teste também)
      ...collectStepMods({
        steps: system.passos,
        effects: system.efeitos,
        attrKey,
        skillKey,
        testKind,
      }),
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
    allowDefense = false,
    testKind = 'qualquer',
    weaponId = null,
    naoAtacou = false,
    municaoId = null,
    useBonusDice = 0,
    // Falso nos testes que não são de perícia (lesão e trauma): o companheiro animal não ajuda
    companion = true,
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

  // Habilidades escolhidas na janela pré-teste (efeitos `dadoExtra`: ímpeto, dado furtivo...); no
  // ataque, também os efeitos da arma (`weaponId`)
  const entries = actorEffects(actor, { weaponId });
  const boosts = activeBoosts(active, {
    pd: resources.pd - fear.pdCost,
    pv: system.pv?.value ?? 0,
    recursos: actorResources(actor, entries).values,
    diceOptions: dialogDiceOptions(entries, {
      skillKey,
      // Tipo do teste para os filtros dos dados extras (defesa, ataque corpo a corpo...)
      testKind: allowDefense ? 'defesa' : testKind,
      // Companheiro animal ferido nesta cena: a opção não vale, mesmo marcada (v0.27.0)
      hurtCompanion: Boolean(system.cena?.animalFerido),
      companion,
    }),
    allowNonLethal,
    allowDefense,
  });
  // Efeitos da arma do ataque (bônus fixo, passo no dado da perícia, crítico ampliado). O
  // «primeiro ataque da cena» é o primeiro desta arma (marcador da ficha; criaturas não têm, então
  // nunca é automático); o «quem ainda não me atacou» vem da caixa da janela pré-teste.
  const attack = weaponId
    ? weaponAttackEffects(entries, {
        firstAttack: firstWeaponAttack(system.cena, weaponId),
        notAttacked: Boolean(naoAtacou),
      })
    : { modifier: 0, steps: 0, critMin: null, lines: [] };
  // Dados da reserva de bônus escolhidos na janela (os maiores primeiro)
  const reserveDice = pickBonusDice(system.dadosBonus, useBonusDice);
  // Linha «Usou» do cartão: habilidades marcadas, Defender-se, não letal e dados da reserva
  const resourceDefsNow = actorResources(actor, entries).defs;
  const usos = usedSummary(boosts.used, {
    diceOptions: dialogDiceOptions(entries, {
      skillKey,
      testKind: allowDefense ? 'defesa' : testKind,
      hurtCompanion: Boolean(system.cena?.animalFerido),
      companion,
    }),
    reserveDice,
    resourceNames: Object.fromEntries(
      Object.values(resourceDefsNow).map((def) => [def.chave, resourceName(def, localize)]),
    ),
    t: localize,
  });
  // Penalidade passiva das armaduras e escudos em uso nesta perícia (passos a menos)
  const penaltyLine = armorPenaltyLine(armorSkillPenalties(actor.items), skillKey);
  // Munição marcada na janela (ex.: aljava): passos no ataque (o dano fica no cartão de ataque)
  const weaponItem = weaponId ? actor.items.get(weaponId) : null;
  const ammo =
    municaoId && weaponItem
      ? (ammoOptions([...actor.items], weaponItem.system).find((a) => a.id === municaoId) ?? null)
      : null;
  if (ammo)
    usos.push(
      localize('DESORDEM.Teste.UsouArma.municao', {
        nome: ammo.name,
        passos: ammo.passos,
        dano: ammo.dano,
      }),
    );
  // Linha «Usou» do cartão: também os efeitos da arma que entraram neste ataque e a penalidade
  usos.push(...attackUsedLines([...attack.lines, ...(penaltyLine ? [penaltyLine] : [])], localize));
  // Dados extras do teste; o pavor abraçado vira um dado bônus e entra por último
  const extraDice = [
    ...(rest.extraDice ?? []),
    ...boosts.extraDice,
    ...reserveDice,
    ...(fear.bonusDie ? [fear.bonusDie] : []),
  ];

  return {
    ...rest,
    impetoCost: boosts.impetoCost,
    pvCost: boosts.pvCost,
    resourceCosts: boosts.resourceCosts,
    bonusDiceSpent: reserveDice,
    usos,
    // Passos temporários e dos efeitos da aba Condição (a contusão é um deles desde a v0.22.2)
    stepMods: [
      ...(rest.stepMods ?? []),
      // Passo no ataque (efeito da arma): no dado da perícia
      ...(attack.steps ? [{ target: 'skill', steps: attack.steps }] : []),
      // Penalidade das armaduras e escudos em uso (passos a menos no dado da perícia)
      ...(penaltyLine ? [{ target: 'skill', steps: -penaltyLine.value }] : []),
      // Munição: passos no dado da perícia do ataque
      ...(ammo?.passos ? [{ target: 'skill', steps: ammo.passos }] : []),
      // (os passos condicionais das habilidades chegam como efeitos da ficha, na aba Condição)
      ...collectStepMods({
        steps: system.passos,
        effects: system.efeitos,
        attrKey,
        skillKey,
        testKind: allowDefense ? 'defesa' : testKind,
      }),
    ],
    extraDice,
    // Pavor abraçado (v0.25.2): posição dele nos dados extras, para levar a aura no Dice So Nice
    embracedFearIndex: fear.bonusDie ? extraDice.length - 1 : null,
    // Companheiro animal (v0.27.0): posição e faces do dado dele nos dados extras, para a rolagem
    // conferir se deu 1 (os bônus manuais vêm antes dele; veja `companionHurt`)
    companionDie:
      boosts.companionAt === null
        ? null
        : {
            index: (rest.extraDice ?? []).length + boosts.companionAt,
            sides: boosts.extraDice[boosts.companionAt],
          },
    // Crítico ampliado da arma (sem ele, o padrão de `resolveTest`)
    ...(attack.critMin ? { critMin: attack.critMin } : {}),
    modifier:
      (rest.modifier ?? 0) +
      // Bônus de ataque da arma
      attack.modifier +
      // Modificadores fixos dos efeitos da aba Condição (lesões, traumas e os feitos à mão)
      conditionModifier(system.efeitos, { attrKey, skillKey }),
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

  // Quem perde a disputa dispara os ganhos de «ao perder um oposto» (ex.: enche o ímpeto)
  const loser = opposedLoser(outcome);
  const loserActor = loser === 'a' ? a.actor : loser === 'b' ? b.actor : null;
  const loserBefore = loserActor ? actorResources(loserActor).values : {};
  const loserUpdates = loserActor ? triggerUpdates(loserActor, 'perdeOposto') : {};
  if (Object.keys(loserUpdates).length) {
    await loserActor.update(loserUpdates);
    Hooks.callAll(
      GAINS_HOOK,
      loserActor,
      loserBefore,
      resourceChanges(loserUpdates),
      'perdeOposto',
    );
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
