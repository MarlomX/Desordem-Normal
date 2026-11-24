/**
 * Trava local contra pedidos repetidos (v0.28.4). Dois cliques (ou dois pedidos pelo socket)
 * chegados juntos leriam o cartão ainda livre antes da primeira gravação terminar; a trava faz o
 * segundo ser ignorado enquanto o primeiro roda. Vale só neste navegador.
 */

/**
 * Cria uma trava por chave (id da mensagem, da mensagem com o lado, etc.).
 * @returns {{busy: (key: string) => boolean, run: (key: string, task: () => Promise<*>) => Promise<*>}}
 */
export function createLock() {
  const keys = new Set();
  return {
    /** A chave está em uso agora? */
    busy: (key) => keys.has(key),
    /**
     * Roda `task` se a chave estiver livre (e a libera no fim, mesmo com erro). Com a chave em uso,
     * não roda e devolve `undefined`.
     */
    async run(key, task) {
      if (keys.has(key)) return undefined;
      keys.add(key);
      try {
        return await task();
      } finally {
        keys.delete(key);
      }
    },
  };
}
