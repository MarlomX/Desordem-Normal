/**
 * Linhas que cada jogador já viu nos pontos de interesse (v0.24.3), guardadas no mundo: num
 * flag do próprio documento do usuário (`game.user`). O jogador pode gravar no próprio usuário
 * sem passar pelo mestre, e o dado vai junto para qualquer computador em que ele entrar.
 *
 * Formato: `user.flags["desordem-normal"].pontosVistos[<chave da página>] = [ids das linhas]`.
 * A lista guardada é sempre «o que ele via na última visita»: uma linha escondida sai dela, e se
 * for revelada de novo volta a ser novidade.
 */
import { SYSTEM_ID } from '../config.js';
import { sameIds } from './point.js';

/** Nome do flag no usuário. */
const FLAG = 'pontosVistos';

/**
 * Chave da página no flag: id do diário + id da página. Só o id da página poderia repetir se a
 * mesma aventura fosse importada duas vezes de um compêndio (a importação mantém os ids).
 */
export function seenKey(page) {
  return `${page.parent?.id ?? 'sem-diario'}_${page.id}`;
}

/** Ids das linhas que o usuário já viu nesta página (lista vazia se nunca abriu). */
export function readSeen(page, user = game.user) {
  const all = user?.getFlag(SYSTEM_ID, FLAG);
  const ids = all?.[seenKey(page)];
  return Array.isArray(ids) ? ids : [];
}

/**
 * Grava a lista de vistas da página (só se mudou, para não gravar a cada redesenho).
 * @param {JournalEntryPage} page
 * @param {string[]} ids Linhas que ele vê agora.
 */
export async function saveSeen(page, ids, user = game.user) {
  if (!user || sameIds(readSeen(page, user), ids)) return;
  await user.update({ [`flags.${SYSTEM_ID}.${FLAG}.${seenKey(page)}`]: [...ids] });
}
