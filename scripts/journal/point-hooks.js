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
 *
 * v0.24.6: quando o número de um ponto muda, os subpontos dele são renumerados (3.2 → 5.2); as
 * páginas do diário se reorganizam sozinhas (páginas comuns primeiro, pontos pelo número); o menu
 * «⋮» da janela do diário ganha «Ordenar pontos por número» e «Esconder todos os pontos»; e a
 * configuração do usuário que liga a barra «Usar no ponto de interesse» nos cartões de teste.
 *
 * v0.24.7: marcador no mapa. Uma Nota (o alfinete de diário) ligada a uma página de ponto usa a
 * imagem de referência do ponto como ícone (ou a lupa, se a imagem está escondida ou não existe)
 * e o nome da página como texto; quando a imagem ou o nome mudam, os marcadores acompanham.
 */
import { SYSTEM_ID } from '../config.js';
import {
  POINT_TYPE,
  childNumberFor,
  headingLevel,
  hideAll,
  newLineIds,
  noteIconFor,
  noteUpdates,
  normalizeBlocks,
  pointPageName,
  sortUpdates,
  visibleLineIds,
} from './point.js';
import { readSeen } from './point-seen.js';
import PontoInteresseSheet from './point-sheet.js';

/**
 * Linhas já avisadas nesta sessão, por página (uuid → ids). Evita avisar de novo a mesma linha
 * se a página mudar outra vez antes de o jogador abri-la (abrir grava a lista de vistas).
 */
const notified = new Map();

/** Nome da configuração (do usuário) que mostra a barra «Usar no ponto» nos cartões de teste. */
export const POINT_BAR_SETTING = 'barraPontoInteresse';

/** Traduz uma chave. */
const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

/** A página é um ponto de interesse? */
const isPoint = (page) => page?.type === POINT_TYPE;

/** Ícone neutro do marcador (lupa), para ponto sem imagem ou com a imagem escondida. */
export const NEUTRAL_NOTE_ICON = `systems/${SYSTEM_ID}/styles/icones/lupa.svg`;

/** Ícone padrão do Foundry para marcadores de diário (o livro). */
const defaultNoteIcon = () => foundry.documents.BaseNote?.DEFAULT_ICON ?? 'icons/svg/book.svg';

/** Página de ponto à qual um marcador aponta (ou `null`). */
function pointOfNote(note) {
  const page = game.journal.get(note.entryId)?.pages.get(note.pageId);
  return isPoint(page) ? page : null;
}

/**
 * Marcadores da página em todas as cenas, já agrupados por cena.
 * @returns {{scene: Scene, notes: NoteDocument[]}[]}
 */
function notesOfPage(page) {
  return game.scenes.contents
    .map((scene) => ({
      scene,
      notes: scene.notes.filter(
        (note) => note.entryId === page.parent?.id && note.pageId === page.id,
      ),
    }))
    .filter((group) => group.notes.length);
}

/**
 * Depois que a imagem ou o nome de um ponto mudaram: troca o ícone e o texto dos marcadores dele
 * (só o que o sistema controla; veja `noteUpdates`). Só o mestre grava marcadores.
 * @param {JournalEntryPage} page Página já atualizada.
 * @param {{oldIcon: string, oldName: string}} before O que valia antes (guardado no preUpdate).
 */
async function syncNotes(page, before) {
  const change = {
    oldIcon: before.oldIcon,
    newIcon: noteIconFor(page.system, NEUTRAL_NOTE_ICON),
    oldName: before.oldName,
    newName: page.name,
    managed: [NEUTRAL_NOTE_ICON, defaultNoteIcon()],
  };
  if (change.oldIcon === change.newIcon && change.oldName === change.newName) return;
  for (const { scene, notes } of notesOfPage(page)) {
    const updates = noteUpdates(
      notes.map((note) => ({ id: note.id, src: note.texture?.src ?? '', text: note.text ?? '' })),
      change,
    );
    if (updates.length) await scene.updateEmbeddedDocuments('Note', updates);
  }
}

/**
 * Reorganiza as páginas do diário: as comuns primeiro (na ordem que tinham), depois os pontos
 * pelo número (1, 1.1, 1.2, 2, 3, 3.1, 3.1.1, 3.2). Só grava o que muda de lugar.
 * @param {JournalEntry} entry
 */
export async function sortPointPages(entry) {
  if (!entry?.isOwner) return;
  const updates = sortUpdates(
    entry.pages.contents.map((page) => ({
      id: page.id,
      isPoint: isPoint(page),
      numero: isPoint(page) ? page.system.numero : '',
      sort: page.sort,
    })),
  );
  if (updates.length) await entry.updateEmbeddedDocuments('JournalEntryPage', updates);
}

/**
 * Ordenação automática com espera: uma renumeração em cascata muda várias páginas seguidas, e o
 * diário só precisa ser reorganizado uma vez no fim (um temporizador por diário).
 */
const sortTimers = new Map();
function scheduleSort(entry) {
  if (!entry) return;
  globalThis.clearTimeout(sortTimers.get(entry.id));
  sortTimers.set(
    entry.id,
    globalThis.setTimeout(() => {
      sortTimers.delete(entry.id);
      sortPointPages(entry).catch((error) =>
        console.warn(`${SYSTEM_ID} | não foi possível ordenar os pontos`, error),
      );
    }, 300),
  );
}

