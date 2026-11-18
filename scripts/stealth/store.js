/**
 * Adaptador entre a lógica da furtividade e o Foundry: lê e grava o estado da cena (um Combat do
 * tipo `furtividade`) e posta os avisos no chat. A janela (app.js) e a ficha só usam estas funções.
 */
import { SYSTEM_ID } from '../config.js';
import { addableActors, chaseAccess } from '../rolls/chase.js';
import {
  STEALTH_COMBAT_TYPE,
  STEALTH_COMBATANT_TYPE,
  applyHideOp,
  canOfferHideTest,
  distractRecipients,
  hideDiceView,
  hideOpMessage,
  hideOpPatch,
  initialStealthState,
  sanitizeHideOp,
  stealthEndState,
  stealthNextRound,
  stealthParticipantReset,
  normalizeUses,
  stealthActionDt,
  stealthOptions,
  stealthRoundChange,
  stealthStartState,
} from '../rolls/stealth.js';

/* global getDocumentClass */

/** Canal de socket do sistema (o mesmo das outras partes; cada uma filtra pela `action`). */
export const SOCKET = `system.${SYSTEM_ID}`;

/** Nome da ação de socket dos dados de esconderijo. */
export const HIDE_SOCKET_ACTION = 'stealthHideDice';

/** Nome da ação de socket do contador de esconder-se (ajuste à mão na aba Condição). */
export const USES_SOCKET_ACTION = 'stealthHideUses';

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const renderTemplate = (path, data) => foundry.applications.handlebars.renderTemplate(path, data);

/**
 * Participantes cujos dados o mestre revelou NESTE cliente (ids de Combatant). Fica só na memória
 * do navegador do mestre: recarregar a página esconde tudo de novo.
 */
const revealed = new Set();

/** O mestre revelou os dados deste participante? */
export function isRevealed(combatantId) {
  return revealed.has(combatantId);
}

/** Esconde de novo os dados de um participante (ou de todos, sem id). Não posta nada. */
export function hideRevealed(combatantId) {
  if (combatantId) revealed.delete(combatantId);
  else revealed.clear();
}

/** A cena de furtividade existente (só pode haver uma por vez) ou `null`. */
export function findStealth() {
  return game.combats.find((combat) => combat.type === STEALTH_COMBAT_TYPE) ?? null;
}

/** Id do ator "de verdade" (num token sem vínculo, o ator base). */
const actorIdOf = (actor) => (actor?.isToken ? actor.baseActor?.id : actor?.id);

/** Participante (Combatant) de um personagem nesta cena, ou `undefined`. */
export function combatantOf(stealth, actor) {
  const id = actorIdOf(actor);
  return id ? stealth.combatants.find((combatant) => combatant.actorId === id) : undefined;
}

/** O usuário atual é dono de algum personagem que participa da cena? */
function userOwnsParticipant(stealth) {
  return stealth.combatants.some((combatant) => combatant.actor?.isOwner);
}

/** Acesso do usuário atual à cena existente (as mesmas regras da perseguição). */
export function currentStealthAccess(stealth = findStealth()) {
  return chaseAccess({
    isGM: game.user.isGM,
    chase: stealth ? { ativa: stealth.system.ativa } : null,
    isParticipant: stealth ? userOwnsParticipant(stealth) : false,
  });
}

/**
 * Rótulo de cada situação. Chave montada em JS (o teste de templates não a confere): as quatro
 * situações de `hideStatus` precisam existir em DESORDEM.Furtividade.Status.
 */
const statusLabel = (status) => t(`DESORDEM.Furtividade.Status.${status}`);

/** Dados de um participante prontos para os templates. */
function participantView(stealth, combatant) {
  const view = hideDiceView({
    ativa: stealth.system.ativa,
    escondeu: combatant.system.escondeu,
    esconderijo: combatant.system.esconderijo,
    isGM: game.user.isGM,
    isOwner: Boolean(combatant.actor?.isOwner),
    revealed: isRevealed(combatant.id),
  });
  return {
    id: combatant.id,
    name: combatant.name,
    img: combatant.img,
    revealed: isRevealed(combatant.id),
    ...view,
    statusLabel: statusLabel(view.status),
  };
}

