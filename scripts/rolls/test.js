/**
 * Teste básico: lógica pura, sem dependência do Foundry.
 */
import { stepShift, rollDie, defaultRng } from './dice.js';

export const DEFAULT_DT = 7;
export const MAX_ROLLED = 4; // máximo de dados rolados por teste
export const MAX_COUNTED = 3; // máximo de dados somados
export const CRIT_MIN_VALUE = 6; // valor mínimo para sucesso crítico

const TARGETS = ['attribute', 'skill', 'both'];

/**
 * @typedef {Object} StepMod
 * @property {'attribute'|'skill'|'both'} target Qual dado base o efeito altera.
 * @property {number} steps Positivo aumenta, negativo reduz.
 */

/**
 * Define quais dados serão rolados, sem rolar nada.
 * Aplica os passos aos dados base e respeita o limite de 4 dados rolados.
 * Permite rolar os dados fora desta função (ex.: de forma assíncrona no Foundry).
 * @param {Object} opts
 * @param {number} opts.attrDie
 * @param {number} opts.skillDie
 * @param {number[]} [opts.extraDice=[]]
 * @param {StepMod[]} [opts.stepMods=[]]
 */
export function planDice({ attrDie, skillDie, extraDice = [], stepMods = [] }) {
  // Passos líquidos por dado base
  let attrShift = 0;
  let skillShift = 0;
  for (const mod of stepMods) {
    if (!TARGETS.includes(mod.target)) throw new RangeError(`Alvo de passo inválido: ${mod.target}`);
    if (mod.target !== 'skill') attrShift += mod.steps;
    if (mod.target !== 'attribute') skillShift += mod.steps;
  }
  const attrFinal = stepShift(attrDie, attrShift);
  const skillFinal = stepShift(skillDie, skillShift);

  // Dados a rolar (máximo 4; o excedente é descartado)
  const allSides = [attrFinal, skillFinal, ...extraDice];
  return {
    attrFinal,
    skillFinal,
    rolledSides: allSides.slice(0, MAX_ROLLED),
    discardedExtras: allSides.slice(MAX_ROLLED),
  };
}

/**
 * Resolve um teste básico.
 * @param {Object} opts
 * @param {number} opts.attrDie Dado do atributo (4 a 12).
 * @param {number} opts.skillDie Dado da perícia (4 a 12).
 * @param {number} [opts.dt=7]
 * @param {number[]} [opts.extraDice=[]] Dados adicionais (ex.: [6] para +1d6).
 * @param {StepMod[]} [opts.stepMods=[]] Aumentos/reduções de passo.
 * @param {(sides: number) => number} [opts.rng]
 */
export function resolveTest({
  attrDie,
  skillDie,
  dt = DEFAULT_DT,
  extraDice = [],
  stepMods = [],
  rng = defaultRng,
}) {
  // 1-2. Dados a rolar (passos aplicados, máximo de 4 rolados)
  const { attrFinal, skillFinal, rolledSides, discardedExtras } = planDice({
    attrDie,
    skillDie,
    extraDice,
    stepMods,
  });

  const sources = ['attribute', 'skill'];
  const dice = rolledSides.map((sides, i) => ({
    sides,
    value: rollDie(sides, rng),
    source: sources[i] ?? 'extra',
    counted: false,
  }));

  // 3. Soma só os 3 maiores (empate: o dado mais à esquerda é mantido)
  dice
    .map((die, index) => ({ die, index }))
    .sort((a, b) => b.die.value - a.die.value || a.index - b.index)
    .slice(0, MAX_COUNTED)
    .forEach(({ die }) => {
      die.counted = true;
    });

  const counted = dice.filter((d) => d.counted);
  const countedValues = counted.map((d) => d.value).sort((a, b) => b - a);
  const total = countedValues.reduce((sum, v) => sum + v, 0);

  // 4. RA e RB (só dados somados)
  const highRoll = countedValues[0];
  const lowRoll = countedValues[countedValues.length - 1];

  // 5. Críticos (consideram todos os dados rolados)
  const occurrences = new Map();
  for (const { value } of dice) occurrences.set(value, (occurrences.get(value) ?? 0) + 1);
  const criticalSuccess = [...occurrences].some(([v, n]) => n >= 2 && v >= CRIT_MIN_VALUE);
  const criticalFailure = dice.every((d) => d.value === 1);

  // Em ataques e testes estendidos, o crítico soma as duas maiores rolagens
  const highSum = criticalSuccess ? countedValues[0] + (countedValues[1] ?? 0) : highRoll;

  const success = criticalFailure ? false : criticalSuccess ? true : total >= dt;

  return {
    dt,
    dice,
    total,
    highRoll,
    lowRoll,
    highSum,
    criticalSuccess,
    criticalFailure,
    success,
    discardedExtras,
    base: {
      attribute: { original: attrDie, final: attrFinal },
      skill: { original: skillDie, final: skillFinal },
    },
  };
}