/**
 * Renumera os filhos diretos de um ponto que mudou de número (3.2 com o pai indo para 5 → 5.2).
 * A gravação dos filhos dispara este mesmo gancho para eles, e assim chega aos netos.
 */
async function renumberChildren(page) {
  const entry = page.parent;
  const updates = entry.pages.contents
    .filter((child) => isPoint(child) && child.system.paiId === page.id)
    .map((child) => ({
      _id: child.id,
      numero: childNumberFor(page.system.numero, child.system.numero),
      atual: child.system.numero,
    }))
    .filter((entryUpdate) => entryUpdate.numero !== entryUpdate.atual)
    .map(({ _id, numero }) => ({ _id, 'system.numero': numero }));
  if (updates.length) await entry.updateEmbeddedDocuments('JournalEntryPage', updates);
}

/** Esconde todas as linhas de todos os pontos do diário (para reusar a aventura), com confirmação. */
export async function hideAllPoints(entry) {
  if (!entry?.isOwner) return;
  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: { title: t('DESORDEM.Ponto.Diario.EsconderTodos') },
    content: `<p>${t('DESORDEM.Ponto.Diario.ConfirmarEsconderTodos')}</p>`,
    rejectClose: false,
  });
  if (!confirmed) return;
  const updates = entry.pages.contents.filter(isPoint).map((page) => ({
    _id: page.id,
    'system.blocos': hideAll(normalizeBlocks(page._source.system?.blocos)),
  }));
  if (updates.length) await entry.updateEmbeddedDocuments('JournalEntryPage', updates);
  ui.notifications.info(t('DESORDEM.Ponto.Diario.Escondidos', { n: updates.length }));
}

/** Configuração do usuário: barra «Usar no ponto de interesse» nos cartões de teste (desligada). */
export function registerPointSettings() {
  game.settings.register(SYSTEM_ID, POINT_BAR_SETTING, {
    name: 'DESORDEM.Ponto.Config.Barra',
    hint: 'DESORDEM.Ponto.Config.BarraDica',
    scope: 'client',
    config: true,
    type: Boolean,
    default: false,
    // Redesenha o chat para a barra aparecer ou sumir na hora
    onChange: () => ui.chat?.render?.(),
  });
}

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
  Hooks.on('preUpdateJournalEntryPage', (page, changes, options) => {
    if (page.type !== POINT_TYPE) return;
    // Para os marcadores do mapa (v0.24.7): o ícone e o nome de antes vão junto com a gravação
    // (as `options` chegam ao gancho de depois, no computador de quem gravou)
    options.desordemNota = {
      oldIcon: noteIconFor(page.system, NEUTRAL_NOTE_ICON),
      oldName: page.name,
    };
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

  // Só no computador de quem mudou (userId): renumera os subpontos e reorganiza o diário. Assim
  // a cascata roda uma vez só, e por quem tem permissão de gravar.
  Hooks.on('updateJournalEntryPage', (page, changes, options, userId) => {
    if (!isPoint(page) || userId !== game.user.id) return;
    if (foundry.utils.getProperty(changes, 'system.numero') === undefined) return;
    renumberChildren(page).catch((error) =>
      console.warn(`${SYSTEM_ID} | não foi possível renumerar os subpontos`, error),
    );
    scheduleSort(page.parent);
  });
  Hooks.on('createJournalEntryPage', (page, options, userId) => {
    if (isPoint(page) && userId === game.user.id) scheduleSort(page.parent);
  });

  // Marcador novo ligado a uma página de ponto: imagem do ponto (ou lupa) no lugar do livro, e o
  // nome da página como texto. Um ícone já escolhido à mão (diferente do livro) fica.
  Hooks.on('preCreateNote', (note) => {
    const page = pointOfNote(note);
    if (!page) return;
    const update = {};
    const src = note.texture?.src;
    if (!src || src === defaultNoteIcon()) {
      update['texture.src'] = noteIconFor(page.system, NEUTRAL_NOTE_ICON);
    }
    if (!note.text) update.text = page.name;
    if (Object.keys(update).length) note.updateSource(update);
  });

  // Ponto mudou (imagem, «jogadores veem a imagem» ou nome): os marcadores acompanham. Só no
  // computador do mestre que gravou, para não gravar várias vezes.
  Hooks.on('updateJournalEntryPage', (page, changes, options, userId) => {
    if (!isPoint(page) || userId !== game.user.id || !game.user.isGM) return;
    if (!options?.desordemNota) return;
    syncNotes(page, options.desordemNota).catch((error) =>
      console.warn(`${SYSTEM_ID} | não foi possível atualizar os marcadores do ponto`, error),
    );
  });

  // Menu «⋮» da janela do diário (só para quem pode editar o diário)
  Hooks.on('getHeaderControlsJournalEntrySheet', (app, controls) => {
    const entry = app.document;
    if (!entry?.isOwner) return;
    const add = (action, icon, label, handler) => {
      // O Foundry chama `onClick` (ou, nas versões que não aceitam, a ação de mesmo nome)
      app.options.actions[action] ??= () => handler(entry);
      controls.push({ action, icon, label, onClick: () => handler(entry) });
    };
    add(
      'desordemOrdenarPontos',
      'fa-solid fa-arrow-down-1-9',
      'DESORDEM.Ponto.Diario.Ordenar',
      sortPointPages,
    );
    add(
      'desordemEsconderPontos',
      'fa-solid fa-eye-slash',
      'DESORDEM.Ponto.Diario.EsconderTodos',
      hideAllPoints,
    );
  });
}
