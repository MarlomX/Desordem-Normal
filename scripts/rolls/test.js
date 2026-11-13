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
 * @param {number} [opts.modifier=0] Modificador fixo somado ao total (ex.: penalidade de lesão).
 *   Não altera RA, RB nem críticos, que dependem só dos dados.
 * @param {number|null} [opts.fearDie=null] Lados do dado de pavor (4 a 20), rolado junto ao teste
 *   e depois dos demais dados. Ele não soma: anula os dados do teste menores que ele (os iguais
 *   ficam). Dados anulados não somam e não formam sucesso crítico, mas continuam valendo para RA
 *   e RB (o pavor só muda a soma); se todos forem anulados, o teste é falha crítica. Fica fora
 *   dos limites de 4 rolados e 3 somados.
 * @param {(sides: number) => number} [opts.rng]
 */
export function resolveTest({
  attrDie,
  skillDie,
  dt = DEFAULT_DT,
  extraDice = [],
  stepMods = [],
  modifier = 0,
  fearDie = null,
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
    annulled: false,
  }));

  // Dado de pavor: rolado depois dos dados do teste; anula os dados menores que ele
  const fearValue = fearDie ? rollDie(fearDie, rng) : null;
  if (fearValue !== null) {
    for (const die of dice) die.annulled = die.value < fearValue;
  }
  const devouredAll = dice.length > 0 && dice.every((d) => d.annulled);

  // 3. Soma só os 3 maiores dos dados não anulados (empate: o dado mais à esquerda é mantido)
  dice
    .map((die, index) => ({ die, index }))
    .filter(({ die }) => !die.annulled)
    .sort((a, b) => b.die.value - a.die.value || a.index - b.index)
    .slice(0, MAX_COUNTED)
    .forEach(({ die }) => {
      die.counted = true;
    });

  const counted = dice.filter((d) => d.counted);
  const countedValues = counted.map((d) => d.value).sort((a, b) => b - a);
  const total = countedValues.reduce((sum, v) => sum + v, 0) + modifier;

  // 4. RA e RB: os 3 maiores dados rolados, anulados ou não (o pavor não os altera, só a soma).
  //    Sem pavor, são os mesmos dados da soma.
  const topValues = dice
    .map((d) => d.value)
    .sort((a, b) => b - a)
    .slice(0, MAX_COUNTED);
  const highRoll = topValues[0] ?? 0;
  const lowRoll = topValues[topValues.length - 1] ?? 0;

  // 5. Críticos (consideram todos os dados rolados que não foram anulados pelo pavor)
  const occurrences = new Map();
  for (const { value, annulled } of dice) {
    if (!annulled) occurrences.set(value, (occurrences.get(value) ?? 0) + 1);
  }
  const criticalSuccess = [...occurrences].some(([v, n]) => n >= 2 && v >= CRIT_MIN_VALUE);
  const criticalFailure = devouredAll || dice.every((d) => d.value === 1);

  // Em ataques e testes estendidos, o crítico soma as duas maiores rolagens
  const highSum = criticalSuccess ? countedValues[0] + (countedValues[1] ?? 0) : highRoll;

  const success = criticalFailure ? false : criticalSuccess ? true : total >= dt;

  return {
    dt,
    dice,
    modifier,
    total,
    highRoll,
    lowRoll,
    highSum,
    criticalSuccess,
    criticalFailure,
    success,
    discardedExtras,
    devouredAll,
    fear:
      fearValue === null
        ? null
        : {
            sides: fearDie,
            value: fearValue,
            ended: fearValue === 1, // 1 no dado de pavor encerra o efeito
            devoured: dice.filter((d) => d.annulled).length,
          },
    base: {
      attribute: { original: attrDie, final: attrFinal },
      skill: { original: skillDie, final: skillFinal },
    },
  };
}