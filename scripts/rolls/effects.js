/**
 * Efeitos temporários da ficha (por exemplo, o bônus de um preparado até o fim da cena).
 * Cada efeito tem nome, descrição e, opcionalmente, um atributo cujo dado sobe ou desce passos.
 * Lógica pura, sem dependência do Foundry.
 */
import { ATRIBUTOS } from '../config.js';

export const EFFECT_MAX_STEPS = 3;

/** @returns {{nome: string, descricao: string, atributo: string, passos: number}} */
export function newEffect() {
  return { nome: '', descricao: '', atributo: '', passos: 0 };
}

/** Acrescenta um efeito novo ao fim da lista (devolve uma lista nova). */
export function addEffect(effects) {
  return [...effects.map((e) => ({ ...e })), newEffect()];
}

/** Remove o efeito do índice indicado (devolve uma lista nova). */
export function removeEffect(effects, index) {
  return effects.filter((_, i) => i !== index).map((e) => ({ ...e }));
}

/**
 * Altera campos de um efeito. O atributo deve ser vazio ou um dos atributos do jogo, e os passos
 * ficam entre −3 e +3. Campos desconhecidos são ignorados.
 */
export function updateEffect(effects, index, changes) {
  return effects.map((effect, i) => {
    if (i !== index) return { ...effect };
    const next = { ...effect };
    if ('nome' in changes) next.nome = String(changes.nome ?? '');
    if ('descricao' in changes) next.descricao = String(changes.descricao ?? '');
    if ('atributo' in changes) {
      const key = String(changes.atributo ?? '');
      next.atributo = ATRIBUTOS.includes(key) ? key : '';
    }
    if ('passos' in changes) {
      const steps = Math.trunc(Number(changes.passos));
      next.passos = Number.isFinite(steps)
        ? Math.min(EFFECT_MAX_STEPS, Math.max(-EFFECT_MAX_STEPS, steps))
        : effect.passos;
    }
    return next;
  });
}

/** Aumentos e reduções de passo que os efeitos dão ao dado do atributo em um teste. */
export function effectStepMods(effects, attrKey) {
  return effects
    .filter((effect) => effect.atributo === attrKey && effect.passos !== 0)
    .map((effect) => ({ target: 'attribute', steps: effect.passos }));
}
