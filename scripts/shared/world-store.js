/**
 * Dados guardados numa configuração do mundo (v0.28.3): desafios e tabelas das criaturas.
 *
 * A configuração fica no escopo "world", fora do menu de configurações. Todo cliente lê; só o
 * mestre grava. Quando o mestre grava, o Foundry manda o valor novo a todos e chama o `onChange`
 * em cada cliente, que avisa quem se registrou (janelas, guia, fichas).
 *
 * As gravações passam por uma fila (uma de cada vez, sempre relendo o valor atual), para dois
 * cliques seguidos não se sobreporem e um apagar o que o outro gravou.
 */
import { SYSTEM_ID } from '../config.js';

/**
 * Cria a store de uma configuração do mundo.
 * @param {object} options
 * @param {string} options.key Nome da configuração (não muda: os mundos já gravaram com ele).
 * @param {() => object} options.empty Valor vazio (padrão e resposta para dados ilegíveis).
 * @param {(raw: *) => object} options.normalize Limpa o valor lido e o valor a gravar.
 * @param {string} options.name Nome dos dados nas mensagens do console (ex.: 'desafios').
 * @param {string} options.the O mesmo com artigo (ex.: 'os desafios').
 * @param {() => void} [options.beforeListeners] Chamado no `onChange` antes de quem ouve.
 */
export function createWorldStore({ key, empty, normalize, name, the, beforeListeners }) {
  /** Quem precisa redesenhar quando os dados mudam. */
  const listeners = new Set();
  /** Fila das gravações do mestre (cada uma espera a anterior terminar). */
  let queue = Promise.resolve();

  /** Dados guardados, já limpos (uma configuração estragada vira o valor vazio). */
  function read() {
    try {
      return normalize(game.settings.get(SYSTEM_ID, key));
    } catch (error) {
      console.warn(`${SYSTEM_ID} | ${name} ilegíveis`, error);
      return empty();
    }
  }

  return {
    key,
    read,

    /** Registra a configuração (chamado uma vez, no init). */
    register() {
      game.settings.register(SYSTEM_ID, key, {
        scope: 'world',
        config: false,
        type: Object,
        default: empty(),
        onChange: () => {
          beforeListeners?.();
          // Um erro num ouvinte não impede os outros de redesenhar
          for (const callback of listeners) {
            try {
              callback();
            } catch (error) {
              console.error(`${SYSTEM_ID} | falha ao redesenhar ${the}`, error);
            }
          }
        },
      });
    },

    /** Avisa quando os dados mudam (devolve uma função para parar de ouvir). */
    onChange(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },

    /**
     * Muda os dados e grava (só o mestre). `change` recebe os dados atuais (relidos na hora) e
     * devolve os novos; se devolver os mesmos (ou nada), nada é gravado.
     * @param {(data: object) => object} change
     */
    mutate(change) {
      if (!game.user.isGM) return Promise.resolve();
      queue = queue
        .then(async () => {
          const data = read();
          const next = change(data);
          if (!next || next === data) return;
          await game.settings.set(SYSTEM_ID, key, normalize(next));
        })
        .catch((error) => console.error(`${SYSTEM_ID} | falha ao gravar ${the}`, error));
      return queue;
    },
  };
}