/** Dados prontos para a janela: estado da cena e participantes (sem documentos do Foundry). */
export function stealthView(stealth) {
  return {
    id: stealth.id,
    ativa: stealth.system.ativa,
    rodadaAtual: stealth.system.rodadaAtual,
    // Distrair: usos na cena (de qualquer personagem) e a DT do próximo uso
    distrairUsos: normalizeUses(stealth.system.distrairUsos),
    distrairDt: stealthActionDt(stealth.system.distrairUsos),
    participantes: stealth.combatants.map((combatant) => participantView(stealth, combatant)),
  };
}

/**
 * Dados do cartão da ficha, ou `null` se o cartão não deve aparecer. O cartão só mostra a
 * quantidade de dados e a situação; os valores ficam na janela.
 */
export function stealthCardFor(actor) {
  const stealth = findStealth();
  if (!stealth) return null;
  const combatant = combatantOf(stealth, actor);
  const access = chaseAccess({
    isGM: game.user.isGM,
    chase: { ativa: stealth.system.ativa },
    isParticipant: Boolean(combatant),
  });
  if (!access.showCard || !combatant) return null;
  const view = participantView(stealth, combatant);
  return {
    ativa: stealth.system.ativa,
    rodadaAtual: stealth.system.rodadaAtual,
    count: view.count,
    status: view.status,
    statusLabel: view.statusLabel,
    // Aba Condição: usos de esconder-se (o dono e o mestre ajustam à mão) e a DT do próximo uso
    combatantId: combatant.id,
    esconderUsos: normalizeUses(combatant.system.esconderUsos),
    esconderDt: stealthActionDt(combatant.system.esconderUsos),
    podeAjustar: Boolean(combatant.actor?.isOwner),
  };
}

/** Cria a cena em preparação. Só o mestre cria; só pode existir uma. */
export async function createStealth() {
  if (!game.user.isGM) return null;
  if (findStealth()) {
    ui.notifications.warn(t('DESORDEM.Furtividade.Erro.JaExiste'));
    return null;
  }
  const Combat = getDocumentClass('Combat');
  const data = { type: STEALTH_COMBAT_TYPE, system: initialStealthState() };
  try {
    // Sem cena do mapa: a furtividade funciona sem tokens
    return await Combat.create({ ...data, scene: null });
  } catch (error) {
    console.warn('desordem-normal | Combat sem cena não foi aceito; criando com a padrão.', error);
    return Combat.create(data);
  }
}

/** Zera os dados de esconderijo de todos os participantes. */
async function resetParticipants(stealth) {
  const updates = stealth.combatants.map((combatant) => ({
    _id: combatant.id,
    system: stealthParticipantReset(),
  }));
  if (updates.length) await stealth.updateEmbeddedDocuments('Combatant', updates);
}

/** Inicia a cena (rodada 1). Cada participante começa sem dados, aguardando o esconderijo. */
export async function startStealth(stealth) {
  if (!game.user.isGM) return;
  await resetParticipants(stealth);
  hideRevealed();
  await stealth.update({ system: stealthStartState() });
}

/** Encerra a cena: volta à preparação, mantendo os participantes e zerando os dados. */
export async function endStealth(stealth) {
  if (!game.user.isGM) return;
  await resetParticipants(stealth);
  hideRevealed();
  await stealth.update({ system: stealthEndState() });
}

/** Apaga a cena inteira. */
export async function deleteStealth(stealth) {
  if (!game.user.isGM) return;
  hideRevealed();
  await stealth.delete();
}

/** Passa para a próxima rodada (só o mestre, com a cena em andamento). */
export async function nextStealthRound(stealth) {
  if (!game.user.isGM || !stealth.system.ativa) return;
  await stealth.update({ system: stealthNextRound(stealth.system.rodadaAtual) });
}

/**
 * Muda a rodada na mão (só o mestre), pelo valor digitado (`raw`) ou pelos botões (`delta`).
 * @returns {Promise<boolean>} `true` se o valor era válido.
 */
export async function setStealthRound(stealth, change) {
  if (!game.user.isGM || !stealth.system.ativa) return false;
  const result = stealthRoundChange(stealth.system.rodadaAtual, change);
  if (!result.valid) return false;
  if (result.value !== stealth.system.rodadaAtual) {
    await stealth.update({ system: { rodadaAtual: result.value } });
  }
  return true;
}

/** Personagens que ainda podem entrar na cena (para a lista de adicionar). */
export function stealthCandidates(stealth) {
  return addableActors(
    game.actors
      .filter((actor) => actor.type === 'personagem')
      .map((actor) => ({ id: actor.id, name: actor.name })),
    stealth.combatants.map((combatant) => combatant.actorId).filter(Boolean),
  );
}

