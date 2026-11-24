/**
 * Macros para celular (v0.25.1): as escolhas das macros «Abrir chat» e «Abrir ficha» em funções
 * puras, sem Foundry, testadas em Node (tests/mobile.test.js). A conversa com o Foundry (janela,
 * hooks, cliques) fica em `macros.js`.
 */

/** Quantas mensagens a janela do chat mostra quando a macro não diz outro número. */
export const CHAT_LIMIT = 10;

/** Maior quantidade aceita (renderizar muitas mensagens deixa o celular lento). */
export const CHAT_LIMIT_MAX = 50;

/** Distância do fim da lista (em px) que ainda conta como «está lendo o fim». */
export const NEAR_BOTTOM_PX = 80;

/** Largura máxima da janela do chat e a folga deixada nas bordas da tela. */
export const CHAT_WIDTH = 420;
export const SCREEN_MARGIN = 20;

/**
 * Hooks que pedem uma atualização da janela do chat.
 * `diceSoNiceRollComplete` (v0.27.4): com o Dice So Nice, a mensagem nova chega escondida (classe
 * `dsn-hide`) enquanto os dados 3D rolam, e o módulo só a mostra no chat de verdade quando a
 * animação acaba; a cópia da janela ficava escondida para sempre. Este hook (do Dice So Nice, com o
 * id da mensagem) avisa o fim da animação; sem o módulo ele nunca é chamado.
 */
export const CHAT_HOOKS = [
  'createChatMessage',
  'updateChatMessage',
  'deleteChatMessage',
  'diceSoNiceRollComplete',
];

/** Controles de uma mensagem cujo clique é repassado para a mensagem real do chat. */
export const CONTROL_SELECTOR = 'button, a, [data-action]';

/**
 * Quantidade de mensagens a mostrar: um inteiro de 1 a `CHAT_LIMIT_MAX`. Qualquer outra coisa
 * (vazio, texto, zero) vira o padrão `CHAT_LIMIT`; números grandes param no máximo.
 * @param {unknown} value O número pedido pela macro.
 * @returns {number}
 */
export function chatLimit(value) {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number) || number < 1) return CHAT_LIMIT;
  return Math.min(number, CHAT_LIMIT_MAX);
}

/**
 * As últimas mensagens que este usuário pode ver, na ordem do chat (a mais antiga primeiro).
 * `visible` é a regra do próprio Foundry: sussurros para outras pessoas ficam de fora.
 * @param {{visible: boolean}[]} messages Mensagens do mundo, na ordem do chat.
 * @param {number} limit Quantas no máximo.
 * @returns {object[]}
 */
export function lastVisibleMessages(messages, limit) {
  const visible = messages.filter((message) => message.visible);
  return visible.slice(-chatLimit(limit));
}

/**
 * Se a lista está rolada até (quase) o fim. Quando está, a atualização automática desce junto
 * com a mensagem nova; quando não está, a posição de leitura é mantida.
 * @param {{scrollHeight: number, scrollTop: number, clientHeight: number}} box Medidas da lista.
 * @param {number} [threshold] Folga em px.
 * @returns {boolean}
 */
export function isNearBottom(
  { scrollHeight, scrollTop, clientHeight },
  threshold = NEAR_BOTTOM_PX,
) {
  return scrollHeight - scrollTop - clientHeight < threshold;
}

/**
 * Largura da janela do chat: até `CHAT_WIDTH`, sem passar da tela (com a folga das bordas).
 * @param {number} screenWidth Largura da tela (window.innerWidth).
 * @returns {number}
 */
export function chatWidth(screenWidth) {
  return Math.max(0, Math.min(screenWidth - SCREEN_MARGIN, CHAT_WIDTH));
}

/**
 * Qual ficha a macro «Abrir ficha» abre, nesta ordem:
 * 1) o personagem vinculado ao usuário; 2) o ator do token selecionado no mapa (qualquer tipo, para
 * o mestre abrir uma criatura pelo token); 3) os personagens (tipo `personagem`) que o usuário
 * controla: um só abre direto, vários viram uma lista de escolha.
 * @param {{character?: object|null, controlled?: object|null, owned?: object[]}} input
 *   `owned` são os atores do mundo com `isOwner` e `type`.
 * @returns {{actor: object}|{choices: object[]}|{none: true}}
 */
export function pickSheetActor({ character = null, controlled = null, owned = [] } = {}) {
  if (character) return { actor: character };
  if (controlled) return { actor: controlled };
  const characters = owned.filter((actor) => actor.isOwner && actor.type === 'personagem');
  if (characters.length === 1) return { actor: characters[0] };
  if (characters.length > 1) return { choices: characters };
  return { none: true };
}

/**
 * O que fazer com a ficha: abrir (`render`), voltar ao tamanho normal e trazer para a frente
 * (`restore`, quando está minimizada) ou só trazer para a frente (`front`).
 * @param {{rendered: boolean, minimized?: boolean}} sheet
 * @returns {'render'|'restore'|'front'}
 */
export function sheetAction(sheet) {
  if (!sheet.rendered) return 'render';
  return sheet.minimized ? 'restore' : 'front';
}
