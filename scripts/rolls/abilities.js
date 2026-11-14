/**
 * Habilidades: regras puras (sem dependência do Foundry) das habilidades automatizadas, dos
 * recursos que elas usam (barra de ímpeto, marcadores de análise) e do reinício de cena.
 */
import { resolveTest } from './test.js';
import { NON_LETHAL_BONUS_DIE } from './injury.js';
import { sequenceRng } from './dice.js';

/** Automações disponíveis para uma habilidade (a chave fica no campo `automacao` do item). */
export const AUTOMATIONS = Object.freeze([
  'impeto',
  'impetoInicial',
  'analise',
  'prontidao',
  'esquiva',
  'companheiro',
  'curandeiro',
  'sorrateiro',
]);

export const IMPETO_MAX = 5;
export const ANALISE_MAX = 4;
export const ANALISE_GAIN = 2;

/** Custos fixos das habilidades que gastam PD ou ímpeto. */
export const COSTS = Object.freeze({
  prontidao: 2,
  curandeiro: 2,
  sorrateiro: 3,
  impetoDado: 1,
  impetoPasso: 3,
  impetoAcao: 3,
});

/** Perícias em que o bônus de dado extra da habilidade "furtiva" vale. */
export const SNEAK_SKILLS = Object.freeze(['crime', 'furtividade']);

/** O personagem tem uma habilidade com esta automação? (`actor.items` é uma coleção do Foundry.) */
export function hasAbility(actor, key) {
  return actor.items.some((item) => item.type === 'habilidade' && item.system.automacao === key);
}

/** Preenche espaços da barra de ímpeto, sem passar do máximo. */
export function addImpeto(current, amount = 1) {
  return Math.min(IMPETO_MAX, Math.max(0, current + amount));
}

/**
 * Um teste com DT que falhou (inclusive falha crítica) enche a barra de ímpeto. Testes opostos
 * não têm DT: quem perde a disputa é tratado por quem chama (`opposedLoser`).
 * @param {{success: boolean}} result
 * @param {boolean} [showDt=true] Falso nos testes opostos.
 */
export function impetoFillsOnFailure(result, showDt = true) {
  return showDt !== false && result.success === false;
}

/** Em um teste oposto, quem perde (não o empate) enche a barra de ímpeto. */
export function opposedLoser(outcome) {
  if (outcome.winner === 'a') return 'b';
  if (outcome.winner === 'b') return 'a';
  return null;
}

/** Ganha marcadores de análise, até o máximo. */
export function gainAnalysis(current) {
  return Math.min(ANALISE_MAX, current + ANALISE_GAIN);
}

/**
 * Pontos de análise gastos para mudar os dados de `values` para `newValues` (1 ponto por unidade).
 */
export function analysisCost(values, newValues) {
  return values.reduce((sum, value, i) => sum + Math.abs(newValues[i] - value), 0);
}

/**
 * Aplica a análise: cada ponto muda um dado em +1 ou −1, quantas vezes quiser no mesmo dado,
 * sem sair de 1 até o máximo do dado.
 * @param {Object} input
 * @param {number[]} input.values Valores atuais dos dados do teste.
 * @param {number[]} input.sides Faces de cada dado.
 * @param {number[]} input.newValues Valores desejados.
 * @param {number} input.points Marcadores disponíveis.
 * @returns {{values: number[], cost: number}}
 */
export function applyAnalysis({ values, sides, newValues, points }) {
  if (newValues.length !== values.length) throw new RangeError('Quantidade de dados diferente.');
  newValues.forEach((value, i) => {
    if (!Number.isInteger(value) || value < 1 || value > sides[i]) {
      throw new RangeError(`Valor inválido para o d${sides[i]}: ${value}`);
    }
  });
  const cost = analysisCost(values, newValues);
  if (cost > points) throw new RangeError('Marcadores de análise insuficientes.');
  return { values: [...newValues], cost };
}

