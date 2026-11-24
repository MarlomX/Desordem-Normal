/* global document */
/**
 * Teste oposto: rolar cada lado, cancelar, repetir, o dano e os botões do cartão do chat.
 * Parte de `opposed-chat.js` (v0.28.8).
 */
import { SYSTEM_ID } from '../../config.js';
import { postMessage, rollTest, skillTestOptions } from '../../rolls/chat.js';
import { askRollChoices } from '../../rolls/roll-dialog-chat.js';
import { resolveWithValues } from '../../rolls/abilities.js';
import {
  actorResources,
  firstEffect,
  resourceChanges,
  roundUseUpdate,
  triggerUpdates,
  usableThisRound,
} from '../../rolls/ability-effects-actor.js';
import {
  afterWeaponAttack,
  ammoFor,
  canAttackWith,
  spendAmmo,
} from '../../rolls/equipment-chat.js';
import { weaponTestKind } from '../../rolls/ability-effects.js';
import { announceGains } from '../../rolls/abilities-chat.js';
import { damageActor } from '../../rolls/health.js';
import { askDamage } from '../../rolls/damage-dialog.js';
import { guardButtons } from '../../rolls/guardian-chat.js';
import {
  canCancel,
  canRollSide,
  cardType,
  damageTargetUuid,
  markDamage,
  repeatState,
} from '../../rolls/opposed-card.js';
import { t } from '../../shared/i18n.js';
import { SOCKET, canWriteOrAsk } from '../../shared/socket.js';
import { candidateActors, cardState, otherSide, renderCard } from './common.js';
import { inFlight, pickActor, pickChoice } from './propose.js';

/**
 * Rola um lado do cartão: escolhe o ator (lado em aberto) e o que ele usa, passa pela janela
 * pré-teste e publica o teste comum com a marca do cartão. Ataque: perícia da arma; Defender-se:
 * a perícia + d6. O companheiro animal é uma opção da janela (v0.27.0), como no ataque comum.
 */
async function rollSide(message, side, event, { dodge = false } = {}) {
  const state = cardState(message);
  const data = state?.[side];
  if (!data) return;
  // Esquiva: só o lado da defesa, e só quem tem o efeito de defesa livre
  if (dodge && data.papel !== 'defesa') return;
  const actor = data.actorUuid
    ? await foundry.utils.fromUuid(data.actorUuid)
    : await pickActor(state, side, dodge ? hasDodge : null);
  if (!actor) return;
  if (!actor.isOwner || !canRollSide(state, side, actor.uuid)) {
    ui.notifications.warn(t('DESORDEM.Oposto.SemPermissao'));
    return;
  }
  // Esquiva livre: a perícia vem do efeito, sem o d6 do Defender-se; 1×/rodada em combate
  const dodgeEffect = dodge ? firstEffect(actor, 'defesaLivre') : null;
  if (dodge && !dodgeEffect) return;
  if (dodgeEffect && !usableThisRound(actor, dodgeEffect)) {
    ui.notifications.warn(t('DESORDEM.Efeito.Aviso.Rodada', { nome: dodgeEffect.itemName }));
    return;
  }
  const choice = dodgeEffect
    ? { skill: dodgeEffect.params.pericia || 'acrobacia', arma: null }
    : await pickChoice(state, side, actor);
  if (!choice) return;
  const { skill, arma } = choice;
  const weaponItem = arma ? actor.items.get(arma.id) : null;
  // Arma consumível sem unidades: não ataca (avisa)
  if (weaponItem && !canAttackWith(weaponItem)) return;

  // Defender-se: o +d6 aparece na janela pré-teste já marcado (desmarcar = esquiva sem o dado)
  const allowDefense = data.papel === 'defesa' && !dodgeEffect;
  const weapon = weaponItem;
  const options = await askRollChoices(actor, {
    skillKey: skill,
    showDt: false,
    allowDefense,
    // Ataque com arma: os dados extras de ataque corpo a corpo ou à distância entram; na esquiva,
    // os de defesa
    ...(weapon ? { testKind: weaponTestKind(weapon.system), weaponId: weapon.id } : {}),
    ...(dodgeEffect ? { testKind: 'defesa' } : {}),
    shift: event?.shiftKey,
  });
  if (!options) return;
  const test = skillTestOptions(actor, skill, undefined, {
    ...options,
    showDt: false,
    allowDefense,
  });
  const what =
    data.papel === 'ataque'
      ? weapon.name
      : data.papel === 'defesa'
        ? dodgeEffect
          ? dodgeEffect.itemName
          : t('DESORDEM.Oposto.Defender')
        : `${test.attrLabel} + ${test.skillLabel}`;
  // Marca o uso da esquiva nesta rodada antes de rolar (um segundo clique já é recusado)
  if (dodgeEffect) {
    const used = roundUseUpdate(dodgeEffect);
    if (Object.keys(used).length) await actor.update(used);
  }
  const result = await rollTest({
    ...test,
    actor,
    label: `${what} · ${t('DESORDEM.Oposto.Titulo')}`,
    rollMode: 'publicroll',
    opostoFlag: {
      cardId: message.id,
      lado: side,
      actorUuid: actor.uuid,
      skill,
      armaId: arma?.id ?? '',
      // Munição marcada (o mestre confere no ator e soma o bônus de dano dela no cartão)
      ...(weapon && options.municaoId ? { municaoId: options.municaoId } : {}),
      ...(dodgeEffect ? { esquiva: true } : {}),
    },
  });
  // Ataque com arma: marca o ataque da cena e gasta a unidade da arma consumível
  if (result && weapon) await afterWeaponAttack(actor, weapon);
  // Munição usada: gasta uma unidade, acertando ou não
  const usedAmmo = result && weapon ? ammoFor(actor, weapon, options.municaoId) : null;
  if (usedAmmo) await spendAmmo(actor, usedAmmo.id);
  // Gastou a ação para se defender (Defender-se com o d6; a esquiva livre não conta): ganhos de
  // «ao se defender» (ex.: um marcador de análise)
  if (result && allowDefense && options.active?.includes('defesa')) {
    const before = actorResources(actor).values;
    const gains = triggerUpdates(actor, 'defender');
    if (Object.keys(gains).length) {
      await actor.update(gains);
      await announceGains(actor, before, resourceChanges(gains), 'defender');
    }
  }
}

