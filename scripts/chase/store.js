/**
 * Adaptador fino entre a lógica da perseguição e o Foundry: é aqui que o estado é lido e gravado
 * (hoje num Combat do tipo `perseguicao`). Se o subtipo de Combat não funcionar no Foundry real,
 * só este arquivo precisa ser trocado; a janela e a lógica pura continuam iguais.
 */
import {
  CHASE_COMBAT_TYPE,
  CHASE_COMBATANT_TYPE,
  addCheckpoint,
  adjustField,
  adjustRound,
  advanceBlockReason,
  advanceWarning,
  breathBlockReason,
  canEditChaseNumbers,
  chaseAccess,
  checkpointsView,
  effortDiceCount,
  hasActed,
  initialChaseState,
  isAdjustableField,
  nextRoundState,
  normalizeChaseDt,
  participantBadges,
  parseTypedValue,
  participantReset,
  participantStart,
  removeCheckpoint,
  startState,
  endState,
} from '../rolls/chase.js';
import { SOCKET } from '../shared/socket.js';
import {
  createEncounter,
  findEncounter,
  updateAllParticipants,
  userOwnsParticipant,
  worldActorId,
} from '../shared/encounter.js';

/** A perseguição existente (nesta versão só pode haver uma por vez) ou `null`. */
export const findChase = () => findEncounter(CHASE_COMBAT_TYPE);

/** Ids dos atores que já participam da perseguição. */
export function participantActorIds(chase) {
  return chase.combatants.map((combatant) => combatant.actorId).filter(Boolean);
}

/** O personagem (ator) participa desta perseguição? */
export function actorParticipates(chase, actor) {
  const id = worldActorId(actor);
  return Boolean(id) && participantActorIds(chase).includes(id);
}

/** O usuário atual é dono de algum personagem que participa da perseguição? */
export { userOwnsParticipant };

/** Faces do dado de Vigor de um ator (o fôlego inicial depende dele). */
const vigorOf = (actor) => actor?.system?.pericias?.vigor ?? 4;

/** O usuário atual pode digitar ou ajustar PA e fôlego deste participante? */
export function canEditParticipant(combatant) {
  return canEditChaseNumbers({
    isGM: game.user.isGM,
    role: game.user.role,
    isOwner: Boolean(combatant?.actor?.isOwner),
  });
}

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
    // PA e fôlego: o mestre edita todos; só o jogador confiável edita o próprio personagem
    podeEditar: canEditParticipant(combatant),
    // Selos: «abaixo do alvo» (só o mestre vê) e «chegou» (o jogador só com o PA final revelado)
    ...participantBadges({
      pontos: chase.system.pontos,
      rodadaAtual,
      pa: participant.pa,
      isGM: game.user.isGM,
      revelarFinal: chase.system.revelarFinal,
    }),
  };
}

/** Dados prontos para os templates: estado e lista de participantes (sem documentos do Foundry). */
export function chaseView(chase) {
  return {
    id: chase.id,
    ativa: chase.system.ativa,
    rodadaAtual: chase.system.rodadaAtual,
    dt: chase.system.dt,
    // O que a pessoa pode ver dos pontos de checagem (o jogador nunca vê a lista inteira)
    pontos: checkpointsView({
      pontos: chase.system.pontos,
      rodadaAtual: chase.system.rodadaAtual,
      revelarProximo: chase.system.revelarProximo,
      revelarFinal: chase.system.revelarFinal,
      isGM: game.user.isGM,
    }),
    revelarProximo: chase.system.revelarProximo,
    revelarFinal: chase.system.revelarFinal,
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
  const id = worldActorId(actor);
  const combatant = chase.combatants.find((entry) => entry.actorId === id);
  const view = combatant ? participantView(chase, combatant) : null;
  return {
    ativa: chase.system.ativa,
    rodadaAtual: chase.system.rodadaAtual,
    combatantId: view?.id ?? '',
    pa: view?.pa ?? 0,
    folego: view?.folego ?? 0,
    agiu: view?.agiu ?? false,
    // O botão «recuperar fôlego» só aparece para o dono (ou o mestre) que ainda não agiu na rodada
    podeRecuperar: Boolean(
      combatant?.actor?.isOwner &&
      !breathBlockReason({
        ativa: chase.system.ativa,
        rodadaAtual: chase.system.rodadaAtual,
        participant: combatant.system,
      }),
    ),
  };
}

/**
 * Dados para a janela pré-teste oferecer "usar como teste de avanço", ou `null` se a opção não
 * deve aparecer (sem perseguição em andamento, personagem fora dela ou sem permissão).
 * `blocked` diz por que o teste ainda não pode valer como avanço (só o `agiu`); `warning` é um
 * lembrete que não bloqueia (perícia que não é Atletismo e já foi usada).
 */
export function chaseInfoFor(actor, skillKey) {
  const chase = findChase();
  if (!chase?.system.ativa || !actor?.isOwner) return null;
  const id = worldActorId(actor);
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
    }),
    warning: advanceWarning({ participant, skillKey }),
  };
}