/** Adiciona personagens à cena (com ou sem token). */
export async function addStealthParticipants(stealth, actors) {
  if (!game.user.isGM || actors.length === 0) return;
  await stealth.createEmbeddedDocuments(
    'Combatant',
    actors.map((actor) => ({ type: STEALTH_COMBATANT_TYPE, actorId: actor.id })),
  );
}

/** Tira um participante da cena. */
export async function removeStealthParticipant(stealth, combatantId) {
  if (!game.user.isGM) return;
  revealed.delete(combatantId);
  await stealth.deleteEmbeddedDocuments('Combatant', [combatantId]);
}

/**
 * Dados para a janela pré-teste oferecer «usar como teste de esconderijo», ou `null` se a opção não
 * deve aparecer (sem cena em andamento, personagem fora dela, sem permissão ou já escondido).
 */
export function hideTestInfoFor(actor) {
  const stealth = findStealth();
  if (!stealth) return null;
  const combatant = combatantOf(stealth, actor);
  const offer = canOfferHideTest({
    ativa: stealth.system.ativa,
    isParticipant: Boolean(combatant),
    isOwner: Boolean(actor?.isOwner),
    escondeu: Boolean(combatant?.system.escondeu),
  });
  return offer ? { combatantId: combatant.id } : null;
}

/**
 * O que a seção de furtividade da janela pré-teste oferece a este personagem (teste de
 * esconderijo, esconder-se, distrair), com o id do participante; `null` se nada.
 */
export function stealthInfoFor(actor) {
  const stealth = findStealth();
  if (!stealth) return null;
  const combatant = combatantOf(stealth, actor);
  const participants = stealthView(stealth).participantes;
  const options = stealthOptions({
    ativa: stealth.system.ativa,
    isParticipant: Boolean(combatant),
    isOwner: Boolean(actor?.isOwner),
    escondeu: Boolean(combatant?.system.escondeu),
    esconderUsos: combatant?.system.esconderUsos,
    distrairUsos: stealth.system.distrairUsos,
    recipients: combatant ? distractRecipients(participants, combatant.id) : [],
  });
  return options ? { ...options, combatantId: combatant.id } : null;
}

/** Muda o contador de distrair da cena (só o mestre, pelos botões −/+ da janela). */
export async function adjustDistractUses(stealth, delta) {
  if (!game.user.isGM || !stealth?.system.ativa) return;
  const next = normalizeUses(normalizeUses(stealth.system.distrairUsos) + Number(delta));
  await stealth.update({ system: { distrairUsos: next } });
}

/**
 * Muda o contador de esconder-se de um participante (o dono ou o mestre, pela aba Condição).
 * Quem não pode editar o participante pede ao mestre ativo pelo socket (só ids e ±1).
 */
export async function adjustHideUses(combatant, delta) {
  if (!combatant?.parent?.system.ativa || !combatant.actor?.isOwner) return;
  const step = Math.sign(Number(delta));
  if (!step) return;
  if (combatant.canUserModify(game.user, 'update')) {
    const next = normalizeUses(normalizeUses(combatant.system.esconderUsos) + step);
    await combatant.update({ system: { esconderUsos: next } });
    return;
  }
  if (!game.users.activeGM) {
    ui.notifications.warn(t('DESORDEM.Furtividade.Erro.SemMestre'));
    return;
  }
  game.socket.emit(SOCKET, {
    action: USES_SOCKET_ACTION,
    combatId: combatant.parent.id,
    combatantId: combatant.id,
    delta: step,
  });
}

/** Socket (só no mestre ativo): ajuste do contador de esconder-se pedido por um dono. */
export async function handleUsesSocket(data, userId) {
  const stealth = game.combats.get(data?.combatId);
  if (stealth?.type !== STEALTH_COMBAT_TYPE || !stealth.system.ativa) return;
  const combatant = stealth.combatants.get(data.combatantId);
  const requester = game.users.get(userId);
  if (!combatant?.actor || !requester) return;
  if (!combatant.actor.testUserPermission(requester, 'OWNER')) return;
  const step = Math.sign(Number(data.delta)) || 0;
  if (!step) return;
  const next = normalizeUses(normalizeUses(combatant.system.esconderUsos) + step);
  await combatant.update({ system: { esconderUsos: next } });
}

