/**
 * Quem pode aceitar o lado em aberto de um teste oposto (v0.25.3), em função pura (testada em
 * tests/opposed-candidates.test.js). A leitura do Foundry (tokens, atores, usuário) fica em
 * `chat/common.js`.
 */

/** Tipos de ator que entram num teste oposto. */
export const OPPOSED_ACTOR_TYPES = Object.freeze(['personagem', 'criatura']);

/**
 * Atores com que o usuário pode aceitar, sem repetir e nunca o ator do outro lado:
 * 1) os dos tokens selecionados no mapa; 2) o personagem vinculado ao usuário; 3) para jogadores,
 * todos os atores de que é dono; para o mestre, os dos tokens da cena aberta.
 * Se o mestre ficar sem nenhum (cena vazia, sem cena), entram todos os personagens e criaturas do
 * mundo. Antes da v0.25.3 a lista ficava vazia e o botão «Aceitar» sumia.
 * @param {object} input
 * @param {boolean} input.isGM
 * @param {object[]} [input.controlled] Atores dos tokens selecionados.
 * @param {object|null} [input.character] Personagem vinculado ao usuário.
 * @param {object[]} [input.sceneActors] Atores dos tokens da cena aberta.
 * @param {object[]} [input.worldActors] Todos os atores do mundo.
 * @param {string|null} [input.excludeUuid] Uuid do ator do outro lado.
 * @returns {object[]} Atores (com `uuid`, `type` e `isOwner`).
 */
export function acceptCandidates({
  isGM,
  controlled = [],
  character = null,
  sceneActors = [],
  worldActors = [],
  excludeUuid = null,
}) {
  const list = [];
  const add = (actor) => {
    if (!actor?.isOwner || !OPPOSED_ACTOR_TYPES.includes(actor.type)) return;
    if (actor.uuid === excludeUuid || list.includes(actor)) return;
    list.push(actor);
  };
  controlled.forEach(add);
  add(character);
  (isGM ? sceneActors : worldActors).forEach(add);
  // Reserva do mestre: nenhum token servia, então vale qualquer ator do mundo
  if (isGM && !list.length) worldActors.forEach(add);
  return list;
}
