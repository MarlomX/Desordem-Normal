/**
 * Janelas da folha do ponto de interesse (v0.28.8): para quem revelar uma linha ou um vínculo e
 * quem recebe um item. Saíram de `point-sheet.js` (não dependem do estado da folha).
 */
import { SYSTEM_ID } from '../config.js';
import { escapeHtml } from '../sheets/notes.js';
import { t } from '../shared/i18n.js';

const { DialogV2 } = foundry.applications.api;
const { renderTemplate } = foundry.applications.handlebars;

const TEMPLATES = `systems/${SYSTEM_ID}/templates/diario`;

/** Jogadores do mundo (todos os usuários que não são mestre). */
export function pointPlayers() {
  return game.users.filter((user) => !user.isGM);
}

/** O jogador pode ver a página (Observador ou mais, contando a permissão do diário)? */
export function canSeePage(page, user) {
  return page.testUserPermission(user, 'OBSERVER');
}

/**
 * Janela «Revelar para quem?»: caixas dos jogadores, com os já escolhidos marcados. Avisa de
 * quem não tem permissão na página.
 * @param {JournalEntryPage} page Página do ponto de interesse (para conferir quem pode vê-la).
 * @param {string[]} selected Ids já escolhidos.
 * @returns {Promise<User[]|null>} Jogadores escolhidos, ou `null` se cancelou.
 */
export async function askRevealUsers(page, selected) {
  const players = pointPlayers();
  if (!players.length) {
    ui.notifications.info(t('DESORDEM.Ponto.Jogadores.Nenhum'));
    return null;
  }
  const content = await renderTemplate(`${TEMPLATES}/ponto-jogadores.hbs`, {
    jogadores: players.map((user) => ({
      id: user.id,
      nome: user.name,
      personagem: user.character?.name ?? '',
      marcado: selected.includes(user.id),
      semAcesso: !canSeePage(page, user),
    })),
  });
  const answer = await DialogV2.wait({
    window: { title: t('DESORDEM.Ponto.Jogadores.Titulo') },
    classes: ['desordem-normal', 'desordem-ponto-dialogo'],
    content,
    modal: true,
    rejectClose: false,
    buttons: [
      {
        action: 'salvar',
        label: t('DESORDEM.Ponto.Jogadores.Salvar'),
        icon: 'fa-solid fa-user-check',
        default: true,
        callback: (event, button, dialog) => ({
          confirmed: true,
          ids: [...dialog.element.querySelectorAll('[name="jogador"]:checked')].map(
            (input) => input.value,
          ),
        }),
      },
      { action: 'cancelar', label: t('DESORDEM.Ponto.Jogadores.Cancelar') },
    ],
  });
  // Só {confirmed: true} confirma: fechar no X ou cancelar devolve outra coisa
  if (answer?.confirmed !== true) return null;
  // Nunca confia no que veio da janela: só vale quem estava na lista oferecida
  const chosen = players.filter((user) => answer.ids.includes(user.id));
  const blind = chosen.filter((user) => !canSeePage(page, user));
  if (blind.length) {
    ui.notifications.warn(
      t('DESORDEM.Ponto.AvisoSemAcesso', { nomes: blind.map((user) => user.name).join(', ') }),
    );
  }
  return chosen;
}

/**
 * Janela para escolher quem recebe o item: os personagens do mundo, com os de jogadores primeiro.
 * @returns {Promise<Actor|null>}
 */
export async function askReceivingActor(itemName) {
  const characters = game.actors
    .filter((actor) => actor.type === 'personagem')
    .sort((a, b) => Number(b.hasPlayerOwner) - Number(a.hasPlayerOwner));
  if (!characters.length) {
    ui.notifications.warn(t('DESORDEM.Ponto.Vinculo.SemPersonagens'));
    return null;
  }
  const options = characters
    .map((actor) => `<option value="${actor.id}">${escapeHtml(actor.name)}</option>`)
    .join('');
  const answer = await DialogV2.wait({
    window: { title: t('DESORDEM.Ponto.Vinculo.EntregarTitulo', { item: itemName }) },
    classes: ['desordem-normal', 'desordem-ponto-dialogo'],
    content: `<div class="form-group"><label>${escapeHtml(t('DESORDEM.Ponto.Vinculo.Quem'))}</label><div class="form-fields"><select name="personagem">${options}</select></div></div>`,
    modal: true,
    rejectClose: false,
    buttons: [
      {
        action: 'entregar',
        label: t('DESORDEM.Ponto.Vinculo.Entregar'),
        icon: 'fa-solid fa-hand-holding',
        default: true,
        callback: (event, button, dialog) => ({
          confirmed: true,
          id: dialog.element.querySelector('[name="personagem"]')?.value,
        }),
      },
      { action: 'cancelar', label: t('DESORDEM.Ponto.Jogadores.Cancelar') },
    ],
  });
  if (answer?.confirmed !== true) return null;
  return characters.find((actor) => actor.id === answer.id) ?? null;
}
