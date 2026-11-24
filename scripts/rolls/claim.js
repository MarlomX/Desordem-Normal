/**
 * Reserva de botão de uso único guardada no cartão do chat (v0.28.4). Lógica pura.
 *
 * O clique marca o cartão como «aplicando» (com a hora) antes de gravar; outro clique só passa se
 * o cartão estiver livre ou se a reserva estiver parada há mais que o prazo (o navegador de quem
 * clicou caiu no meio). Usada pelo avanço da perseguição, pelo esconderijo, pelo equilíbrio e pela
 * tabela pendente; cada um tem os próprios nomes de campo e o próprio estado livre (são dados já
 * gravados nos cartões e não mudam).
 */

/** Prazo de uma reserva parada (30 s). */
export const CLAIM_TIMEOUT_MS = 30_000;

/**
 * Regras de reserva de um tipo de cartão.
 * @param {object} options
 * @param {string} options.free Estado livre (ex.: 'pendente', 'aberto').
 * @param {string} [options.busy] Estado reservado.
 * @param {string} [options.stateKey] Campo do estado.
 * @param {string} [options.timeKey] Campo da hora da reserva.
 * @param {number} [options.timeoutMs] Prazo da reserva parada.
 */
export function claimRules({
  free,
  busy = 'aplicando',
  stateKey = 'estado',
  timeKey = 'reservadoEm',
  timeoutMs = CLAIM_TIMEOUT_MS,
}) {
  /** A reserva está parada há tempo demais (pode ser refeita)? */
  const stale = (flag, now) => flag?.[stateKey] === busy && now - (flag[timeKey] ?? 0) > timeoutMs;
  /** O botão pode ser usado agora (livre, ou reserva parada)? */
  const claimable = (flag, now) => flag?.[stateKey] === free || stale(flag, now);
  return {
    stale,
    claimable,
    /** Reserva o clique. `null` se já foi usado ou está em uso. */
    reserve: (flag, now) =>
      claimable(flag, now) ? { ...flag, [stateKey]: busy, [timeKey]: now } : null,
    /** Desfaz a reserva (a gravação falhou ou o passo não valeu). */
    release: (flag) => ({ ...flag, [stateKey]: free, [timeKey]: null }),
  };
}
