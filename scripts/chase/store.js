/**
 * Adaptador fino entre a lógica da perseguição e o Foundry: é aqui que o estado é lido e gravado
 * (hoje num Combat do tipo `perseguicao`). Se o subtipo de Combat não funcionar no Foundry real,
 * só este arquivo precisa ser trocado; a janela e a lógica pura continuam iguais.
 */
import { SYSTEM_ID } from '../config.js';
import {
  CHASE_COMBAT_TYPE,
  CHASE_COMBATANT_TYPE,
  adjustField,
  advanceBlockReason,
  chaseAccess,
  effortDiceCount,
  hasActed,
  initialChaseState,
  isAdjustableField,
  nextRoundState,
  normalizeChaseDt,
  participantReset,
  participantStart,
  startState,
  endState,
} from '../rolls/chase.js';

/* global getDocumentClass */

/** Canal de socket do sistema (o mesmo das outras partes; cada uma filtra pela `action`). */
export const SOCKET = `system.${SYSTEM_ID}`;

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

/** Faces do dado de Vigor de um ator (o fôlego inicial depende dele). */
const vigorOf = (actor) => actor?.system?.pericias?.vigor ?? 4;

/** Dados de um participante prontos para os templates. */
function participantView(chase, combatant) {
  const { ativa, rodadaAtual } = chase.system;
  const participant = combatant.system;
  const acted = ativa && hasActed(participant, rodadaAtual);
  return {
    id: combatant.id,
    name: combatant.name,
    img: combatant.img,
    pa: participant.pa,
    folego: participant.folego,
    agiu: acted,
    // Só quem é dono do personagem (e o mestre) marca ou desmarca "já agiu"
    podeMarcar: Boolean(combatant.actor?.isOwner),
  };
}

/** Dados prontos para os templates: estado e lista de participantes (sem documentos do Foundry). */
export function chaseView(chase) {
  return {
    id: chase.id,
    ativa: chase.system.ativa,
    rodadaAtual: chase.system.rodadaAtual,
    dt: chase.system.dt,
    participantes: chase.combatants.map((combatant) => participantView(chase, combatant)),
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
  const id = actor.isToken ? actor.baseActor?.id : actor.id;
  const combatant = chase.combatants.find((entry) => entry.actorId === id);
  const view = combatant ? participantView(chase, combatant) : null;
  return {
    ativa: chase.system.ativa,
    rodadaAtual: chase.system.rodadaAtual,
    combatantId: view?.id ?? '',
    pa: view?.pa ?? 0,
    folego: view?.folego ?? 0,
    agiu: view?.agiu ?? false,
  };
}

/**
 * Dados para a janela pré-teste oferecer "usar como teste de avanço", ou `null` se a opção não
 * deve aparecer (sem perseguição em andamento, personagem fora dela ou sem permissão).
 * `blocked` diz por que o teste ainda não pode valer como avanço (já agiu, perícia já usada).
 */
export function chaseInfoFor(actor, skillKey) {
  const chase = findChase();
  if (!chase?.system.ativa || !actor?.isOwner) return null;
  const id = actor.isToken ? actor.baseActor?.id : actor.id;
  const combatant = chase.combatants.find((entry) => entry.actorId === id);
  if (!combatant) return null;
  const participant = combatant.system;
  return {
    combatantId: combatant.id,
    folego: participant.folego,
    effortDice: effortDiceCount(participant.esforcoExtra),
    dt: chase.system.dt,
    blocked: advanceBlockReason({
      ativa: true,
      rodadaAtual: chase.system.rodadaAtual,
      participant,
      skillKey,
    }),
  };
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

/**
 * Inicia a perseguição (rodada 1). Cada participante começa com 0 PA e o fôlego do seu Vigor.
 * Os participantes são gravados antes, para a janela já abrir com os valores certos.
 */
export async function startChase(chase) {
  if (!game.user.isGM) return;
  const updates = chase.combatants.map((combatant) => ({
    _id: combatant.id,
    system: participantStart(vigorOf(combatant.actor)),
  }));
  if (updates.length) await chase.updateEmbeddedDocuments('Combatant', updates);
  await chase.update({ system: startState() });
}

/** Encerra a perseguição: volta à preparação, mantendo os participantes mas zerando tudo. */
export async function endChase(chase) {
  if (!game.user.isGM) return;
  const updates = chase.combatants.map((combatant) => ({
    _id: combatant.id,
    system: participantReset(),
  }));
  if (updates.length) await chase.updateEmbeddedDocuments('Combatant', updates);
  await chase.update({ system: endState() });
}

/** Muda a DT padrão do avanço desta perseguição (só o mestre). */
export async function setChaseDt(chase, dt) {
  if (!game.user.isGM) return;
  await chase.update({ system: { dt: normalizeChaseDt(dt) } });
}

/** Passa para a próxima rodada. */
export async function nextRound(chase) {
  if (!game.user.isGM || !chase.system.ativa) return;
  await chase.update({ system: nextRoundState(chase.system.rodadaAtual) });
}

/**
 * Marca ou desmarca "já agiu" de um participante (o teste de avanço também marca). Marcar grava a
 * rodada atual; desmarcar volta a 0, liberando um novo avanço na mesma rodada.
 */
export async function setActed(chase, combatantId, acted) {
  const combatant = chase.combatants.get(combatantId);
  if (!chase.system.ativa || !combatant?.actor?.isOwner) return;
  await updateParticipant(combatant, { ultimaRodada: acted ? chase.system.rodadaAtual : 0 });
}

/** Ajuste manual (mestre) de PA ou fôlego de um participante. */
export async function adjustParticipant(chase, combatantId, field, delta) {
  if (!game.user.isGM || !isAdjustableField(field)) return;
  const combatant = chase.combatants.get(combatantId);
  if (!combatant) return;
  const next = adjustField(field, combatant.system[field], delta);
  await combatant.update({ system: { [field]: next } });
}

/**
 * Grava a situação de um participante. Quem pode editar o documento grava direto; os demais pedem
 * ao mestre ativo por socket (que confere se o pedido vem de um dono do personagem) e não
 * recebem resposta: a janela se atualiza pelo hook de `updateCombatant`.
 */
export async function updateParticipant(combatant, patch) {
  if (combatant.canUserModify(game.user, 'update')) {
    await combatant.update({ system: patch });
    return;
  }
  game.socket.emit(SOCKET, {
    action: 'chaseParticipant',
    combatId: combatant.parent.id,
    combatantId: combatant.id,
    patch,
  });
}

/** Apaga a perseguição inteira. */
export async function deleteChase(chase) {
  if (!game.user.isGM) return;
  await chase.delete();
}

/** Adiciona personagens à perseguição, com ou sem token. */
export async function addParticipants(chase, actors) {
  if (!game.user.isGM || actors.length === 0) return;
  // Com a perseguição em andamento, quem entra já recebe o fôlego do seu Vigor.
  const started = chase.system.ativa;
  await chase.createEmbeddedDocuments(
    'Combatant',
    actors.map((actor) => ({
      type: CHASE_COMBATANT_TYPE,
      actorId: actor.id,
      ...(started ? { system: participantStart(vigorOf(actor)) } : {}),
    })),
  );
}

/** Tira um participante da perseguição. */
export async function removeParticipant(chase, combatantId) {
  if (!game.user.isGM) return;
  await chase.deleteEmbeddedDocuments('Combatant', [combatantId]);
}
