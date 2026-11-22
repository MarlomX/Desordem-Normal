/**
 * Ganchos do Foundry para as páginas «Ponto de interesse» (v0.24.0): mantêm o número na frente
 * do nome da página («4.1 · Potes», para aparecer assim no índice do diário) e põem o subponto
 * num nível mais baixo do índice («4.1» = nível 2).
 *
 * Os ganchos `preCreate…` e `preUpdate…` rodam no cliente de quem cria ou edita, antes de a
 * mudança ir ao servidor; mexer nos dados ali faz a mudança sair já corrigida (sem gravar duas
 * vezes).
 */
import { POINT_TYPE, headingLevel, pointPageName } from './point.js';

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
}