/** O ator tem esquiva livre (efeito `defesaLivre`)? */
const hasDodge = (actor) => Boolean(firstEffect(actor, 'defesaLivre'));

/** O mestre (ou o autor do cartão) cancela um cartão ainda aberto. */
async function cancelCard(message) {
  const state = cardState(message);
  if (!canCancel(state) || !message.canUserModify(game.user, 'update')) return;
  const next = { ...state, estado: 'cancelado' };
  await message.update({ content: await renderCard(next), [`flags.${SYSTEM_ID}.oposto`]: next });
}

/** Empate: o mestre (ou o autor) abre um cartão novo com os mesmos lados e marca este como repetido. */
async function repeatCard(message) {
  const state = cardState(message);
  if (state?.estado !== 'empate' || !message.canUserModify(game.user, 'update')) return;
  const fresh = repeatState(state);
  const actor = await foundry.utils.fromUuid(state.a.actorUuid);
  await postMessage({
    actor,
    content: await renderCard(fresh),
    flags: { oposto: fresh },
    rollMode: 'publicroll',
  });
  const old = { ...state, estado: 'repetido' };
  await message.update({ content: await renderCard(old), [`flags.${SYSTEM_ID}.oposto`]: old });
}

/**
 * Danos que este navegador pediu e ainda não aplicou (chave: mensagem + lado), com as escolhas já
 * feitas na janela Resolver dano.
 */
export const damageRequests = new Map();

/** Aplica o dano reservado para este usuário (no alvo, com as escolhas da janela). */
export async function applyReservedDamage(message, side, choices) {
  const state = cardState(message);
  const entry = state?.dano?.[side];
  // O alvo do dano: o Guardião, se alguém assumiu o ataque
  const target = await foundry.utils.fromUuid(damageTargetUuid(state, side));
  if (!entry || !target?.isOwner) return;
  await damageActor(target, entry.valor, { nonLethal: entry.naoLetal, choices });
}

/**
 * Resumo do teste de quem recebe o dano (para a redução do escudo): o outro lado do cartão, se
 * for ele mesmo que recebe (quem assumiu o ataque no lugar dele não rolou este teste).
 */
function defenderSummary(state, side) {
  const receiver = otherSide(side);
  if (state?.dano?.[side]?.guardiao) return null;
  return state?.resultado?.[receiver] ?? null;
}

/**
 * Clique em «Aplicar dano»: primeiro a janela Resolver dano (Shift+clique pula). Confirmado, quem
 * pode editar o cartão marca e aplica na hora; os outros pedem ao mestre, que reserva o dano para
 * quem pediu (o hook de atualização aplica em seguida, com as mesmas escolhas).
 */
async function requestDamage(message, side, event) {
  const state = cardState(message);
  const entry = state?.dano?.[side];
  const target = foundry.utils.fromUuidSync(damageTargetUuid(state, side));
  if (!target?.isOwner || entry?.estado !== 'pendente') return;
  // Sem poder marcar o cartão (nem mestre para pedir), nem abre a janela de dano
  if (!canWriteOrAsk(message)) return;
  const choices = await askDamage(target, entry.valor, {
    nonLethal: entry.naoLetal,
    shift: Boolean(event?.shiftKey),
    defender: defenderSummary(state, side),
  });
  if (!choices) return;
  if (message.canUserModify(game.user, 'update')) {
    const next = markDamage(state, side, game.user.id);
    if (!next) return;
    await message.update({ content: await renderCard(next), [`flags.${SYSTEM_ID}.oposto`]: next });
    await applyReservedDamage(message, side, choices);
    return;
  }
  damageRequests.set(`${message.id}:${side}`, choices);
  game.socket.emit(SOCKET, {
    action: 'opposedDamage',
    messageId: message.id,
    side,
    userId: game.user.id,
  });
}

