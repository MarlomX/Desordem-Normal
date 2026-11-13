/**
 * Áreas extras de Aptidão e de Ofício: lista de áreas criadas pelo jogador, além das do livro.
 * Lógica pura, sem dependência do Foundry. Cada área tem `id` (fixo), `nome` (livre), `dado` e `atributo` ('' = padrão, Mente).
 * As funções devolvem listas novas e nunca alteram a lista recebida.
 */
import { ATRIBUTOS } from '../config.js';
import { DIE_STEPS } from './dice.js';

export const MAX_EXTRAS = 12; // limite de áreas extras por grupo
export const MAX_EXTRA_NAME = 40; // tamanho máximo do nome digitado

/** Grupos que aceitam áreas extras: nome do grupo -> campo da ficha (`system.<campo>`). */
export const EXTRA_GROUPS = Object.freeze({
  aptidao: 'aptidoesExtras',
  oficio: 'oficiosExtras',
});

/** Chave de teste de uma área extra, por exemplo `oficio:k3j9x` (não colide com as do livro). */
export function extraKey(group, id) {
  return `${group}:${id}`;
}

/** Separa uma chave de teste em grupo e id; devolve null se não for de uma área extra. */
export function parseExtraKey(key) {
  if (typeof key !== 'string') return null;
  const at = key.indexOf(':');
  if (at <= 0) return null;
  const group = key.slice(0, at);
  const id = key.slice(at + 1);
  if (!Object.hasOwn(EXTRA_GROUPS, group) || !id) return null;
  return { group, id };
}

/**
 * Procura a área extra de uma chave de teste nos dados do ator.
 * @param {object} system `actor.system`.
 * @returns {{group: string, extra: {id: string, nome: string, dado: number}}|null}
 */
export function findExtra(system, key) {
  const parsed = parseExtraKey(key);
  if (!parsed) return null;
  const list = system?.[EXTRA_GROUPS[parsed.group]] ?? [];
  const extra = list.find((item) => item.id === parsed.id);
  return extra ? { group: parsed.group, extra } : null;
}

/** Diz se ainda cabe uma área extra na lista. */
export function canAddExtra(list) {
  return list.length < MAX_EXTRAS;
}

/**
 * Acrescenta uma área extra (dado d4, destreinado) ao fim da lista.
 * @param {object[]} list
 * @param {{id: string, nome?: string}} input O id deve ser novo e não vazio.
 */
export function addExtra(list, { id, nome = '' }) {
  if (!id || typeof id !== 'string') throw new RangeError('Área extra sem id');
  if (list.some((item) => item.id === id)) throw new RangeError(`Id repetido: ${id}`);
  if (!canAddExtra(list)) throw new RangeError(`Limite de ${MAX_EXTRAS} áreas extras atingido`);
  return [
    ...list.map((item) => ({ ...item })),
    { id, nome: cleanName(nome), dado: 4, atributo: '' },
  ];
}

/** Remove a área extra com o id indicado (id inexistente não altera nada). */
export function removeExtra(list, id) {
  return list.filter((item) => item.id !== id).map((item) => ({ ...item }));
}

/**
 * Altera o nome, o dado e/ou o atributo de uma área extra. Campos desconhecidos são ignorados;
 * um dado fora de d4 a d12 e um atributo que não seja '', fisico, mente ou emocao não são aplicados.
 */
export function updateExtra(list, id, changes) {
  return list.map((item) => {
    if (item.id !== id) return { ...item };
    const next = { ...item };
    if ('nome' in changes) next.nome = cleanName(changes.nome);
    if ('dado' in changes) {
      const die = Number(changes.dado);
      if (DIE_STEPS.includes(die)) next.dado = die;
    }
    if (
      'atributo' in changes &&
      (changes.atributo === '' || ATRIBUTOS.includes(changes.atributo))
    ) {
      next.atributo = changes.atributo;
    }
    return next;
  });
}

/** Nome sem espaços nas pontas e com no máximo MAX_EXTRA_NAME caracteres. */
function cleanName(name) {
  return String(name ?? '')
    .trim()
    .slice(0, MAX_EXTRA_NAME);
}
