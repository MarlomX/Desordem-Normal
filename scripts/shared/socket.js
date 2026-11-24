/**
 * Socket do sistema (v0.28.2): os pedidos dos jogadores ao mestre ativo.
 *
 * Um jogador não pode gravar mensagens, desafios ou participantes que não são dele; o botão manda
 * um pedido pelo socket e o navegador do mestre ativo (um só, mesmo com vários mestres
 * conectados) confere e grava. Antes cada módulo registrava o próprio ouvinte; agora há um só,
 * que entrega cada pedido ao atendente da sua `action`.
 */
import { SYSTEM_ID } from '../config.js';
import { t } from './i18n.js';

/** Canal de socket do sistema (o Foundry exige o prefixo `system.`). */
export const SOCKET = `system.${SYSTEM_ID}`;

/** Este navegador é o do mestre ativo (o que atende os pedidos)? */
export const isActiveGM = () => game.users.activeGM?.id === game.user.id;

/** Atendentes: nome da ação → função `(data, userId)`, chamada só no mestre ativo. */
const handlers = new Map();

/** O ouvinte único já foi registrado no `game.socket`? */
let listening = false;

/**
 * Registra o atendente de uma ação. Ele só roda no navegador do mestre ativo e recebe os dados
 * do pedido e o id de quem pediu (os dados vêm do jogador: o atendente confere tudo).
 * Chame no `ready` (ou depois): o `game.socket` precisa existir.
 * @param {string} action Nome da ação (o campo `action` do pedido).
 * @param {(data: object, userId: string) => *} handler
 */
export function onSocketAction(action, handler) {
  if (handlers.has(action)) console.warn(`${SYSTEM_ID} | ação de socket repetida: ${action}`);
  handlers.set(action, handler);
  if (listening) return;
  listening = true;
  game.socket.on(SOCKET, (data, userId) => {
    if (!isActiveGM()) return undefined;
    const handle = handlers.get(data?.action);
    return handle ? handle(data, userId) : undefined;
  });
}

/** Nomes das ações com atendente (para os testes conferirem que cada pedido tem quem atenda). */
export const socketActions = () => [...handlers.keys()];

/** Aviso padrão quando um pedido precisa do mestre e não há nenhum conectado (v0.28.3). */
export const NO_GM_KEY = 'DESORDEM.SemMestre';

/**
 * Há um mestre ativo para atender um pedido? Sem nenhum conectado, avisa o jogador.
 * @param {string} [warnKey] Chave do aviso (o padrão serve para qualquer botão).
 * @returns {boolean}
 */
export function hasActiveGM(warnKey = NO_GM_KEY) {
  if (game.users.activeGM) return true;
  ui.notifications.warn(t(warnKey));
  return false;
}

/**
 * Este navegador grava `doc` sozinho, ou há um mestre ativo para pedir? Chamado antes de um botão
 * gastar recursos ou abrir janelas: sem nenhum dos dois, avisa e o botão não faz nada (v0.28.3;
 * antes o pedido saía sem ninguém para atender e o clique se perdia em silêncio).
 * @param {{canUserModify: Function}} doc Mensagem (ou documento) que o botão vai mudar.
 * @param {string} [warnKey] Chave do aviso.
 */
export function canWriteOrAsk(doc, warnKey = NO_GM_KEY) {
  return doc.canUserModify(game.user, 'update') || hasActiveGM(warnKey);
}
