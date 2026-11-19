/**
 * Ameaças: criaturas e, no futuro, outros tipos de adversário controlados pelo mestre.
 * Lógica pura, sem dependência do Foundry.
 *
 * Uma ameaça não tem PD, pavor, relações, lesões nem traumas: tem PV, redução de dano (RD) e
 * elementos. As funções daqui deixam o caminho comum dos testes funcionar com qualquer ator.
 */
import { ELEMENTOS } from '../config.js';

/** Tipos de ator que são ameaças (a primeira é a criatura). */
export const THREAT_TYPES = Object.freeze(['criatura']);

/** Limite de perícias próprias de uma criatura (no lugar das áreas de Aptidão e de Ofício). */
export const MAX_THREAT_SKILLS = 10;

/** Maior redução de dano aceita na ficha. */
export const MAX_RD = 99;

/**
 * O ator (ou o tipo de ator informado como texto) é uma ameaça?
 * @param {{type: string}|string|null|undefined} actorOrType
 */
export function isThreat(actorOrType) {
  const type = typeof actorOrType === 'string' ? actorOrType : actorOrType?.type;
  return THREAT_TYPES.includes(type);
}

/** Número inteiro não negativo, ou 0 se o valor não existir (campo ausente na ficha). */
const count = (value) => (Number.isInteger(value) && value > 0 ? value : 0);

/**
 * Recursos que o caminho dos testes lê da ficha. Numa ameaça os campos não existem: PD, ímpeto,
 * análise e pavor valem 0 (nada a gastar, nenhum dado de pavor).
 * @param {object} system `actor.system`.
 * @returns {{pd: number, impeto: number, analise: number, fearDie: number}}
 */
export function testResources(system) {
  return {
    pd: count(system?.pd?.value),
    impeto: count(system?.recursos?.impeto),
    analise: count(system?.recursos?.analise),
    fearDie: count(system?.estado?.pavor),
  };
}

/**
 * Dano físico numa ameaça: a RD é descontada antes de diminuir o PV (nunca fica negativo).
 * Não há teste de lesão: a ameaça com 0 PV está derrotada.
 * @param {{current: number, amount: number, rd?: number}} opts
 * @returns {{before: number, after: number, amount: number, rawAmount: number, reduced: number,
 *   defeated: boolean, newlyDefeated: boolean}} `amount` é o dano depois da RD; `reduced`, quanto
 *   a RD absorveu; `newlyDefeated`, se este dano levou o PV a 0.
 */
export function threatDamage({ current, amount, rd = 0 }) {
  if (!Number.isInteger(amount) || amount < 0) throw new RangeError(`Dano inválido: ${amount}`);
  if (!Number.isInteger(current) || current < 0) throw new RangeError(`PV inválido: ${current}`);
  const reduced = Math.min(amount, count(rd));
  const final = amount - reduced;
  const after = Math.max(0, current - final);
  return {
    before: current,
    after,
    amount: final,
    rawAmount: amount,
    reduced,
    defeated: after === 0,
    newlyDefeated: current > 0 && after === 0,
  };
}

/**
 * Elementos válidos: o principal (um dos cinco, ou '' se ainda não escolhido) e os secundários
 * (sem repetir, sem o principal, na ordem da lista de elementos).
 * @param {{principal?: string, secundarios?: string[]}} [elementos]
 * @returns {{principal: string, secundarios: string[]}}
 */
export function normalizeElements({ principal = '', secundarios = [] } = {}) {
  const main = ELEMENTOS.includes(principal) ? principal : '';
  const list = Array.isArray(secundarios) ? secundarios : [];
  return {
    principal: main,
    secundarios: ELEMENTOS.filter((key) => key !== main && list.includes(key)),
  };
}

/**
 * Escolhe o elemento principal. Se ele era secundário, deixa de ser (não pode ser os dois).
 * Um valor fora da lista volta a '' (sem principal).
 */
export function setPrimaryElement(elementos, key) {
  return normalizeElements({ ...elementos, principal: key });
}

/**
 * Liga ou desliga um elemento secundário. O principal não pode ser marcado como secundário, e um
 * valor fora da lista não muda nada.
 */
export function toggleSecondaryElement(elementos, key) {
  const current = normalizeElements(elementos);
  if (!ELEMENTOS.includes(key) || key === current.principal) return current;
  const on = current.secundarios.includes(key);
  const secundarios = on
    ? current.secundarios.filter((other) => other !== key)
    : [...current.secundarios, key];
  return normalizeElements({ principal: current.principal, secundarios });
}

/**
 * Linhas dos elementos para a ficha (um seletor do principal e caixas dos secundários).
 * @param {{principal?: string, secundarios?: string[]}} elementos
 * @param {(key: string) => string} label Nome traduzido do elemento.
 * @returns {{key: string, label: string, principal: boolean, secundario: boolean}[]}
 */
export function buildElementRows(elementos, label) {
  const { principal, secundarios } = normalizeElements(elementos);
  return ELEMENTOS.map((key) => ({
    key,
    label: label(key),
    principal: key === principal,
    secundario: secundarios.includes(key),
  }));
}

/**
 * Elementos secundários para a ficha: as etiquetas dos que a criatura já tem e as opções do botão
 * «+» (os que ainda podem ser acrescentados: nem o principal, nem os que já estão lá).
 * @param {{principal?: string, secundarios?: string[]}} elementos
 * @param {(key: string) => string} label Nome traduzido do elemento.
 * @returns {{tags: {key: string, label: string}[], options: {key: string, label: string}[]}}
 */
export function secondaryElementChoices(elementos, label) {
  const { principal, secundarios } = normalizeElements(elementos);
  const entry = (key) => ({ key, label: label(key) });
  return {
    tags: secundarios.map(entry),
    options: ELEMENTOS.filter((key) => key !== principal && !secundarios.includes(key)).map(entry),
  };
}
