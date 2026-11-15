/**
 * Adaptador fino entre a lógica da perseguição e o Foundry: é aqui que o estado é lido e gravado
 * (hoje num Combat do tipo `perseguicao`). Se o subtipo de Combat não funcionar no Foundry real,
 * só este arquivo precisa ser trocado; a janela e a lógica pura continuam iguais.
 */
import {
  CHASE_COMBAT_TYPE,
  CHASE_COMBATANT_TYPE,
  chaseAccess,
  initialChaseState,
  startState,
  endState,
} from '../rolls/chase.js';

/* global getDocumentClass */

const t = (key) => game.i18n.localize(key);

/** A perseguição existente (nesta versão só pode haver uma por vez) ou `null`. */
export function findChase() {
  return game.combats.find((combat) => combat.type === CHASE_COMBAT_TYPE) ?? null;
}

/** Ids dos atores que já participam da perseguição. */
export function participantActorIds(chase) {
  return chase.combatants.map((combatant) => combatant.actorId).filter(Boolean);
}

/** O personagem (ator) participa desta perseguição? */
export function actorParticipates(chase, actor) {
  const id = actor?.isToken ? actor.baseActor?.id : actor?.id;
  return Boolean(id) && participantActorIds(chase).includes(id);
}

/** O usuário atual é dono de algum personagem que participa da perseguição? */
export function userOwnsParticipant(chase) {
  return chase.combatants.some((combatant) => combatant.actor?.isOwner);
}

/** Dados prontos para os templates: estado e lista de participantes (sem documentos do Foundry). */
export function chaseView(chase) {
  return {
    id: chase.id,
    ativa: chase.system.ativa,
    rodadaAtual: chase.system.rodadaAtual,
    participantes: chase.combatants.map((combatant) => ({
      id: combatant.id,
      name: combatant.name,
      img: combatant.img,
    })),
  };
}

/** Acesso do usuário atual à perseguição existente (ou a não haver nenhuma). */
export function currentAccess(chase = findChase()) {
  return chaseAccess({
    isGM: game.user.isGM,
    chase: chase ? { ativa: chase.system.ativa } : null,
    isParticipant: chase ? userOwnsParticipant(chase) : false,
  });
}

/** Dados do cartão da ficha de um personagem, ou `null` se o cartão não deve aparecer. */
export function chaseCardFor(actor) {
  const chase = findChase();
  if (!chase) return null;
  const access = chaseAccess({
    isGM: game.user.isGM,
    chase: { ativa: chase.system.ativa },
    isParticipant: actorParticipates(chase, actor),
  });
  if (!access.showCard) return null;
  return { ativa: chase.system.ativa, rodadaAtual: chase.system.rodadaAtual };
}

/** Cria a perseguição em preparação. Só o mestre cria; só pode existir uma. */
export async function createChase() {
  if (!game.user.isGM) return null;
  if (findChase()) {
    ui.notifications.warn(t('DESORDEM.Perseguicao.Erro.JaExiste'));
    return null;
  }
  const Combat = getDocumentClass('Combat');
  const data = { type: CHASE_COMBAT_TYPE, system: initialChaseState() };
  try {
    // Sem cena: a perseguição funciona sem mapa nem tokens.
    return await Combat.create({ ...data, scene: null });
  } catch (error) {
    console.warn(
      'desordem-normal | Combat sem cena não foi aceito; criando com a cena padrão.',
      error,
    );
    return Combat.create(data);
  }
}

/** Inicia a perseguição (rodada 1). */
export async function startChase(chase) {
  if (!game.user.isGM) return;
  await chase.update({ system: startState() });
}

/** Encerra a perseguição: volta à preparação, mantendo os participantes. */
export async function endChase(chase) {
  if (!game.user.isGM) return;
  await chase.update({ system: endState() });
}

/** Apaga a perseguição inteira. */
export async function deleteChase(chase) {
  if (!game.user.isGM) return;
  await chase.delete();
}

/** Adiciona personagens à perseguição, com ou sem token. */
export async function addParticipants(chase, actors) {
  if (!game.user.isGM || actors.length === 0) return;
  await chase.createEmbeddedDocuments(
    'Combatant',
    actors.map((actor) => ({ type: CHASE_COMBATANT_TYPE, actorId: actor.id })),
  );
}

/** Tira um participante da perseguição. */
export async function removeParticipant(chase, combatantId) {
  if (!game.user.isGM) return;
  await chase.deleteEmbeddedDocuments('Combatant', [combatantId]);
}
