/**
 * Dano emocional, teste de trauma e tabela de traumas. Lógica pura, sem dependência do Foundry.
 */
import { increaseFear } from './fear.js';

export const TRAUMA_BASE_DT = 7;
export const TRAUMA_DT_STEP = 3;
export const TRAUMA_DIE = 20;

/** DT do teste de trauma: 7, +3 por teste de trauma já feito na cena. */
export function traumaDT(previousTests) {
  if (!Number.isInteger(previousTests) || previousTests < 0) {
    throw new RangeError(`Quantidade de testes inválida: ${previousTests}`);
  }
  return TRAUMA_BASE_DT + TRAUMA_DT_STEP * previousTests;
}

/** @returns {'success'|'failure'} Sucessos e falhas críticas valem como sucesso e falha comuns. */
export function traumaOutcome(result) {
  return result.success ? 'success' : 'failure';
}

/**
 * Tabela de traumas (d20). Os textos ficam no arquivo de idioma (DESORDEM.Traumas.<key>).
 * - kind: 'collapse' | 'permanent' | 'fear' | 'stupor' | 'morale'
 * - extraDamage: com este trauma, cada dano emocional aumenta nesse valor
 * - attrMods / mods: modificador fixo por atributo-base / por perícia (somado ao total do teste)
 * - pdMaxLoss: perda permanente de PD máximo (acumula, como a laceração profunda)
 */
export const TRAUMAS = Object.freeze([
  { key: 'colapsoTotal', min: 1, max: 4, kind: 'collapse' },
  { key: 'estressePosTraumatico', min: 5, max: 6, kind: 'permanent', extraDamage: 1 },
  { key: 'degradacaoCognitiva', min: 7, max: 8, kind: 'permanent', attrMods: { mente: -1 } },
  { key: 'maculaPsiquica', min: 9, max: 10, kind: 'permanent', attrMods: { emocao: -1 } },
  { key: 'chagaAlma', min: 11, max: 12, kind: 'permanent', pdMaxLoss: 2, stacks: true },
  {
    key: 'retracaoDefensiva',
    min: 13,
    max: 14,
    kind: 'permanent',
    mods: { persuasao: -2, intuicao: -2 },
  },
  { key: 'panico', min: 15, max: 17, kind: 'fear' },
  { key: 'estupor', min: 18, max: 19, kind: 'stupor' },
  { key: 'injecaoAnimo', min: 20, max: Infinity, kind: 'morale' },
]);

/** Entrada da tabela para um valor de d20 (abaixo de 1 conta como 1). */
export function lookupTrauma(value) {
  const v = Math.max(1, value);
  return TRAUMAS.find((entry) => v >= entry.min && v <= entry.max);
}

/** Entrada sorteada e se é preciso rolar de novo (trauma persistente que já tem, exceto os que acumulam). */
export function pickTrauma(value, owned = []) {
  const entry = lookupTrauma(value);
  const reroll = entry.kind === 'permanent' && !entry.stacks && owned.includes(entry.key);
  return { entry, reroll };
}

const entryOf = (key) => TRAUMAS.find((e) => e.key === key);

/**
 * Modificador fixo que os traumas dão a um teste, pelo atributo-base e pela perícia usados.
 * @param {string[]} owned
 * @param {{attrKey?: string, skillKey?: string}} test
 */
export function traumaModifier(owned = [], { attrKey, skillKey } = {}) {
  return owned.reduce((sum, key) => {
    const entry = entryOf(key);
    return sum + (entry?.attrMods?.[attrKey] ?? 0) + (entry?.mods?.[skillKey] ?? 0);
  }, 0);
}

/** Dano extra por dano emocional sofrido (estresse pós-traumático). */
export function extraEmotionalDamage(owned = []) {
  return owned.reduce((sum, key) => sum + (entryOf(key)?.extraDamage ?? 0), 0);
}

/**
 * Aplica dano emocional (PD), já somando o dano extra dos traumas.
 * Exige teste de trauma quando o PD chega a 0 ou quando o personagem já estava em 0.
 * Gastar PD (custos de habilidades, pavor...) não é dano e não passa por aqui.
 * @param {{current: number, amount: number, owned?: string[]}} opts
 * @returns {{before: number, after: number, amount: number, needsTraumaTest: boolean}}
 */
export function applyEmotionalDamage({ current, amount, owned = [] }) {
  if (!Number.isInteger(amount) || amount < 0) throw new RangeError(`Dano inválido: ${amount}`);
  if (!Number.isInteger(current) || current < 0) throw new RangeError(`PD inválido: ${current}`);
  const total = amount > 0 ? amount + extraEmotionalDamage(owned) : 0;
  const after = Math.max(0, current - total);
  return { before: current, after, amount: total, needsTraumaTest: total > 0 && after === 0 };
}

/**
 * Estado mental usado em `applyTrauma`.
 * @typedef {Object} MindState
 * @property {number} pd
 * @property {number} pdMax
 * @property {number} pavor Dado de pavor (0 = sem pavor).
 * @property {boolean} estupor
 * @property {boolean} colapso
 * @property {string[]} traumas
 */

/** Aplica um trauma sorteado, sem alterar o estado original. */
export function applyTrauma(state, entry) {
  const next = { ...state, traumas: [...state.traumas] };
  if (entry.kind === 'collapse') return { ...next, colapso: true };
  if (entry.kind === 'fear') return { ...next, pavor: increaseFear(next.pavor) };
  if (entry.kind === 'stupor') return { ...next, estupor: true };
  if (entry.kind === 'morale') return { ...next, pd: Math.min(next.pdMax, next.pd + 1) };

  next.traumas.push(entry.key);
  if (entry.pdMaxLoss) {
    next.pdMax = Math.max(0, next.pdMax - entry.pdMaxLoss);
    next.pd = Math.min(next.pd, next.pdMax);
  }
  return next;
}
