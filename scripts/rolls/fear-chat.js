/**
 * Dado de pavor nos cartões do chat. O Foundry limpa o HTML das mensagens e remove as tags do SVG
 * (mantendo só o texto de dentro, que apareceria como o número repetido várias vezes). Por isso o
 * template deixa só um espaço reservado com o número, e o desenho é montado aqui, no hook de
 * renderização do chat, que roda depois da limpeza.
 */
import { buildFearDie } from '../sheets/dado-pavor.js';

/** Atributo que marca o espaço reservado do dado de pavor no cartão. */
export const FEAR_SLOT_ATTR = 'data-dado-pavor';

/**
 * SVG do dado de pavor para um espaço reservado.
 * @param {string|number|undefined} sides Lados do dado (4 a 20), vindos do atributo `data-lados`.
 * @param {string|number|undefined} value Número rolado, vindo do atributo `data-valor`.
 * @returns {string} O `<svg>`, ou '' se não existe dado de pavor com esses lados (o número de
 *   reserva do template fica à mostra).
 */
export function fearSlotMarkup(sides, value) {
  return buildFearDie({ sides: Number(sides), value, size: 'grande' });
}

/** Hook renderChatMessageHTML: troca cada espaço reservado pelo desenho do dado de pavor. */
export function renderFearDice(message, html) {
  for (const slot of html.querySelectorAll(`[${FEAR_SLOT_ATTR}]`)) {
    const svg = fearSlotMarkup(slot.dataset.lados, slot.dataset.valor);
    if (svg) slot.innerHTML = svg;
  }
}
