/**
 * Dado de pavor em SVG (neon): gera o desenho de um dado de pavor com o número que você quiser.
 * Lógica pura, sem dependência do Foundry; serve tanto aos templates (helper `dadoPavor`) quanto
 * ao código que monta a janela de teste.
 */
import { d4 } from '../data/dados-pavor/d4.js';
import { d6 } from '../data/dados-pavor/d6.js';
import { d8 } from '../data/dados-pavor/d8.js';
import { d10 } from '../data/dados-pavor/d10.js';
import { d12 } from '../data/dados-pavor/d12.js';
import { d20 } from '../data/dados-pavor/d20.js';

/** Geometria de cada dado, pelo número de lados. */
const GEOMETRIES = new Map(
  [d4, d6, d8, d10, d12, d20].map((geometry) => [geometry.lados, geometry]),
);

/** Tamanhos do desenho: 'grande' (dados grandes) e 'pequeno' (etiquetas e linhas compactas). */
export const FEAR_DIE_SIZES = Object.freeze(['grande', 'pequeno']);

/**
 * Corpo da fonte do número, em unidades do SVG (o SVG escala junto com o dado). No pequeno é um
 * único tamanho para um e dois dígitos.
 */
export const FEAR_NUMBER_FONT_SIZE = Object.freeze({ grande: 24, pequeno: 13 });

/** Dados que têm desenho de pavor. */
export function fearDieSides() {
  return [...GEOMETRIES.keys()];
}

/**
 * Só dígitos (no máximo 3). O texto vai direto para o HTML do SVG, então nada além de dígitos
 * pode passar. Vazio ou inválido devolve '' (quem chama usa o número de lados no lugar).
 */
export function sanitizeFearValue(value) {
  return String(value ?? '')
    .replace(/\D/g, '')
    .slice(0, 3);
}

/**
 * Monta o `<svg>` de um dado de pavor.
 * @param {Object} config
 * @param {number} config.sides Lados do dado (4, 6, 8, 10, 12 ou 20).
 * @param {number|string} [config.value] Número mostrado no dado; por padrão, o número de lados.
 * @param {'grande'|'pequeno'} [config.size='grande'] Qual versão do desenho usar.
 * @returns {string} O `<svg>`, ou '' se não existe dado de pavor com esse número de lados.
 */
export function buildFearDie({ sides, value, size = 'grande' } = {}) {
  const geometry = GEOMETRIES.get(Number(sides));
  if (!geometry) return '';
  const version = FEAR_DIE_SIZES.includes(size) ? size : 'grande';
  const part = geometry[version];
  const text = sanitizeFearValue(value) || String(geometry.lados);
  const fontSize = FEAR_NUMBER_FONT_SIZE[version];
  const { x, y } = part.numero;
  // As 9 camadas do número (halo escuro, 7 de brilho e preenchimento) são o mesmo texto com
  // estilos diferentes. Todas recebem o mesmo número, para o brilho nunca mostrar um valor antigo.
  const layers = part.camadas
    .map(
      (style) =>
        `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" style="${style};font-size:${fontSize}px">${text}</text>`,
    )
    .join('');
  return (
    `<svg class="desordem-dado-pavor desordem-dado-pavor--${version}" xmlns="http://www.w3.org/2000/svg" ` +
    `viewBox="${part.viewBox}" role="img" aria-label="d${geometry.lados}" focusable="false">` +
    `${part.corpo}${layers}</svg>`
  );
}

/**
 * Função do helper Handlebars `dadoPavor`. O Handlebars passa um objeto de opções como último
 * argumento; por isso valores que não são texto nem número são ignorados.
 * Uso nos templates: `{{dadoPavor system.estado.pavor}}` (o número é o de lados) ou
 * `{{dadoPavor 8 5 "pequeno"}}` (d8 mostrando o 5, na versão pequena).
 * @param {number} sides
 * @param {number|string|object} [value]
 * @param {string|object} [size]
 * @returns {string} HTML do SVG (quem registra o helper o marca como seguro).
 */
export function fearDieHelper(sides, value, size) {
  const cleanValue = typeof value === 'number' || typeof value === 'string' ? value : undefined;
  const cleanSize = typeof size === 'string' ? size : undefined;
  return buildFearDie({ sides, value: cleanValue, size: cleanSize });
}
