/* global document, window, canvas, CSS, setTimeout, clearTimeout */
/**
 * Macros do jogador para celular (v0.25.1), chamadas pelo compêndio «Macros do jogador»:
 * - `openChat`: as últimas mensagens do chat numa janela que se atualiza sozinha. No Swipe, o chat
 *   do Foundry só fica disponível para assinantes; esta janela faz o papel dele pela barra de macros.
 * - `openSheet`: abre (ou traz para a frente) a ficha do personagem, para alternar com o chat.
 * As escolhas ficam em funções puras (`mobile.js`); aqui só a conversa com o Foundry.
 */
import {
  CHAT_HOOKS,
  CONTROL_SELECTOR,
  chatLimit,
  chatWidth,
  isNearBottom,
  lastVisibleMessages,
  pickSheetActor,
  sheetAction,
} from './mobile.js';

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

/** Classe da lista de mensagens dentro da janela (o estilo fica em styles/main.css). */
const LOG_CLASS = 'desordem-chat-janela';

/** Espera (ms) antes de redesenhar: várias mensagens seguidas viram uma atualização só. */
const REFRESH_DELAY = 150;

/**
 * HTML das últimas mensagens visíveis. `renderHTML` (v13) monta cada mensagem como no chat e já
 * chama o hook `renderChatMessageHTML` (o dado de pavor em SVG, as barras dos cartões...). Os
 * botões perdem os eventos ao virar texto; por isso o clique é repassado (veja `forwardClick`).
 * @param {number} limit
 * @returns {Promise<string>}
 */
async function buildChatHTML(limit) {
  const parts = [];
  for (const message of lastVisibleMessages(game.messages.contents, limit)) {
    const element = await message.renderHTML();
    parts.push(element.outerHTML);
  }
  return parts.join('');
}

/**
 * Um clique na janela: num botão, link ou `data-action`, clica no mesmo controle da mensagem real
 * do chat (achado pela posição dele dentro da mensagem); fora deles, abre ou fecha os detalhes da
 * rolagem (os dados de cada `Roll`).
 * @param {MouseEvent} event
 * @param {HTMLElement} root A janela (para não achar a cópia de dentro dela como «real»).
 */
function forwardClick(event, root) {
  const control = event.target.closest(CONTROL_SELECTOR);
  if (!control) {
    const tooltip = event.target.closest('.dice-roll')?.querySelector('.dice-tooltip');
    if (tooltip) tooltip.style.display = tooltip.style.display === 'block' ? 'none' : 'block';
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  const copy = control.closest('[data-message-id]');
  const id = copy?.dataset.messageId;
  if (!id) return;
  const index = [...copy.querySelectorAll(CONTROL_SELECTOR)].indexOf(control);
  const real = [...document.querySelectorAll(`[data-message-id="${CSS.escape(id)}"]`)].find(
    (element) => !root.contains(element),
  );
  const target = real?.querySelectorAll(CONTROL_SELECTOR)[index];
  if (target) target.click();
  else ui.notifications.warn(t('DESORDEM.Celular.MensagemNaoAchada'));
}

/**
 * Liga a janela já desenhada: desce até a última mensagem, redesenha a cada mudança no chat
 * (mantendo a posição de quem está lendo mensagens antigas) e repassa os cliques.
 * @param {HTMLElement} root Elemento da janela.
 * @param {number} limit
 * @returns {() => void} Função que desliga os hooks (chamada ao fechar).
 */
function wireChatWindow(root, limit) {
  const log = root.querySelector(`.${LOG_CLASS}`);
  if (!log) return () => {};
  log.scrollTop = log.scrollHeight;

  let timer = null;
  const refresh = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (!document.body.contains(root)) return;
      const followEnd = isNearBottom(log);
      const oldTop = log.scrollTop;
      log.innerHTML = await buildChatHTML(limit);
      log.scrollTop = followEnd ? log.scrollHeight : oldTop;
    }, REFRESH_DELAY);
  };
  // Pares [nome do hook, id] para desligar cada um depois
  const hookIds = CHAT_HOOKS.map((hook) => [hook, Hooks.on(hook, refresh)]);

  // Fase de captura (true): o clique é tratado aqui antes de qualquer ouvinte da janela
  log.addEventListener('click', (event) => forwardClick(event, root), true);

  return () => {
    clearTimeout(timer);
    for (const [hook, id] of hookIds) Hooks.off(hook, id);
  };
}

/**
 * Macro «Abrir chat»: janela com as últimas `limit` mensagens (padrão 10), atualizada sozinha.
 * @param {{limit?: number}} [options]
 */
export async function openChat({ limit } = {}) {
  const count = chatLimit(limit);
  const initial = await buildChatHTML(count);
  let stop = () => {};
  return foundry.applications.api.DialogV2.prompt({
    window: { title: t('DESORDEM.Celular.ChatTitulo', { n: count }) },
    content: `<ol class="chat-log ${LOG_CLASS}">${initial}</ol>`,
    ok: { label: t('DESORDEM.Celular.Fechar') },
    position: { width: chatWidth(window.innerWidth) },
    rejectClose: false,
    // `render` e `close` são da própria janela (DialogV2): não pegam outra janela aberta junto
    render: (event, dialog) => {
      stop = wireChatWindow((dialog ?? event.target).element, count);
    },
    close: () => stop(),
  });
}

/**
 * Lista de escolha quando o usuário controla vários personagens.
 * @param {Actor[]} actors
 * @returns {Promise<Actor|null>}
 */
async function chooseActor(actors) {
  const id = await foundry.applications.api.DialogV2.wait({
    window: { title: t('DESORDEM.Celular.EscolhaTitulo') },
    content: `<p>${t('DESORDEM.Celular.EscolhaPergunta')}</p>`,
    buttons: actors.map((actor) => ({
      action: actor.id,
      label: foundry.utils.escapeHTML(actor.name),
      callback: () => actor.id,
    })),
    rejectClose: false,
  });
  return id ? game.actors.get(id) : null;
}

/**
 * Macro «Abrir ficha»: o personagem vinculado, senão o token selecionado, senão os personagens que
 * o usuário controla (com lista se forem vários). Ficha aberta vem para a frente; minimizada volta
 * ao tamanho normal.
 * @returns {Promise<Actor|null>} O ator aberto, ou null.
 */
export async function openSheet() {
  const pick = pickSheetActor({
    character: game.user.character,
    controlled: canvas?.tokens?.controlled[0]?.actor ?? null,
    owned: game.actors.contents,
  });
  const actor = pick.actor ?? (pick.choices ? await chooseActor(pick.choices) : null);
  if (!actor) {
    if (pick.none) ui.notifications.warn(t('DESORDEM.Celular.SemPersonagem'));
    return null;
  }
  const sheet = actor.sheet;
  const action = sheetAction(sheet);
  if (action === 'render') await sheet.render({ force: true });
  else {
    if (action === 'restore') await sheet.maximize();
    sheet.bringToFront();
  }
  return actor;
}
