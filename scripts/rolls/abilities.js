/**
 * Habilidades: regras puras (sem dependência do Foundry) das habilidades automatizadas, dos
 * recursos que elas usam (barra de ímpeto, marcadores de análise) e do reinício de cena.
 */
import { resolveTest } from './test.js';
import { NON_LETHAL_BONUS_DIE } from './injury.js';
import { sequenceRng } from './dice.js';
import {
  ANALISE_GAIN,
  ANALISE_MAX,
  COSTS,
  IMPETO_MAX,
  SNEAK_SKILLS,
  dialogDiceOptions,
  legacyEffects,
} from './ability-effects.js';

// Os números das habilidades antigas agora moram no catálogo de efeitos (ability-effects.js)
export { ANALISE_GAIN, ANALISE_MAX, COSTS, IMPETO_MAX, SNEAK_SKILLS };

/** Dado somado ao teste de Defender-se (regras p. 18). */
export const DEFENSE_BONUS_DIE = 6;

/** Automações antigas (campo `automacao` do item; os efeitos equivalentes vêm de ability-effects.js). */
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

/** Dados extras das automações antigas de ímpeto e furtividade (padrão de `activeBoosts`). */
const LEGACY_DICE = [...legacyEffects('impeto'), ...legacyEffects('sorrateiro')];

/**
 * Bônus das habilidades marcadas na janela pré-teste, e o que cada uma gasta.
 * @param {string[]} active Opções marcadas (ids dos efeitos `dadoExtra`, 'naoLetal', 'defesa').
 * @param {Object} context
 * @param {string} context.skillKey Perícia do teste.
 * @param {number} context.impeto Espaços de ímpeto.
 * @param {number} context.pd PD disponíveis (já descontado o custo do pavor).
 * @param {object[]} [context.diceOptions] Dados extras do ator (`dialogDiceOptions`); sem isso,
 *   valem os das automações antigas de ímpeto e furtividade.
 * @param {boolean} [context.allowNonLethal=false] Só o teste de lesão aceita o dano não letal.
 * @param {boolean} [context.allowDefense=false] Só o teste de Defender-se aceita o d6 da defesa.
 * @returns {{extraDice: number[], pdCost: number, impetoCost: number, used: string[]}}
 */
export function activeBoosts(
  active,
  { skillKey, impeto, pd, diceOptions, allowNonLethal = false, allowDefense = false },
) {
  const boosts = { extraDice: [], pdCost: 0, impetoCost: 0, used: [] };
  const options = diceOptions ?? dialogDiceOptions(LEGACY_DICE, { skillKey });
  for (const option of options) {
    if (!active.includes(option.key)) continue;
    // Cada opção confere o recurso inteiro (como a janela pré-teste)
    if (option.cost.impeto > impeto || option.cost.pd > pd) continue;
    boosts.extraDice.push(option.die);
    boosts.pdCost += option.cost.pd;
    boosts.impetoCost += option.cost.impeto;
    boosts.used.push(option.key);
  }
  // Dano não letal (só no teste de lesão): +1d6, sem custo
  if (allowNonLethal && active.includes('naoLetal')) {
    boosts.extraDice.push(NON_LETHAL_BONUS_DIE);
    boosts.used.push('naoLetal');
  }
  // Defender-se (só no teste de defesa do teste oposto): +d6, sem custo. Desmarcado na janela,
  // o mesmo teste serve para uma esquiva sem o dado (poderes parecidos com defender-se)
  if (allowDefense && active.includes('defesa')) {
    boosts.extraDice.push(DEFENSE_BONUS_DIE);
    boosts.used.push('defesa');
  }
  return boosts;
}

/**
 * Reinício de cena de um personagem: zera os contadores de testes da cena, tira a contusão e o
 * estupor, remove os efeitos "até o fim da cena", limpa o que foi ativado, e quem está com 0 PV
 * recupera 1. Os recursos das habilidades (ímpeto, análise...) chegam já calculados por
 * `sceneResources` (esvaziar e ganhos de início de cena).
 * @param {Object} state
 * @param {number} state.pv
 * @param {boolean} state.contusao
 * @param {boolean} state.estupor
 * @param {{fimDeCena: boolean}[]} state.efeitos
 * @param {Object<string, number>} [state.recursos] Valor novo de cada recurso das habilidades.
 * @returns {Object} Valores novos, nas chaves da ficha (`system.*`).
 */
export function sceneReset(state) {
  const resources = Object.fromEntries(
    Object.entries(state.recursos ?? {}).map(([key, value]) => [
      `system.recursosHab.${key}`,
      value,
    ]),
  );
  return {
    'system.pv.value': state.pv === 0 ? 1 : state.pv,
    'system.estado.contusao': false,
    'system.estado.estupor': false,
    // Com o PV de volta (1 PV a quem estava em 0), o personagem deixa de estar moribundo
    'system.estado.moribundo': false,
    'system.cena.testesLesao': 0,
    'system.cena.primeirosSocorros': 0,
    'system.cena.testesTrauma': 0,
    'system.cena.curados': [],
    'system.cena.animalFerido': false,
    // Dados bônus recebidos valem só até o fim da cena
    'system.dadosBonus': [],
    ...resources,
    'system.ativas': [],
    'system.passos.fisico': 0,
    'system.passos.mente': 0,
    'system.passos.emocao': 0,
    'system.passos.pericias': 0,
    'system.efeitos': state.efeitos.filter((effect) => !effect.fimDeCena),
  };
}