/** Cria um botão do cartão que chama `action` uma vez por vez (sem duplo clique). */
function cardButton(message, key, label, iconName, action) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'desordem-oposto__botao';
  const icon = document.createElement('i');
  icon.className = `fa-solid ${iconName}`;
  icon.setAttribute('aria-hidden', 'true');
  button.append(icon, document.createTextNode(` ${label}`));
  button.addEventListener('click', async (event) => {
    event.preventDefault();
    await inFlight.run(`${message.id}:${key}`, async () => {
      button.disabled = true;
      try {
        await action(event);
      } finally {
        button.disabled = false;
      }
    });
  });
  return button;
}

/** Este usuário pode rolar pelo lado (dono do ator fixado, ou tem quem aceite o lado aberto)? */
function userCanRoll(state, side) {
  const data = state[side];
  if (data.testId || state.estado !== 'aberto') return false;
  if (data.actorUuid) {
    const actor = foundry.utils.fromUuidSync(data.actorUuid);
    return Boolean(actor?.isOwner);
  }
  return candidateActors(state[otherSide(side)].actorUuid).length > 0;
}

/**
 * O usuário pode esquivar por este lado? O ator do lado (ou, com o lado aberto, algum candidato
 * dele) tem a defesa livre e ainda pode usá-la nesta rodada.
 */
function userCanDodge(state, side) {
  const data = state[side];
  const ready = (actor) => {
    const entry = actor?.isOwner ? firstEffect(actor, 'defesaLivre') : null;
    return Boolean(entry) && usableThisRound(actor, entry);
  };
  if (data.actorUuid) return ready(foundry.utils.fromUuidSync(data.actorUuid));
  return candidateActors(state[otherSide(side)].actorUuid).some(ready);
}

/** Hook renderChatMessageHTML: põe os botões do cartão (rolar, aceitar, dano, cancelar, repetir). */
export function renderOpposedCard(message, html) {
  const state = cardState(message);
  if (!state || !message.isContentVisible) return;
  for (const side of ['a', 'b']) {
    const slot = html.querySelector(`[data-oposto-acoes="${side}"]`);
    if (!slot || !userCanRoll(state, side)) continue;
    const accept = !state[side].actorUuid;
    slot.append(
      cardButton(
        message,
        side,
        t(accept ? 'DESORDEM.Oposto.Aceitar' : 'DESORDEM.Oposto.Rolar'),
        accept ? 'fa-hand' : 'fa-dice-d20',
        (event) => rollSide(message, side, event),
      ),
    );
    // Esquiva livre: botão separado no lado da defesa, para quem tem o efeito
    if (state[side].papel === 'defesa' && userCanDodge(state, side)) {
      slot.append(
        cardButton(
          message,
          `esquiva-${side}`,
          t('DESORDEM.Oposto.Esquivar'),
          'fa-person-running',
          (event) => rollSide(message, side, event, { dodge: true }),
        ),
      );
    }
  }
  // Dano: só para o dono do alvo (o Guardião, se alguém assumiu; o mestre, nas criaturas),
  // enquanto pendente. Antes de alguém assumir, o botão de assumir o ataque (cartões de defesa)
  for (const side of ['a', 'b']) {
    const slot = html.querySelector(`[data-oposto-dano="${side}"]`);
    const entry = state.dano?.[side];
    if (!slot || entry?.estado !== 'pendente') continue;
    if (!entry.guardiao && cardType(state) === 'defesa') {
      const exclude = [state[side].actorUuid, state[otherSide(side)].actorUuid];
      slot.append(...guardButtons(message, { kind: 'oposto', exclude, extra: { side } }));
    }
    const target = foundry.utils.fromUuidSync(damageTargetUuid(state, side));
    if (!target?.isOwner) continue;
    slot.append(
      cardButton(
        message,
        `dano-${side}`,
        t('DESORDEM.Oposto.AplicarDano', { valor: entry.valor, nome: target.name }),
        'fa-heart-crack',
        (event) => requestDamage(message, side, event),
      ),
    );
  }
  const footer = html.querySelector('[data-oposto-rodape]');
  if (!footer || !message.canUserModify(game.user, 'update')) return;
  if (canCancel(state)) {
    footer.append(
      cardButton(message, 'cancelar', t('DESORDEM.Oposto.Cancelar'), 'fa-xmark', () =>
        cancelCard(message),
      ),
    );
  }
  if (state.estado === 'empate') {
    footer.append(
      cardButton(message, 'repetir', t('DESORDEM.Oposto.Repetir'), 'fa-rotate', () =>
        repeatCard(message),
      ),
    );
  }
}

/** Resultado atual de um teste (lido das flags da mensagem, já com análise e repetições). */
export function testResult(message) {
  const data = message?.flags?.[SYSTEM_ID]?.teste;
  if (!data?.plan || !Array.isArray(data.values)) return null;
  return resolveWithValues(data.plan, data.values);
}
