/**
 * Passos temporários da ficha: aumentos e reduções de passo ajustados à mão (por exemplo, quando
 * um aliado ajuda), sem criar um efeito. Há um valor por atributo e um valor geral para o dado das
 * perícias. Lógica pura, sem dependência do Foundry.
 *
 * Regra: o passo manual nunca transborda. Se o dado já está em d12 (ou d4), o excedente se perde
 * (a escada de `stepShift` limita o dado). Quem soma tudo é `collectStepMods`, junto com os efeitos.
 */
import { ATRIBUTOS } from '../config.js';
import { effectStepMods } from './effects.js';
import { stepShift } from './dice.js';

export const STEP_LIMIT = 4;

/** Chaves que podem receber passos: os três atributos e o dado das perícias. */
export const STEP_KEYS = Object.freeze([...ATRIBUTOS, 'pericias']);

/** @returns {{fisico: number, mente: number, emocao: number, pericias: number}} */
export function newSteps() {
  return Object.fromEntries(STEP_KEYS.map((key) => [key, 0]));
}

/** Limita um valor de passos a −4..+4; valores inválidos viram 0. */
export function clampSteps(value) {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return 0;
  return Math.min(STEP_LIMIT, Math.max(-STEP_LIMIT, n));
}

/**
 * Soma `delta` aos passos de uma chave (devolve um objeto novo). Chaves desconhecidas são ignoradas.
 * @param {object} steps
 * @param {string} key
 * @param {number} delta
 */
export function stepBy(steps, key, delta) {
  const base = { ...newSteps(), ...steps };
  if (!STEP_KEYS.includes(key)) return base;
  return { ...base, [key]: clampSteps(base[key] + Math.trunc(Number(delta) || 0)) };
}

/** Define os passos de uma chave (devolve um objeto novo). */
export function setSteps(steps, key, value) {
  const base = { ...newSteps(), ...steps };
  if (!STEP_KEYS.includes(key)) return base;
  return { ...base, [key]: clampSteps(value) };
}

/** Zera todos os passos temporários (fim de cena). */
export function resetSteps() {
  return newSteps();
}

/** Há algum passo ativo? */
export function hasSteps(steps) {
  return STEP_KEYS.some((key) => clampSteps(steps?.[key]) !== 0);
}

/** Passos manuais de um teste: o dado do atributo usado e o dado da perícia. */
export function manualStepMods(steps, attrKey) {
  const mods = [];
  const attr = clampSteps(steps?.[attrKey]);
  const skill = clampSteps(steps?.pericias);
  if (ATRIBUTOS.includes(attrKey) && attr !== 0) mods.push({ target: 'attribute', steps: attr });
  if (skill !== 0) mods.push({ target: 'skill', steps: skill });
  return mods;
}

/**
 * Única função que reúne os passos de um teste: manuais + efeitos da ficha.
 * (A contusão e as ajudas continuam entrando pelas suas próprias funções.)
 */
export function collectStepMods({ steps, effects = [], attrKey }) {
  return [...manualStepMods(steps, attrKey), ...effectStepMods(effects, attrKey)];
}

/**
 * Saldo líquido para mostrar na ficha (seta e número), somando manual e efeitos.
 * Para `pericias` só há o manual.
 * @returns {{net: number, manual: number, effects: number, direction: 'up'|'down'|'none'}}
 */
export function stepIndicator({ steps, effects = [], key }) {
  const manual = clampSteps(steps?.[key]);
  const fromEffects = ATRIBUTOS.includes(key)
    ? effects.filter((e) => e.atributo === key).reduce((sum, e) => sum + (e.passos || 0), 0)
    : 0;
  const net = manual + fromEffects;
  return {
    net,
    manual,
    effects: fromEffects,
    direction: net > 0 ? 'up' : net < 0 ? 'down' : 'none',
  };
}

/**
 * Dado que a ficha mostra para um dado base, já com os passos (manuais e de efeitos).
 * A escada de passos para em d4 e d12, sem transbordar.
 * @param {number} base Lados do dado base (4 a 12).
 * @param {{net: number, direction: string}} [indicator] Resultado de `stepIndicator`.
 */
export function shownDie(base, indicator) {
  const die = Number(base);
  if (!indicator || indicator.net === 0 || ![4, 6, 8, 10, 12].includes(die)) return die;
  return stepShift(die, indicator.net);
}
