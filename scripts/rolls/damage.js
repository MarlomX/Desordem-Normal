/**
 * Dano físico. Lógica pura, sem dependência do Foundry.
 */

/** Bases de dano de uma arma: rolagem alta (RA, o normal) ou rolagem baixa (RB, desarmado). */
export const DAMAGE_BASES = Object.freeze(['ra', 'rb']);

/**
 * Valor da base do dano num teste de ataque.
 * - RA: a rolagem alta; em sucesso crítico, `highSum` já soma as duas maiores rolagens.
 * - RB: a rolagem baixa; em sucesso crítico, soma também a rolagem alta («mais uma rolagem»).
 * @param {{highSum: number, highRoll: number, lowRoll: number, criticalSuccess: boolean}} result
 * @param {'ra'|'rb'} [base='ra']
 */
export function damageBaseValue(result, base = 'ra') {
  if (base !== 'rb') return result.highSum;
  return result.lowRoll + (result.criticalSuccess ? result.highRoll : 0);
}

/**
 * Dano de um ataque que acertou: a base da arma (RA ou RB) mais o modificador da arma.
 * @param {object} attackResult Retorno de `resolveTest`.
 * @param {number} [modifier=0] Modificador da arma (ex.: 2 para "RA+2").
 * @param {'ra'|'rb'} [base='ra'] Base do dano da arma.
 */
export function computeDamage(attackResult, modifier = 0, base = 'ra') {
  return Math.max(0, damageBaseValue(attackResult, base) + modifier);
}

/**
 * Aplica perda de PV, sem deixar o total abaixo de 0.
 * Exige teste de lesão quando o dano reduz o PV a 0 ou quando o personagem já estava em 0.
 * @param {{current: number, amount: number}} opts
 * @returns {{before: number, after: number, needsInjuryTest: boolean}}
 */
export function applyDamage({ current, amount }) {
  if (!Number.isInteger(amount) || amount < 0) throw new RangeError(`Dano inválido: ${amount}`);
  if (!Number.isInteger(current) || current < 0) throw new RangeError(`PV inválido: ${current}`);
  const after = Math.max(0, current - amount);
  return { before: current, after, needsInjuryTest: amount > 0 && after === 0 };
}
