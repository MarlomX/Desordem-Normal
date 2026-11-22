/**
 * Efeito de falha crítica ("desastre") de testes comuns. Lógica pura, sem dependência do Foundry.
 *
 * Quando todos os dados de um teste tiram 1 (ou o pavor devora todos), o jogador pode rolar um d8
 * numa tabela de efeitos. Os textos ficam no arquivo de idioma (DESORDEM.FalhaCritica.<key>).
 * Não vale para o teste de lesão (falha crítica mata) nem para o de trauma.
 */
import { newStepEffect } from './effects.js';

export const DISASTER_DIE = 8;

/**
 * Tabela de efeitos (d8).
 * - kind: 'narrative' (só texto) | 'none' | 'step' (um atributo perde um passo até o fim da cena)
 *   | 'hp' | 'pd' (perde pontos, rolando o dado indicado em `die`).
 */
export const DISASTERS = Object.freeze([
  { key: 'vexame', n: 1, kind: 'narrative' },
  { key: 'machucado', n: 2, kind: 'step', attr: 'fisico' },
  { key: 'desatencao', n: 3, kind: 'step', attr: 'mente' },
  { key: 'irritacao', n: 4, kind: 'step', attr: 'emocao' },
  { key: 'acidente', n: 5, kind: 'hp', die: 4 },
  { key: 'frustracao', n: 6, kind: 'pd', die: 4 },
  { key: 'perda', n: 7, kind: 'narrative' },
  { key: 'nenhum', n: 8, kind: 'none' },
]);

/** Entrada da tabela para o número do d8 (1 a 8). */
export function lookupDisaster(value) {
  const entry = DISASTERS.find((e) => e.n === value);
  if (!entry) throw new RangeError(`Valor fora da tabela de falha crítica: ${value}`);
  return entry;
}

/** Entrada da tabela pela chave (ou undefined). */
export const disasterByKey = (key) => DISASTERS.find((e) => e.key === key);

/** Faces do dado extra que o efeito rola (a quantidade de PV ou PD perdida), ou null. */
export const disasterExtraDie = (entry) => entry.die ?? null;

/**
 * Efeito da aba Condição (formato de `effects.js`) de um resultado que reduz um atributo: −1 passo
 * no dado do atributo até o fim da cena.
 * @param {{attr: string}} entry
 * @param {{name: string, description: string}} text Textos já traduzidos.
 * @param {string} [id] Id do efeito (no Foundry, `foundry.utils.randomID()`).
 */
export function disasterStepEffect(entry, { name, description }, id = '') {
  return newStepEffect({
    id,
    nome: name,
    descricao: description,
    atributo: entry.attr,
    passos: -1,
    duracao: 'cena',
    origem: 'falha',
  });
}

/**
 * Aplica o efeito ao estado do personagem, sem alterar o original. Perder PV ou PD não é dano:
 * não gasta armadura nem soma o dano extra de traumas. Se o PV ou o PD chegar a 0, devolve
 * `reachedZero` para o cartão avisar — o teste de lesão ou de trauma NÃO é feito aqui: o
 * jogador clica nele.
 * @param {{pv: number, pd: number, efeitos: object[]}} state
 * @param {(typeof DISASTERS)[number]} entry
 * @param {Object} [extra]
 * @param {number} [extra.amount=0] Pontos perdidos (rolagem do dado extra).
 * @param {object} [extra.effect] Efeito temporário a acrescentar (efeitos de atributo).
 * @returns {{pv: number, pd: number, efeitos: object[], reachedZero: ('pv'|'pd'|null)}}
 */
export function applyDisaster(state, entry, { amount = 0, effect } = {}) {
  const next = { ...state, efeitos: state.efeitos.map((e) => ({ ...e })), reachedZero: null };
  if (entry.kind === 'step' && effect) next.efeitos.push({ ...effect });
  if (entry.kind === 'hp') {
    next.pv = Math.max(0, state.pv - amount);
    if (amount > 0 && next.pv === 0) next.reachedZero = 'pv';
  }
  if (entry.kind === 'pd') {
    next.pd = Math.max(0, state.pd - amount);
    if (amount > 0 && next.pd === 0) next.reachedZero = 'pd';
  }
  return next;
}

/**
 * O que fazer com a tabela pendente de um cartão de teste que foi refeito (análise, repetir dado),
 * pois a falha crítica pode ter surgido ou desaparecido.
 * @param {{kind: string, status: string}|undefined} current Estado pendente atual do cartão.
 * @param {boolean} criticalFailure O teste refeito é falha crítica?
 * @returns {'create'|'remove'|'keep'}
 */
export function disasterSync(current, criticalFailure) {
  const mine = current?.kind === 'disaster' ? current : undefined;
  if (criticalFailure) return mine ? 'keep' : 'create';
  return mine?.status === 'pending' ? 'remove' : 'keep';
}
