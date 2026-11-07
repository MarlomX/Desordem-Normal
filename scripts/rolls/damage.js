/**
 * Dano físico. Lógica pura, sem dependência do Foundry.
 */

/**
 * Dano de um ataque que acertou: rolagem alta (RA) do teste mais o modificador da arma.
 * Em sucesso crítico, `highSum` já soma as duas maiores rolagens.
 * @param {{highSum: number}} attackResult Retorno de `resolveTest`.
 * @param {number} [modifier=0] Modificador da arma (ex.: 2 para "RA+2").
 */
export function computeDamage(attackResult, modifier = 0) {
  return Math.max(0, attackResult.highSum + modifier);
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
