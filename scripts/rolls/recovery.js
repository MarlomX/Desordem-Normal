/**
 * Recuperação de PV ou PD (cura, motivar etc.). Lógica pura, sem dependência do Foundry.
 */

/**
 * Soma a recuperação ao recurso, sem ultrapassar o máximo.
 * @param {Object} input
 * @param {number} input.current Valor atual.
 * @param {number} input.max Valor máximo.
 * @param {number} input.amount Quantidade recuperada (negativos e frações são ignorados).
 * @returns {{before: number, after: number, recovered: number}} `recovered` é o ganho real.
 */
export function applyRecovery({ current, max, amount }) {
  const gain = Math.max(0, Math.trunc(amount) || 0);
  const after = Math.max(current, Math.min(max, current + gain));
  return { before: current, after, recovered: after - current };
}