/** Cria a perseguição em preparação. Só o mestre cria; só pode existir uma. */
export function createChase() {
  return createEncounter(
    CHASE_COMBAT_TYPE,
    initialChaseState(),
    'DESORDEM.Perseguicao.Erro.JaExiste',
  );
}

/**
 * Inicia a perseguição (rodada 1). Cada participante começa com 0 PA e o fôlego do seu Vigor.
 * Os participantes são gravados antes, para a janela já abrir com os valores certos.
 */
export async function startChase(chase) {
  if (!game.user.isGM) return;
  await updateAllParticipants(chase, (combatant) => participantStart(vigorOf(combatant.actor)));
  await chase.update({ system: startState() });
}

/** Encerra a perseguição: volta à preparação, mantendo os participantes mas zerando tudo. */
export async function endChase(chase) {
  if (!game.user.isGM) return;
  await updateAllParticipants(chase, () => participantReset());
  await chase.update({ system: endState() });
}

/**
 * Muda a DT padrão do avanço desta perseguição (só o mestre). Aceita o valor já tratado (botões
 * −/+) ou o que foi digitado; a DT sempre fica entre 1 e 40.
 */
export async function setChaseDt(chase, dt) {
  if (!game.user.isGM) return;
  await chase.update({ system: { dt: normalizeChaseDt(dt) } });
}

/**
 * Acrescenta (ou troca) um ponto de checagem. Só o mestre. Devolve `false` se o valor não vale.
 * @param {Combat} chase
 * @param {string|number} round Rodada do ponto.
 * @param {string|number} pa PA que se espera ter nessa rodada.
 */
export async function setCheckpoint(chase, round, pa) {
  if (!game.user.isGM) return false;
  const result = addCheckpoint(chase.system.pontos, round, pa);
  if (!result.valid) return false;
  await chase.update({ system: { pontos: result.list } });
  return true;
}

/** Tira o ponto de checagem de uma rodada (só o mestre). */
export async function deleteCheckpoint(chase, round) {
  if (!game.user.isGM) return;
  await chase.update({ system: { pontos: removeCheckpoint(chase.system.pontos, round) } });
}

/** Apaga todos os pontos de checagem (só o mestre). */
export async function clearCheckpoints(chase) {
  if (!game.user.isGM) return;
  await chase.update({ system: { pontos: [] } });
}

/** Liga ou desliga a revelação do próximo PA alvo ou do PA final aos jogadores (só o mestre). */
export async function toggleReveal(chase, field) {
  if (!game.user.isGM || !['revelarProximo', 'revelarFinal'].includes(field)) return;
  await chase.update({ system: { [field]: !chase.system[field] } });
}

/**
 * Muda a rodada atual na mão (só o mestre, com a perseguição em andamento), pelo valor digitado ou
 * pelos botões −/+ (`delta`). Não mexe em PA, fôlego nem no «já agiu». Valor inválido não grava.
 * @param {Combat} chase
 * @param {{raw?: string|number, delta?: number}} change `raw` é o texto digitado; `delta` é ±1.
 * @returns {Promise<boolean>} `true` se gravou um valor válido.
 */
export async function setRound(chase, { raw, delta } = {}) {
  if (!game.user.isGM || !chase.system.ativa) return false;
  let next;
  if (delta !== undefined) {
    next = adjustRound(chase.system.rodadaAtual, delta);
  } else {
    const typed = parseTypedValue('rodada', raw);
    if (!typed.valid) return false;
    next = typed.value;
  }
  if (next !== chase.system.rodadaAtual) await chase.update({ system: { rodadaAtual: next } });
  return true;
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

/**
 * Ajuste manual de PA ou fôlego pelos botões −/+. O mestre ajusta qualquer participante; o jogador
 * confiável, só o próprio personagem.
 */
export async function adjustParticipant(chase, combatantId, field, delta) {
  if (!isAdjustableField(field)) return;
  const combatant = chase.combatants.get(combatantId);
  if (!combatant || !canEditParticipant(combatant)) return;
  const next = adjustField(field, combatant.system[field], delta);
  await updateParticipant(combatant, { [field]: next });
}

/**
 * Grava PA ou fôlego digitados na janela (mesma regra de quem pode editar dos botões). Se o valor
 * digitado não vale (vazio, texto), não grava nada e devolve `false`, para a janela devolver o
 * campo ao valor anterior.
 * @returns {Promise<boolean>} `true` se gravou um valor válido.
 */
export async function setParticipantField(chase, combatantId, field, raw) {
  if (!isAdjustableField(field)) return false;
  const combatant = chase.combatants.get(combatantId);
  if (!combatant || !canEditParticipant(combatant)) return false;
  const typed = parseTypedValue(field, raw);
  if (!typed.valid) return false;
  if (typed.value !== combatant.system[field]) {
    await updateParticipant(combatant, { [field]: typed.value });
  }
  return true;
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
