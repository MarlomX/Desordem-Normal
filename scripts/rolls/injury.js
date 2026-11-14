/**
 * Teste de lesão, tabela de lesões e seus efeitos. Lógica pura, sem dependência do Foundry.
 *
 * Decisão de regras: o playtest não define o "teste de morte". Até a comunidade receber um
 * esclarecimento, ele é tratado como um teste de lesão (mesmo contador de testes na cena).
 */
import { resolveTest } from './test.js';

export const INJURY_BASE_DT = 7;
export const INJURY_DT_STEP = 3;
export const NON_LETHAL_BONUS_DIE = 6; // +1d6 quando o dano não letal ajudou a zerar o PV
export const LESION_DIE = 20;

/** DT do teste de lesão: 7, +3 por teste de lesão já feito na cena. */
export function injuryDT(previousTests) {
  if (!Number.isInteger(previousTests) || previousTests < 0) {
    throw new RangeError(`Quantidade de testes inválida: ${previousTests}`);
  }
  return INJURY_BASE_DT + INJURY_DT_STEP * previousTests;
}

/**
 * Opções do teste (Físico + Vigor) que dependem só da regra de lesão.
 * @param {{previousTests?: number, nonLethal?: boolean}} opts
 * @returns {{dt: number, extraDice: number[]}}
 */
export function injuryTestOptions({ previousTests = 0, nonLethal = false } = {}) {
  return {
    dt: injuryDT(previousTests),
    extraDice: nonLethal ? [NON_LETHAL_BONUS_DIE] : [],
  };
}

/** @returns {'criticalSuccess'|'success'|'failure'|'criticalFailure'} */
export function injuryOutcome(result) {
  if (result.criticalFailure) return 'criticalFailure';
  if (result.criticalSuccess) return 'criticalSuccess';
  return result.success ? 'success' : 'failure';
}

/**
 * Resolve um teste de lesão completo (Físico + Vigor).
 * @param {Object} opts
 * @param {number} opts.attrDie Físico.
 * @param {number} opts.skillDie Vigor.
 * @param {number} [opts.previousTests=0]
 * @param {boolean} [opts.nonLethal=false]
 * @param {number[]} [opts.extraDice]
 * @param {import('./test.js').StepMod[]} [opts.stepMods]
 * @param {number} [opts.modifier]
 * @param {(sides: number) => number} [opts.rng]
 */
export function resolveInjuryTest({
  attrDie,
  skillDie,
  previousTests = 0,
  nonLethal = false,
  extraDice = [],
  stepMods,
  modifier,
  rng,
}) {
  const rule = injuryTestOptions({ previousTests, nonLethal });
  const test = resolveTest({
    attrDie,
    skillDie,
    dt: rule.dt,
    extraDice: [...extraDice, ...rule.extraDice],
    stepMods,
    modifier,
    rng,
  });
  return { dt: rule.dt, test, outcome: injuryOutcome(test) };
}

/** Efeitos de cada resultado do teste, como chaves de idioma (DESORDEM.Lesao.Efeito.*). */
const OUTCOME_EFFECTS = {
  criticalSuccess: ['recuperaPV', 'removeCondicoes'],
  success: ['inconscienteMoribundo'],
  failure: ['sofreLesao'],
  criticalFailure: ['morre'],
};

export const outcomeEffects = (outcome) => [...OUTCOME_EFFECTS[outcome]];

/**
 * Tabela de lesões (d20). Os textos ficam no arquivo de idioma (DESORDEM.Lesoes.<key>).
 * - kind: 'death' | 'slowDeath' | 'wound' | 'permanent' | 'temporary' | 'adrenaline'
 * - mods: modificador fixo por perícia (somado ao total dos testes dela).
 */
export const LESIONS = Object.freeze([
  { key: 'morteSubita', min: 1, max: 4, kind: 'death' },
  { key: 'morteLenta', min: 5, max: 9, kind: 'slowDeath' },
  { key: 'lacearacaoProfunda', min: 10, max: 10, kind: 'permanent', pvMaxLoss: 2, stacks: true },
  { key: 'semOlho', min: 11, max: 11, kind: 'permanent', mods: { percepcao: -1, pontaria: -1 } },
  { key: 'semMao', min: 12, max: 12, kind: 'permanent' },
  { key: 'semPe', min: 13, max: 13, kind: 'permanent' },
  { key: 'tendaoComprometido', min: 14, max: 14, kind: 'permanent', mods: { acrobacia: -2 } },
  { key: 'musculoComprometido', min: 15, max: 15, kind: 'permanent', mods: { atletismo: -2 } },
  { key: 'orgaoInternoComprometido', min: 16, max: 16, kind: 'permanent', mods: { vigor: -2 } },
  {
    key: 'orgaoSensorialComprometido',
    min: 17,
    max: 17,
    kind: 'permanent',
    mods: { percepcao: -2 },
  },
  {
    key: 'cicatrizAssustadora',
    min: 18,
    max: 18,
    kind: 'permanent',
    mods: { persuasao: -2, intimidar: 1 },
  },
  { key: 'contusao', min: 19, max: 19, kind: 'temporary' },
  { key: 'surtoAdrenalina', min: 20, max: Infinity, kind: 'adrenaline' },
]);

