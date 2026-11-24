/**
 * Encontros guardados como Combat de subtipo próprio (v0.28.4): a perseguição e a cena de
 * furtividade. As duas têm o mesmo ciclo de vida (só uma de cada por vez, criada sem cena,
 * participantes como Combatant); este módulo guarda a parte igual.
 */
import { t } from './i18n.js';

/* global getDocumentClass */

/**
 * Id do ator do mundo por trás de uma ficha (a ficha de um token sem vínculo aponta para o ator
 * base). `undefined` sem ator.
 * @param {Actor} [actor]
 */
export const worldActorId = (actor) => (actor?.isToken ? actor.baseActor?.id : actor?.id);

/** O encontro existente desse subtipo (só pode haver um por vez) ou `null`. */
export function findEncounter(type) {
  return game.combats.find((combat) => combat.type === type) ?? null;
}

/** O usuário atual é dono de algum personagem que participa do encontro? */
export function userOwnsParticipant(encounter) {
  return encounter.combatants.some((combatant) => combatant.actor?.isOwner);
}

/**
 * Cria o encontro em preparação. Só o mestre cria; se já existe um, avisa (`existsKey`) e devolve
 * `null`. Tenta sem cena (o encontro funciona sem mapa nem tokens); se o Foundry recusar, cria
 * com a cena padrão.
 * @param {string} type Subtipo do Combat.
 * @param {object} system Estado inicial.
 * @param {string} existsKey Aviso «já existe».
 * @returns {Promise<Combat|null>}
 */
export async function createEncounter(type, system, existsKey) {
  if (!game.user.isGM) return null;
  if (findEncounter(type)) {
    ui.notifications.warn(t(existsKey));
    return null;
  }
  const Combat = getDocumentClass('Combat');
  const data = { type, system };
  try {
    return await Combat.create({ ...data, scene: null });
  } catch (error) {
    console.warn(
      'desordem-normal | Combat sem cena não foi aceito; criando com a cena padrão.',
      error,
    );
    return Combat.create(data);
  }
}

/**
 * Grava o mesmo tipo de mudança em todos os participantes, numa gravação só (nada é gravado se
 * não houver nenhum).
 * @param {Combat} encounter
 * @param {(combatant: Combatant) => object} systemFor Dados `system` de cada participante.
 */
export async function updateAllParticipants(encounter, systemFor) {
  const updates = encounter.combatants.map((combatant) => ({
    _id: combatant.id,
    system: systemFor(combatant),
  }));
  if (updates.length) await encounter.updateEmbeddedDocuments('Combatant', updates);
}
