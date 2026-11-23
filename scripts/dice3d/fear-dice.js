/**
 * Dado de pavor no Dice So Nice (v0.25.2): o estilo padrão, a «aura de pavor» e onde aplicá-los,
 * em funções puras, sem Foundry nem Dice So Nice (testadas em tests/fear-dice.test.js). A ligação
 * com o módulo fica em `dice3d.js`.
 *
 * Como o Dice So Nice lê isso: cada dado (termo `Die` de um `Roll`) tem `options`. Ele usa
 * `options.appearance` (cores, material, fonte...) por cima da aparência de quem rolou e toca o
 * efeito especial de `options.sfx` naquele dado, qualquer que seja o resultado. Essas opções vão
 * gravadas com a rolagem na mensagem, então todos veem o mesmo dado de pavor.
 */
import { MAX_ROLLED } from '../rolls/test.js';

/** Id do módulo Dice So Nice. */
export const DSN_MODULE_ID = 'dice-so-nice';

/** Nome do conjunto de cores (colorset) do dado de pavor registrado no Dice So Nice. */
export const FEAR_COLORSET = 'desordem-pavor';

/** Configuração do usuário com a aparência escolhida do dado de pavor (v0.25.5). */
export const FEAR_STYLE_SETTING = 'aparenciaPavor';

/** Id do efeito especial «Aura de pavor» registrado no Dice So Nice. */
export const FEAR_AURA_SFX = 'DesordemAuraPavor';

/**
 * Fonte dos números do dado de pavor: a mesma dos números da ficha e do chat
 * (`@font-face` em styles/main.css, só dígitos).
 */
export const FEAR_FONT = 'Desordem Numeros';

/**
 * Estilo padrão do dado de pavor, com as cores do dado de pavor da ficha (styles/main.css):
 * fundo quase preto, número claro e borda azul pálida. `outline` é o contorno do número e `edge`,
 * a cor das arestas. A textura `none` e o material `glass` existem no Dice So Nice 5.
 */
export const DEFAULT_FEAR_STYLE = Object.freeze({
  foreground: '#d5d8dc',
  background: '#0c0d0f',
  outline: '#0c0d0f',
  edge: '#9fd6ee',
  texture: 'none',
  material: 'glass',
  font: FEAR_FONT,
});

/**
 * Como a aura desenha o contorno do dado (o «outline pass» do Dice So Nice, feito com three.js):
 * cor branca levemente azulada nas bordas visíveis, a mesma mais apagada nas escondidas, brilho,
 * espessura, força e pulso (segundos por ciclo).
 */
export const FEAR_AURA_OUTLINE = Object.freeze({
  visibleEdgeColor: '#dcefff',
  hiddenEdgeColor: '#5d7a8c',
  edgeGlow: 1,
  edgeThickness: 2,
  edgeStrength: 4,
  pulsePeriod: 2,
});

/** Campos do contorno que a aura muda (e devolve como estavam quando a última aura termina). */
export const AURA_OUTLINE_FIELDS = Object.freeze(Object.keys(FEAR_AURA_OUTLINE));

/**
 * Dados do colorset para `game.dice3d.addColorset`. `visibility: 'hidden'` deixa o conjunto fora
 * da lista de cores das configurações do Dice So Nice (ele é só do dado de pavor).
 * @param {(key: string) => string} localize Tradução das chaves de idioma.
 * @returns {object}
 */
export function fearColorsetData(localize) {
  return {
    name: FEAR_COLORSET,
    description: localize('DESORDEM.Dados3D.Conjunto'),
    category: localize('DESORDEM.Dados3D.Categoria'),
    ...DEFAULT_FEAR_STYLE,
    visibility: 'hidden',
  };
}

/**
 * Aparência do dado de pavor que vai no termo. Na 0.25.2 é sempre o padrão do sistema; a
 * personalização por jogador (0.25.3) vai passar a escolha dele em `style`.
 * @param {object} [style] Campos que trocam o padrão (cores, textura, material, fonte).
 * @returns {object}
 */
export function fearAppearance(style = {}) {
  return { colorset: FEAR_COLORSET, ...DEFAULT_FEAR_STYLE, ...style };
}

/** Efeito especial fixo do termo: a aura de pavor, seja qual for o resultado. */
export function fearAuraSfx() {
  return { specialEffect: FEAR_AURA_SFX, options: {} };
}

/**
 * Posições, na lista de Rolls do teste, do dado de pavor e do pavor abraçado.
 * Os Rolls seguem a ordem de `executeTest`: atributo, perícia, dados extras (até 4 rolados no
 * total) e, por último, o dado de pavor.
 * @param {{rolledCount: number, hasFear: boolean, embracedExtraIndex?: number|null}} input
 *   `rolledCount`: dados do teste rolados (sem o pavor); `embracedExtraIndex`: posição do pavor
 *   abraçado na lista de dados extras.
 * @returns {{fear: number|null, embraced: number|null}}
 */
export function fearRollIndexes({ rolledCount, hasFear, embracedExtraIndex = null }) {
  const embracedAt = Number.isInteger(embracedExtraIndex) ? 2 + embracedExtraIndex : null;
  return {
    fear: hasFear ? rolledCount : null,
    // Só se o dado foi mesmo rolado (passou do limite de 4, ele foi descartado)
    embraced:
      embracedAt !== null && embracedAt < Math.min(rolledCount, MAX_ROLLED) ? embracedAt : null,
  };
}

/**
 * Grava no primeiro termo de dado de cada Roll o que o Dice So Nice deve mostrar:
 * - dado de pavor: a aparência de pavor e a aura;
 * - pavor abraçado: só a aura (o dado segue a aparência normal do jogador).
 * Muda os Rolls recebidos e devolve quantos foram marcados.
 * @param {{dice: {options: object}[]}[]} rolls
 * @param {{fear: number|null, embraced: number|null}} indexes Retorno de `fearRollIndexes`.
 * @param {object} [appearance] Aparência do dado de pavor (padrão: `fearAppearance()`).
 * @returns {number}
 */
export function decorateFearRolls(rolls, indexes, appearance = fearAppearance()) {
  let marked = 0;
  const mark = (index, withAppearance) => {
    const term = rolls[index]?.dice?.[0];
    if (!term) return;
    term.options ??= {};
    if (withAppearance) term.options.appearance = { ...appearance };
    term.options.sfx = fearAuraSfx();
    marked += 1;
  };
  if (indexes.fear !== null) mark(indexes.fear, true);
  if (indexes.embraced !== null) mark(indexes.embraced, false);
  return marked;
}
