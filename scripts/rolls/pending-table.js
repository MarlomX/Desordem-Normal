/**
 * Tabelas de lesão e de trauma "pendentes". Quando um teste de lesão ou de trauma falha, a tabela
 * não é rolada na hora: o cartão do chat guarda um estado pendente (nas flags da mensagem) e um
 * botão deixa o jogador rolar a tabela depois. Lógica pura, sem dependência do Foundry.
 *
 * Ciclo de vida de um estado pendente:
 *   pending --(rolling)--> rolling --(rolled)--> rolled
 *                             └--(pending)--> pending   (a rolagem deu erro e foi desfeita)
 * "rolling" é a reserva feita no clique, para dois cliques não rolarem a mesma tabela duas vezes.
 */

export const TABLE_KINDS = Object.freeze(['lesion', 'trauma']);

/** Depois deste tempo, uma reserva "rolling" é considerada abandonada (navegador fechado etc.). */
export const CLAIM_TIMEOUT_MS = 30_000;

const MAX_ROLLS_STORED = 40;
const TABLE_DIE = 20;

/**
 * Cria o estado pendente guardado no cartão.
 * @param {Object} opts
 * @param {'lesion'|'trauma'} opts.kind
 * @param {boolean} [opts.nonLethal=false] Só vale para lesão: a tabela rola 2d20 e fica o melhor.
 * @param {number} opts.testNumber Número do teste na cena (para o título do resultado).
 * @param {string} opts.actorUuid UUID do personagem que sofrerá o efeito.
 */
export function createPending({ kind, nonLethal = false, testNumber, actorUuid }) {
  if (!TABLE_KINDS.includes(kind)) throw new RangeError(`Tipo de tabela desconhecido: ${kind}`);
  return {
    kind,
    status: 'pending',
    nonLethal: kind === 'lesion' && Boolean(nonLethal),
    testNumber,
    actorUuid,
    claimedAt: null,
    result: null,
  };
}

/** Quantos d20 aparecem na janela: 2 (fica o melhor) na lesão com dano não letal, senão 1. */
export const tableDiceCount = (pending) => (pending.kind === 'lesion' && pending.nonLethal ? 2 : 1);

/** A reserva "rolling" já passou do prazo e pode ser refeita? */
const isStale = (pending, now) =>
  pending.status === 'rolling' && now - (pending.claimedAt ?? 0) > CLAIM_TIMEOUT_MS;

/** A tabela ainda pode ser rolada (pendente, ou com a reserva abandonada)? */
export const isClaimable = (pending, now) => pending.status === 'pending' || isStale(pending, now);

/** Aceita só um resultado bem formado: { key: texto curto, rolls: d20 inteiros }. */
function cleanResult(result) {
  if (!result || typeof result.key !== 'string' || result.key.length === 0) return null;
  if (result.key.length > 60 || !Array.isArray(result.rolls)) return null;
  if (result.rolls.length === 0 || result.rolls.length > MAX_ROLLS_STORED) return null;
  const valid = result.rolls.every(
    (value) => Number.isInteger(value) && value >= 1 && value <= TABLE_DIE,
  );
  return valid ? { key: result.key, rolls: [...result.rolls] } : null;
}

/**
 * Decide se uma mudança de estado é permitida e devolve as alterações a gravar (ou null se não for).
 * É a única porta de entrada para mudar o estado, tanto no clique direto quanto no pedido via socket.
 * @param {ReturnType<typeof createPending>} pending Estado atual.
 * @param {{status: 'rolling'|'rolled'|'pending', result?: {key: string, rolls: number[]}}} request
 * @param {number} now Hora atual em milissegundos.
 * @returns {object|null}
 */
export function nextTableState(pending, request, now) {
  if (!pending || !request) return null;
  switch (request.status) {
    case 'rolling':
      return isClaimable(pending, now) ? { status: 'rolling', claimedAt: now, result: null } : null;
    case 'rolled': {
      const result = cleanResult(request.result);
      return pending.status === 'rolling' && result ? { status: 'rolled', result } : null;
    }
    case 'pending':
      return pending.status === 'rolling' ? { status: 'pending', claimedAt: null } : null;
    default:
      return null;
  }
}

/**
 * O que o cartão mostra: o botão (se o usuário pode rolar) ou uma nota de estado.
 * @param {ReturnType<typeof createPending>} pending
 * @param {{isOwner: boolean, now: number}} viewer
 * @returns {{showButton: boolean, noteKey: ('rolled'|'rolling'|'waiting'|null)}}
 */
export function tableView(pending, { isOwner, now }) {
  if (pending.status === 'rolled') return { showButton: false, noteKey: 'rolled' };
  if (!isClaimable(pending, now)) return { showButton: false, noteKey: 'rolling' };
  return isOwner ? { showButton: true, noteKey: null } : { showButton: false, noteKey: 'waiting' };
}
