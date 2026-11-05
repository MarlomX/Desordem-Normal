/**
 * Funções puras de dados. Não dependem do Foundry.
 */

/** Escada de passos dos dados de atributo e perícia. */
export const DIE_STEPS = Object.freeze([4, 6, 8, 10, 12]);

/**
 * Move um dado pela escada de passos, sem sair de d4 e d12.
 * @param {number} sides Lados do dado (4, 6, 8, 10 ou 12).
 * @param {number} delta Passos (positivo aumenta, negativo reduz).
 * @returns {number}
 */
export function stepShift(sides, delta) {
  const index = DIE_STEPS.indexOf(sides);
  if (index === -1) throw new RangeError(`Dado inválido na escada de passos: d${sides}`);
  const target = Math.min(DIE_STEPS.length - 1, Math.max(0, index + delta));
  return DIE_STEPS[target];
}

export const stepUp = (sides, steps = 1) => stepShift(sides, steps);
export const stepDown = (sides, steps = 1) => stepShift(sides, -steps);

/** Gerador padrão: inteiro de 1 a `sides`. */
export function defaultRng(sides) {
  return Math.floor(Math.random() * sides) + 1;
}

/**
 * Rola um dado usando um gerador injetável (útil para testes e para o Foundry).
 * @param {number} sides
 * @param {(sides: number) => number} [rng]
 */
export function rollDie(sides, rng = defaultRng) {
  if (!Number.isInteger(sides) || sides < 2) throw new RangeError(`Dado inválido: d${sides}`);
  const value = rng(sides);
  if (!Number.isInteger(value) || value < 1 || value > sides) {
    throw new RangeError(`O gerador devolveu ${value} para um d${sides}`);
  }
  return value;
}
