/**
 * Ganchos do Foundry para as páginas «Ponto de interesse».
 *
 * v0.24.0: mantêm o número na frente do nome da página («4.1 · Potes», para aparecer assim no
 * índice do diário) e põem o subponto num nível mais baixo do índice («4.1» = nível 2). Os
 * ganchos `preCreate…` e `preUpdate…` rodam no cliente de quem cria ou edita, antes de a mudança
 * ir ao servidor; mexer nos dados ali faz a mudança sair já corrigida (sem gravar duas vezes).
 *
 * v0.24.3: aviso curto para o jogador que recebe uma linha nova, e a marca de «novo» zerada
 * quando o diário fecha.
 */
import {
  POINT_TYPE,
  headingLevel,
  newLineIds,
  normalizeBlocks,
  pointPageName,
  visibleLineIds,
} from './point.js';
import { readSeen } from './point-seen.js';
import PontoInteresseSheet from './point-sheet.js';

/**
 * Linhas já avisadas nesta sessão, por página (uuid → ids). Evita avisar de novo a mesma linha
 * se a página mudar outra vez antes de o jogador abri-la (abrir grava a lista de vistas).
 */
const notified = new Map();

export function registerPointHooks() {
  // Página nova (ou duplicada): nome com o número e nível do índice pelo número
  Hooks.on('preCreateJournalEntryPage', (page) => {
    if (page.type !== POINT_TYPE) return;
    const numero = page.system?.numero ?? '';
    const update = {};
    const name = pointPageName(page.name, '', numero);
    if (name !== page.name) update.name = name;
    if (numero) update['title.level'] = headingLevel(numero);
    // `updateSource` muda os dados que vão ser criados (não é uma gravação à parte)
    if (Object.keys(update).length) page.updateSource(update);
  });

  // Edição: se o nome ou o número mudou, refaz o prefixo; se o número mudou, refaz o nível.
  // O nível escolhido à mão no cabeçalho da página continua valendo até o número mudar.
  Hooks.on('preUpdateJournalEntryPage', (page, changes) => {
    if (page.type !== POINT_TYPE) return;
    const oldNumero = page.system?.numero ?? '';
    const sent = foundry.utils.getProperty(changes, 'system.numero');
    const numeroChanged = typeof sent === 'string' && sent.trim() !== oldNumero.trim();
    if (!('name' in changes) && !numeroChanged) return;
    const numero = numeroChanged ? sent : oldNumero;
    changes.name = pointPageName(changes.name ?? page.name, oldNumero, numero);
    if (numeroChanged) foundry.utils.setProperty(changes, 'title.level', headingLevel(numero));
  });

  // Aviso ao jogador: roda em cada computador quando a página muda. Quem vê o quadro inteiro
  // (dono) não recebe aviso; o jogador só é avisado se pode ver a página e ganhou alguma linha
  // que ainda não tinha visto. A notificação comum do Foundry fecha sozinha.
  Hooks.on('updateJournalEntryPage', (page, changes) => {
    if (page.type !== POINT_TYPE || page.isOwner) return;
    if (foundry.utils.getProperty(changes, 'system.blocos') === undefined) return;
    if (!page.testUserPermission(game.user, 'OBSERVER')) return;
    const visible = visibleLineIds(normalizeBlocks(page.system.blocos), game.user.id);
    const already = notified.get(page.uuid) ?? new Set();
    const fresh = newLineIds(visible, [...readSeen(page), ...already]);
    if (!fresh.length) return;
    for (const id of fresh) already.add(id);
    notified.set(page.uuid, already);
    ui.notifications.info(game.i18n.format('DESORDEM.Ponto.Aviso', { pagina: page.name }));
  });

  // Diário fechado: as páginas de ponto dele esquecem a marca de «novo» desta visita
  Hooks.on('closeJournalEntrySheet', (app) => {
    PontoInteresseSheet.clearFreshFor(app.document);
  });
}
