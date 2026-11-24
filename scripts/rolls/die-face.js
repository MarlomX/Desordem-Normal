/**
 * Face de um dado para os cartões do chat: o mesmo desenho dos dados da ficha (classes
 * `desordem-forma` e `desordem-d-N`), com o número rolado dentro. Lógica pura, sem dependência
 * do Foundry; serve ao helper de template `dadoFace`.
 *
 * Este é o ÚNICO ponto que sabe como o dado é desenhado nos cartões: quando os dados normais
 * passarem a ser SVG inline (como o dado de pavor), basta trocar o HTML devolvido aqui.
 */

/** Dados que têm desenho (por número de lados). Qualquer outro usa o desenho neutro (d0). */
export const DIE_FACE_SIDES = Object.freeze([4, 6, 8, 10, 12, 20]);

// Tamanhos: 'padrao' (o da linha de texto), 'grande' (dados do cartão) e 'mini' (setas de passo).

/** Brilho de passo: 'up' (azul, o dado subiu) ou 'down' (vermelho, o dado desceu). */
export const DIE_FACE_STEPS = Object.freeze(['up', 'down']);

/**
 * Só dígitos (no máximo 3). O texto vai direto para o HTML, então nada além de dígitos pode
 * passar. Vazio ou inválido devolve '' (quem chama usa o número de lados no lugar).
 */
export function sanitizeDieValue(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return '';
  return String(value).replace(/\D/g, '').slice(0, 3);
}

/**
 * Monta o HTML da face de um dado.
 * @param {Object} config
 * @param {number} config.sides Lados do dado (4, 6, 8, 10, 12 ou 20).
 * @param {number|string} [config.value] Número mostrado; por padrão, o número de lados.
 * @param {'padrao'|'grande'|'mini'} [config.size='padrao']
 * @param {'up'|'down'|null} [config.step=null] Brilho de passo (o dado foi aumentado/reduzido).
 * @returns {string}
 */
export function buildDieFace({ sides, value, size = 'padrao', step = null } = {}) {
  const shape = DIE_FACE_SIDES.includes(Number(sides)) ? Number(sides) : 0;
  const text = sanitizeDieValue(value) || (shape ? String(shape) : '');
  const classes = ['desordem-forma', `desordem-d-${shape}`];
  if (size === 'grande' || size === 'mini') classes.push(`desordem-forma--${size}`);
  if (DIE_FACE_STEPS.includes(step)) classes.push('is-passo', `is-passo--${step}`);
  // Leitores de tela: "d6 = 4". Na miniatura só importa o tipo do dado.
  const label = shape ? `d${shape}${size === 'mini' ? '' : ` = ${text}`}` : text;
  return `<span class="${classes.join(' ')}" role="img" aria-label="${label}"><span class="desordem-forma__valor">${text}</span></span>`;
}

/**
 * Versão para o helper do Handlebars: o último argumento que ele passa é um objeto de opções, então
 * só aceita texto e número nos parâmetros.
 */
export function dieFaceHelper(sides, value, size, step) {
  return buildDieFace({
    sides,
    value: typeof value === 'number' || typeof value === 'string' ? value : undefined,
    size: typeof size === 'string' ? size : undefined,
    step: typeof step === 'string' ? step : null,
  });
}