/**
 * O mestre zera o esconderijo de um participante (para refazer o teste, por exemplo se a perícia
 * foi marcada errada) e avisa no chat. A confirmação é pedida pela janela.
 */
export async function resetHide(combatant) {
  if (!game.user.isGM || !combatant?.parent?.system.ativa) return;
  await combatant.update({ system: stealthParticipantReset() });
  await postStealthNotice({
    titulo: t('DESORDEM.Furtividade.Chat.Titulo'),
    texto: t('DESORDEM.Furtividade.Chat.zerou', { nome: combatant.name }),
  });
}

/** Posta um aviso público da cena no chat (sem modo de rolagem: todos veem). */
export async function postStealthNotice({ actor, titulo, texto }) {
  const content = await renderTemplate(`systems/${SYSTEM_ID}/templates/chat/furtividade.hbs`, {
    titulo,
    texto,
  });
  const speaker = actor ? ChatMessage.getSpeaker({ actor }) : ChatMessage.getSpeaker();
  return ChatMessage.create({ speaker, content });
}

/**
 * Grava uma operação nos dados de esconderijo e posta o aviso (só quantidades, nunca valores).
 * Roda no cliente de quem pode gravar: o próprio dono ou o mestre ativo (pelo socket).
 * A operação é conferida de novo aqui; a lista atual vem do documento, não de quem pediu.
 * @returns {Promise<boolean>} `true` se gravou.
 */
export async function commitHideOp(combatant, rawOp) {
  const op = sanitizeHideOp(rawOp);
  const stealth = combatant?.parent;
  if (!op || !stealth?.system.ativa) return false;
  const result = applyHideOp(combatant.system.esconderijo, op);
  if (!result.valid) return false;
  await combatant.update({
    system: hideOpPatch(op, result.list, combatant.system.escondeu),
  });
  const kind = hideOpMessage(op, result.list.length);
  if (kind) {
    const nome = combatant.name;
    await postStealthNotice({
      actor: combatant.actor,
      titulo: t('DESORDEM.Furtividade.Chat.Titulo'),
      texto: t(`DESORDEM.Furtividade.Chat.${kind}`, { nome, n: result.list.length }),
    });
  }
  return true;
}

/**
 * Pede uma operação nos dados de esconderijo. Quem pode editar o participante grava direto; o
 * jogador sem essa permissão pede ao mestre ativo pelo socket (que confere o dono do personagem).
 * O mestre só mexe nos dados que revelou.
 */
export async function requestHideOp(combatant, op) {
  if (!combatant?.parent?.system.ativa) return;
  const isOwner = Boolean(combatant.actor?.isOwner);
  if (game.user.isGM ? !isRevealed(combatant.id) : !isOwner) return;
  if (combatant.canUserModify(game.user, 'update')) {
    const ok = await commitHideOp(combatant, op);
    if (!ok) ui.notifications.warn(t('DESORDEM.Furtividade.Erro.Operacao'));
    return;
  }
  if (!game.users.activeGM) {
    ui.notifications.warn(t('DESORDEM.Furtividade.Erro.SemMestre'));
    return;
  }
  game.socket.emit(SOCKET, {
    action: HIDE_SOCKET_ACTION,
    combatId: combatant.parent.id,
    combatantId: combatant.id,
    op: sanitizeHideOp(op),
  });
}

/**
 * Atende o pedido de um jogador (só no cliente do mestre ativo). Confere que o pedido vem de um
 * dono do personagem; a operação é refeita e conferida em `commitHideOp`.
 */
export async function handleHideSocket(data, userId) {
  const stealth = game.combats.get(data?.combatId);
  if (stealth?.type !== STEALTH_COMBAT_TYPE) return;
  const combatant = stealth.combatants.get(data.combatantId);
  const requester = game.users.get(userId);
  if (!combatant?.actor || !requester) return;
  if (!combatant.actor.testUserPermission(requester, 'OWNER')) return;
  await commitHideOp(combatant, data.op);
}

/**
 * O mestre revela (neste cliente) os dados de um participante e avisa todos no chat. A
 * confirmação é pedida pela janela antes de chamar esta função.
 */
export async function revealHideDice(combatant) {
  if (!game.user.isGM || !combatant) return;
  revealed.add(combatant.id);
  await postStealthNotice({
    titulo: t('DESORDEM.Furtividade.Chat.Titulo'),
    texto: t('DESORDEM.Furtividade.Chat.revelou', {
      mestre: game.user.name,
      nome: combatant.name,
    }),
  });
}
