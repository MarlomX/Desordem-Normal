/**
 * Vínculo do token-modelo dos personagens: o token colocado na cena fica ligado à ficha (o que
 * acontece num muda no outro). Personagens novos já nascem vinculados; uma migração única, feita
 * pelo mestre, vincula o token-modelo dos personagens que já existiam. Os tokens que já estão nas
 * cenas não mudam (o mestre os troca, se quiser).
 */
/* global Actor */
import { SYSTEM_ID } from '../config.js';

/** Configuração do mundo que diz se a migração já rodou. */
export const LINK_SETTING = 'tokensVinculados';

/**
 * O personagem novo deve nascer vinculado? Sim, a não ser que os dados de criação já digam algo
 * sobre o vínculo (ficha importada ou duplicada).
 * @param {string} type Tipo do ator.
 * @param {object} data Dados de criação (`preCreateActor`).
 */
export function shouldLinkNew(type, data) {
  return type === 'personagem' && data?.prototypeToken?.actorLink === undefined;
}

/**
 * Gravações da migração: uma por personagem cujo token-modelo ainda não está vinculado.
 * @param {{id: string, type: string, prototypeToken?: {actorLink?: boolean}}[]} actors
 * @returns {{_id: string, 'prototypeToken.actorLink': true}[]}
 */
export function linkMigrationUpdates(actors) {
  return actors
    .filter((actor) => actor.type === 'personagem' && !actor.prototypeToken?.actorLink)
    .map((actor) => ({ _id: actor.id, 'prototypeToken.actorLink': true }));
}

/** Migração única (só o mestre ativo): vincula os tokens-modelo dos personagens existentes. */
async function migrateTokenLinks() {
  if (game.users.activeGM?.id !== game.user.id) return;
  if (game.settings.get(SYSTEM_ID, LINK_SETTING)) return;
  const updates = linkMigrationUpdates([...game.actors]);
  if (updates.length) await Actor.implementation.updateDocuments(updates);
  await game.settings.set(SYSTEM_ID, LINK_SETTING, true);
  if (updates.length) {
    ui.notifications.info(game.i18n.format('DESORDEM.Token.Migrados', { n: updates.length }));
  }
}

/** Registra a configuração e o hook (chamar uma vez, no `init`). */
export function registerTokenLink() {
  game.settings.register(SYSTEM_ID, LINK_SETTING, {
    scope: 'world',
    config: false,
    type: Boolean,
    default: false,
  });
  Hooks.on('preCreateActor', (actor, data) => {
    if (shouldLinkNew(actor.type, data)) actor.updateSource({ 'prototypeToken.actorLink': true });
  });
  Hooks.once('ready', () => migrateTokenLinks());
}