/** Dados que a habilidade de repetir pode rolar de novo: qualquer um cujo resultado não seja 1. */
export function rerollCandidates(values, sides) {
  return values.slice(0, sides.length).flatMap((value, i) => (value === 1 ? [] : [i]));
}

/** Troca o valor de um dado (devolve uma lista nova). */
export function replaceDie(values, index, newValue) {
  return values.map((value, i) => (i === index ? newValue : value));
}

/**
 * Resolve de novo um teste a partir dos mesmos dados-base e dos valores (já alterados) dos dados.
 * @param {Object} plan Entradas do teste (attrDie, skillDie, dt, extraDice, stepMods, modifier, fearDie).
 * @param {number[]} values Valores dos dados rolados, com o dado de pavor por último (se houver).
 */
export function resolveWithValues(plan, values) {
  return resolveTest({ ...plan, rng: sequenceRng(values) });
}

/**
 * Bônus das habilidades "ativadas" para o próximo teste, e o que cada uma gasta.
 * @param {string[]} active Habilidades ativadas na ficha ('impetoDado', 'sorrateiro', 'naoLetal').
 * @param {Object} context
 * @param {string} context.skillKey Perícia do teste.
 * @param {number} context.impeto Espaços de ímpeto.
 * @param {number} context.pd PD disponíveis (já descontado o custo do pavor).
 * @param {boolean} [context.allowNonLethal=false] Só o teste de lesão aceita o dano não letal.
 * @returns {{extraDice: number[], pdCost: number, impetoCost: number, used: string[]}}
 */
export function activeBoosts(active, { skillKey, impeto, pd, allowNonLethal = false }) {
  const boosts = { extraDice: [], pdCost: 0, impetoCost: 0, used: [] };
  if (active.includes('impetoDado') && impeto >= COSTS.impetoDado) {
    boosts.extraDice.push(4);
    boosts.impetoCost += COSTS.impetoDado;
    boosts.used.push('impetoDado');
  }
  if (active.includes('sorrateiro') && SNEAK_SKILLS.includes(skillKey) && pd >= COSTS.sorrateiro) {
    boosts.extraDice.push(8);
    boosts.pdCost += COSTS.sorrateiro;
    boosts.used.push('sorrateiro');
  }
  // Dano não letal (só no teste de lesão): +1d6, sem custo
  if (allowNonLethal && active.includes('naoLetal')) {
    boosts.extraDice.push(NON_LETHAL_BONUS_DIE);
    boosts.used.push('naoLetal');
  }
  return boosts;
}

/**
 * Reinício de cena de um personagem: zera os contadores de testes da cena, esvazia ímpeto e
 * análise, tira a contusão e o estupor, remove os efeitos "até o fim da cena", limpa o que foi
 * ativado, e quem está com 0 PV recupera 1. Quem tem a habilidade de ímpeto inicial já começa
 * a nova cena com 1 espaço.
 * @param {Object} state
 * @param {number} state.pv
 * @param {boolean} state.contusao
 * @param {boolean} state.estupor
 * @param {{fimDeCena: boolean}[]} state.efeitos
 * @param {boolean} state.impetoInicial O personagem tem a habilidade de ímpeto inicial.
 * @returns {Object} Valores novos, nas chaves da ficha (`system.*`).
 */
export function sceneReset(state) {
  return {
    'system.pv.value': state.pv === 0 ? 1 : state.pv,
    'system.estado.contusao': false,
    'system.estado.estupor': false,
    'system.cena.testesLesao': 0,
    'system.cena.testesTrauma': 0,
    'system.cena.curados': [],
    'system.cena.animalFerido': false,
    'system.recursos.impeto': state.impetoInicial ? 1 : 0,
    'system.recursos.analise': 0,
    'system.ativas': [],
    'system.passos.fisico': 0,
    'system.passos.mente': 0,
    'system.passos.emocao': 0,
    'system.passos.pericias': 0,
    'system.efeitos': state.efeitos.filter((effect) => !effect.fimDeCena),
  };
}
