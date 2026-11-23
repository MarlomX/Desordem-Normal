/**
 * Aparência do dado de pavor escolhida por cada jogador (v0.25.5): validação, mescla com o padrão
 * do sistema e os dados da prévia, em funções puras (tests/fear-style.test.js). A janela fica em
 * `appearance-app.js`; a configuração e a aplicação na rolagem, em `dice3d.js`.
 */
import { DEFAULT_FEAR_STYLE, FEAR_FONT } from './fear-dice.js';

/** Campos de cor: fundo do dado, número, contorno do número e arestas. */
export const STYLE_COLOR_FIELDS = Object.freeze(['background', 'foreground', 'outline', 'edge']);

/** Todos os campos que o jogador pode escolher. */
export const STYLE_FIELDS = Object.freeze([...STYLE_COLOR_FIELDS, 'texture', 'material', 'font']);

/**
 * Materiais do Dice So Nice 5 (os mesmos valores da janela dele). `auto` deixa o material da
 * textura escolhida.
 */
export const FEAR_MATERIALS = Object.freeze([
  'auto',
  'plastic',
  'metal',
  'glass',
  'wood',
  'chrome',
  'pristine',
  'iridescent',
  'stone',
]);

/** Dados que a prévia pode mostrar (o dado de pavor vai de d4 a d20). */
export const PREVIEW_SIDES = Object.freeze([4, 6, 8, 10, 12, 20]);

/** Dado da prévia quando nada foi escolhido. */
export const PREVIEW_DEFAULT_SIDES = 20;

/**
 * Cor no formato `#rrggbb` (minúsculas), o único que `<input type="color">` aceita. `#rgb` vira
 * `#rrggbb`; qualquer outra coisa devolve null.
 * @param {unknown} value
 * @returns {string|null}
 */
export function normalizeHexColor(value) {
  const text = String(value ?? '')
    .trim()
    .toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(text)) return text;
  if (/^#[0-9a-f]{3}$/.test(text)) {
    return `#${[...text.slice(1)].map((digit) => digit + digit).join('')}`;
  }
  return null;
}

/**
 * Só os campos válidos de uma escolha (o que veio do formulário ou da configuração guardada).
 * Cores precisam ser `#rrggbb`; textura e fonte precisam estar nas listas, quando elas são dadas
 * (sem lista, vale qualquer texto curto, para não perder a escolha se um módulo de texturas ainda
 * não carregou); material precisa ser um de `FEAR_MATERIALS`. Campos ruins somem (vale o padrão).
 * @param {object} raw
 * @param {{textures?: string[], fonts?: string[]}} [lists]
 * @returns {object}
 */
export function sanitizeFearStyle(raw, { textures, fonts } = {}) {
  const style = {};
  if (!raw || typeof raw !== 'object') return style;
  for (const field of STYLE_COLOR_FIELDS) {
    const color = normalizeHexColor(raw[field]);
    if (color) style[field] = color;
  }
  const pickText = (value, list) => {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text || text.length > 80) return null;
    return !list || list.includes(text) ? text : null;
  };
  const texture = pickText(raw.texture, textures);
  if (texture) style.texture = texture;
  if (FEAR_MATERIALS.includes(raw.material)) style.material = raw.material;
  const font = pickText(raw.font, fonts);
  if (font) style.font = font;
  return style;
}

/**
 * O que vale na rolagem: o padrão do sistema com a escolha válida do jogador por cima.
 * @param {object} saved Configuração guardada do usuário.
 * @param {{textures?: string[], fonts?: string[]}} [lists]
 * @returns {object}
 */
export function effectiveFearStyle(saved, lists) {
  return { ...DEFAULT_FEAR_STYLE, ...sanitizeFearStyle(saved, lists) };
}

/**
 * O que guardar: só os campos diferentes do padrão. Assim, se o padrão do sistema mudar numa
 * versão futura, quem não mexeu num campo recebe o novo padrão nele.
 * @param {object} style Escolha completa (já validada).
 * @returns {object}
 */
export function styleOverrides(style) {
  return Object.fromEntries(
    STYLE_FIELDS.filter(
      (field) => style[field] !== undefined && style[field] !== DEFAULT_FEAR_STYLE[field],
    ).map((field) => [field, style[field]]),
  );
}

/**
 * Lista de opções para um `<select>`, com a escolhida marcada. Se a escolhida não estiver na lista
 * (um módulo de texturas desligado, por exemplo), ela entra no começo para não se perder.
 * @param {{key: string, label: string}[]} options
 * @param {string} selected
 * @returns {{key: string, label: string, selected: boolean}[]}
 */
export function selectOptions(options, selected) {
  const list = options.some((option) => option.key === selected)
    ? options
    : [{ key: selected, label: selected }, ...options];
  return list.map((option) => ({ ...option, selected: option.key === selected }));
}

/** Fontes da lista: a dos números do sistema primeiro, depois as do Foundry, sem repetir. */
export function fontOptions(foundryFonts) {
  const names = [FEAR_FONT, ...foundryFonts.filter((name) => name !== FEAR_FONT)];
  return names.map((name) => ({ key: name, label: name }));
}

/**
 * Silhueta 2D da prévia (pontos de um `<polygon>` numa caixa 100 × 100), parecida com o dado:
 * d4 triângulo, d6 quadrado, d8 losango, d10 pipa, d12 pentágono, d20 hexágono.
 * @param {number} sides
 * @returns {string}
 */
export function previewShape(sides) {
  const shapes = {
    4: '50,6 95,90 5,90',
    6: '10,10 90,10 90,90 10,90',
    8: '50,4 94,50 50,96 6,50',
    10: '50,4 94,42 50,96 6,42',
    12: '50,4 95,37 78,93 22,93 5,37',
    20: '50,4 93,28 93,72 50,96 7,72 7,28',
  };
  return shapes[sides] ?? shapes[PREVIEW_DEFAULT_SIDES];
}

/** Lados da prévia válidos (um de `PREVIEW_SIDES`), senão o padrão. */
export function previewSides(value) {
  const sides = Number(value);
  return PREVIEW_SIDES.includes(sides) ? sides : PREVIEW_DEFAULT_SIDES;
}
