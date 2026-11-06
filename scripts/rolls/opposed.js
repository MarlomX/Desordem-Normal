/**
 * Teste oposto: compara os resultados de dois testes já resolvidos.
 * Lógica pura, sem dependência do Foundry.
 */

/**
 * Pontuação de crítico de um resultado: +1 sucesso crítico, -1 falha crítica, 0 nenhum.
 * @param {{criticalSuccess: boolean, criticalFailure: boolean}} result
 */
function criticalScore(result) {
  if (result.criticalSuccess) return 1;
  if (result.criticalFailure) return -1;
  return 0;
}

/**
 * Compara dois resultados de `resolveTest`.
 *
 * Ordem de decisão:
 * 1. Se os críticos diferem, vence quem está melhor (sucesso crítico > nenhum > falha crítica).
 * 2. Se os críticos são do mesmo tipo (ou nenhum), vence o maior total.
 * 3. Total igual: `empate` (cada regra do combate decide o que fazer com ele).
 *
 * `margin` é a diferença entre os totais a favor do vencedor, nunca negativa. Se um crítico
 * decidiu a disputa contra um total maior, a margem é 0 (não conta como "vencer por 5 ou mais").
 *
 * @param {{total: number, criticalSuccess: boolean, criticalFailure: boolean}} a
 * @param {{total: number, criticalSuccess: boolean, criticalFailure: boolean}} b
 * @returns {{winner: 'a'|'b'|'empate', margin: number, decidedBy: 'critical'|'total'|'empate'}}
 */
export function resolveOpposed(a, b) {
  const scoreA = criticalScore(a);
  const scoreB = criticalScore(b);

  if (scoreA !== scoreB) {
    const winner = scoreA > scoreB ? 'a' : 'b';
    const diff = winner === 'a' ? a.total - b.total : b.total - a.total;
    return { winner, margin: Math.max(0, diff), decidedBy: 'critical' };
  }

  if (a.total === b.total) return { winner: 'empate', margin: 0, decidedBy: 'empate' };

  const winner = a.total > b.total ? 'a' : 'b';
  return { winner, margin: Math.abs(a.total - b.total), decidedBy: 'total' };
}