/**
 * Junta o dano não letal vindo de dois caminhos: o marcador direto (dano de arma não letal que
 * zerou o PV) e a habilidade "naoLetal" marcada na janela do teste. O d6 só pode entrar uma vez:
 * com o marcador direto, ele já vem das regras do teste e a habilidade é descartada.
 * @param {boolean} flag Marcador direto de dano não letal.
 * @param {string[]} active Habilidades marcadas na janela do teste.
 * @returns {{nonLethal: boolean, active: string[]}} `nonLethal` vale para a tabela de lesões (2d20)
 *   e `active` é a lista de habilidades que ainda geram dado.
 */
export function resolveNonLethal(flag, active = []) {
  const chosen = active.includes('naoLetal');
  return {
    nonLethal: Boolean(flag) || chosen,
    active: flag ? active.filter((key) => key !== 'naoLetal') : [...active],
  };
}

/** Quantos d20 rolar na tabela: 2 (fica o melhor) se o dano não letal ajudou a zerar o PV. */
export const lesionRollCount = (nonLethal) => (nonLethal ? 2 : 1);

export function bestLesionRoll(values) {
  if (values.length === 0) throw new RangeError('Nenhuma rolagem de lesão');
  return Math.max(...values);
}

/** Entrada da tabela para um valor de d20 (abaixo de 1 conta como 1). */
export function lookupLesion(value) {
  const v = Math.max(1, value);
  return LESIONS.find((entry) => v >= entry.min && v <= entry.max);
}

/**
 * Entrada sorteada e se é preciso rolar de novo (lesão permanente que o personagem já tem,
 * exceto as que se acumulam).
 * @param {number} value
 * @param {string[]} owned Chaves das lesões que o personagem já possui.
 */
export function pickLesion(value, owned = []) {
  const entry = lookupLesion(value);
  const reroll = entry.kind === 'permanent' && !entry.stacks && owned.includes(entry.key);
  return { entry, reroll };
}

/** Soma dos modificadores fixos que as lesões do personagem dão a uma perícia. */
export function lesionModifier(owned = [], skillKey) {
  return owned.reduce((sum, key) => {
    const entry = LESIONS.find((e) => e.key === key);
    return sum + (entry?.mods?.[skillKey] ?? 0);
  }, 0);
}

/** Contusão reduz o Físico em um passo (até o fim da cena). */
export function contusionStepMods(estado, attrKey) {
  return estado?.contusao && attrKey === 'fisico' ? [{ target: 'attribute', steps: -1 }] : [];
}

/**
 * Estado de saúde usado nas funções abaixo.
 * @typedef {Object} HealthState
 * @property {number} pv
 * @property {number} pvMax
 * @property {boolean} inconsciente
 * @property {boolean} moribundo
 * @property {boolean} morto
 * @property {boolean} morteLenta
 * @property {boolean} contusao
 * @property {string[]} lesoes
 */

const heal = (state, amount) => ({ ...state, pv: Math.min(state.pvMax, state.pv + amount) });

/** Aplica o resultado do teste de lesão (a lesão em si vem depois, em `applyLesion`). */
export function applyInjuryOutcome(state, outcome) {
  switch (outcome) {
    case 'criticalSuccess':
      return { ...heal(state, 1), inconsciente: false, moribundo: false };
    case 'success':
      return { ...state, inconsciente: true, moribundo: true };
    case 'criticalFailure':
      return { ...state, morto: true };
    case 'failure':
      return { ...state };
    default:
      throw new RangeError(`Resultado de lesão desconhecido: ${outcome}`);
  }
}

/**
 * Aplica uma lesão sorteada. Não mexe no estado moribundo: ele só termina em sucesso crítico
 * no teste de lesão ou ao fim da cena.
 * @param {HealthState} state
 * @param {(typeof LESIONS)[number]} entry
 */
export function applyLesion(state, entry) {
  const next = { ...state, lesoes: [...state.lesoes] };
  if (entry.kind === 'death') return { ...next, morto: true };
  if (entry.kind === 'slowDeath')
    return { ...heal(next, 1), inconsciente: false, morteLenta: true };
  if (entry.kind === 'adrenaline') return heal(next, 1);
  if (entry.kind === 'temporary') return { ...next, contusao: true };

  next.lesoes.push(entry.key);
  if (entry.pvMaxLoss) {
    // Perda permanente do PV máximo (acumula a cada laceração)
    next.pvMax = Math.max(0, next.pvMax - entry.pvMaxLoss);
    next.pv = Math.min(next.pv, next.pvMax);
  }
  return next;
}
