/**
 * Ação de ajuda: o ajudante não faz teste, só o dado da perícia dele importa.
 * Lógica pura, sem dependência do Foundry.
 */
import { DIE_STEPS } from './dice.js';

export const HELP_MIN_DIE = 6; // com d4 não é possível ajudar

function assertDie(sides) {
  if (!DIE_STEPS.includes(sides)) throw new RangeError(`Dado de perícia inválido: d${sides}`);
}

/** O ajudante pode ajudar? Precisa de pelo menos d6 na perícia escolhida. */
export function canHelp(skillDie) {
  assertDie(skillDie);
  return skillDie >= HELP_MIN_DIE;
}

/**
 * Aumentos de passo fornecidos: 1 para d6/d8, 2 para d10/d12, 0 para d4 (não pode ajudar).
 * @param {number} skillDie Dado da perícia do ajudante.
 */
export function helpSteps(skillDie) {
  if (!canHelp(skillDie)) return 0;
  return skillDie >= 10 ? 2 : 1;
}

/**
 * Aplica uma ajuda às opções de um teste, sem alterar o objeto original.
 * O passo vale só para o dado da perícia (alvo 'skill'); várias ajudas se acumulam
 * (os tetos de dado já são respeitados por `planDice`).
 *
 * @param {{stepMods?: import('./test.js').StepMod[], extraDice?: number[]}} testOpts
 * @param {number} helperSkillDie Dado da perícia escolhida pelo ajudante.
 * @param {number[]} [bonusDice=[]] Dados bônus extras (ex.: de uma relação invocada).
 * @returns {{stepMods: import('./test.js').StepMod[], extraDice: number[]}}
 */
export function applyHelp(testOpts, helperSkillDie, bonusDice = []) {
  if (!canHelp(helperSkillDie)) {
    throw new RangeError(`Não é possível ajudar com d${helperSkillDie} (mínimo d${HELP_MIN_DIE})`);
  }
  bonusDice.forEach(assertDie);
  return {
    ...testOpts,
    stepMods: [...(testOpts.stepMods ?? []), { target: 'skill', steps: helpSteps(helperSkillDie) }],
    extraDice: [...(testOpts.extraDice ?? []), ...bonusDice],
  };
}
