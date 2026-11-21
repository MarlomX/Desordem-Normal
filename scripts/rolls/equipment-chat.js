/* global document */
/**
 * Ligação ao Foundry dos equipamentos: atacar com uma arma, aplicar o dano da arma e usar itens.
 * No cartão de ataque, quem tem o Assumir ataque pronto pode assumi-lo até o dano ser aplicado;
 * aí o dano vai para o Guardião, e não para os alvos mirados.
 */
import { SYSTEM_ID } from '../config.js';
import { render, postMessage, rollSkill } from './chat.js';
import { computeDamage, damageBaseValue } from './damage.js';
import { damageActor } from './health.js';
import { weaponSkill, weaponDamageLabel, itemUse, itemUseChanges } from './equipment.js';
import { firstEffect } from './ability-effects-actor.js';
import { weaponTestKind } from './ability-effects.js';
import { abilityNote } from './abilities-chat.js';
import { guardButtons, registerGuardHandler } from './guardian-chat.js';
import { canGuardWeaponCard, guardWeaponCard } from './guardian.js';

const TEMPLATE_ATAQUE = `systems/${SYSTEM_ID}/templates/chat/ataque.hbs`;
const TEMPLATE_USO = `systems/${SYSTEM_ID}/templates/chat/item-uso.hbs`;

const SOCKET = `system.${SYSTEM_ID}`;

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

/** Marca do cartão de ataque (dano, Guardião, aplicado), ou null. */
const weaponFlag = (message) => message?.flags?.[SYSTEM_ID]?.danoArma ?? null;

/** Quem atacou (o ator que fala pela mensagem). */
const attackerOf = (message) => ChatMessage.getSpeakerActor(message.speaker);

/**
 * Ataque com uma arma: teste da perícia da arma (DT 7 por padrão) e, se acertar, um cartão com o
 * dano (rolagem alta + modificador da arma) e o botão de aplicá-lo aos alvos mirados.
 * @param {Actor} actor
 * @param {Item} weapon Item do tipo arma.
 * @param {Object} [options] Opções do teste de perícia (dt, extraDice, stepMods, helpers...).
 * @returns {Promise<{result: object, amount: (number|null)}>}
 */
/**
 * Companheiro animal (efeito `companheiro`): o dado dele nos ataques do tipo do efeito (corpo a
 * corpo, por padrão), até o animal se ferir (dado em 1).
 * @returns {number[]} [dado] se o companheiro ajuda neste ataque, senão [].
 */
export function weaponCompanionDice(actor, weapon) {
  const { system } = weapon;
  const companion = firstEffect(actor, 'companheiro');
  if (!companion || actor.system.cena?.animalFerido) return [];
  const kind = system.tipo === 'corpo' ? 'ataqueCorpo' : 'ataqueDistancia';
  const fits = companion.params.teste === 'qualquer' || companion.params.teste === kind;
  return fits ? [companion.params.dado] : [];
}

/**
 * Companheiro na defesa (efeito `companheiro` de «Defesa» ou «Qualquer teste»): o dado dele no
 * teste de defesa do cartão (Defender-se ou esquiva), até o animal se ferir.
 * @returns {number[]} [dado] se o companheiro ajuda na defesa, senão [].
 */
export function defenseCompanionDice(actor) {
  const companion = firstEffect(actor, 'companheiro');
  if (!companion || actor.system.cena?.animalFerido) return [];
  return ['defesa', 'qualquer'].includes(companion.params.teste) ? [companion.params.dado] : [];
}

export async function attackWithWeapon(actor, weapon, options = {}) {
  const { system } = weapon;
  const companionDice = weaponCompanionDice(actor, weapon);
  const companion = companionDice.length > 0;
  const result = await rollSkill(actor, weaponSkill(system), {
    dt: 7,
    // Tipo do ataque para os filtros dos dados extras (a janela pré-teste já manda o mesmo)
    testKind: weaponTestKind(system),
    ...options,
    extraDice: [...companionDice, ...(options.extraDice ?? [])],
  });
  // O dado do companheiro é o primeiro dado extra do teste
  if (companion && result.dice[2]?.source === 'extra' && result.dice[2].value === 1) {
    await actor.update({ 'system.cena.animalFerido': true });
    await abilityNote(actor, {
      entry: firstEffect(actor, 'companheiro'),
      text: t('DESORDEM.Habilidade.AnimalFerido'),
    });
  }
  if (!result.success) return { result, amount: null };
  const amount = computeDamage(result, system.bonusDano, system.baseDano);
  await postMessage({
    actor,
    content: await render(TEMPLATE_ATAQUE, {
      name: actor.name,
      weapon: weapon.name,
      amount,
      high: damageBaseValue(result, system.baseDano),
      base: system.baseDano === 'rb' ? 'RB' : 'RA',
      formula: weaponDamageLabel(system.bonusDano, system.baseDano),
      nonLethal: system.naoLetal,
    }),
    flags: { danoArma: { amount, naoLetal: system.naoLetal } },
  });
  return { result, amount };
}

/**
 * Usa um item: gasta um uso (se tem limite de usos) ou uma unidade (se é consumível) e avisa no chat.
 * @returns {Promise<boolean>} Se o item foi usado.
 */
export async function useItem(actor, item) {
  const changes = itemUseChanges(item.system);
  if (!changes) {
    ui.notifications.warn(t('DESORDEM.Equipamento.SemUso', { nome: item.name }));
    return false;
  }
  await item.update(changes);
  const use = itemUse(item.system);
  await postMessage({
    actor,
    content: await render(TEMPLATE_USO, {
      name: actor.name,
      item: item.name,
      descricao: item.system.descricao,
      byUses: use.kind === 'usos',
      remaining: use.remaining,
      max: use.max,
    }),
  });
  return true;
}

/**
 * Marca o cartão de ataque como aplicado (o Assumir ataque some). Quem não pode editar a mensagem
 * pede ao mestre ativo.
 */
async function markWeaponDamage(message) {
  if (weaponFlag(message)?.aplicado) return;
  if (message.canUserModify(game.user, 'update')) {
    await message.update({ [`flags.${SYSTEM_ID}.danoArma.aplicado`]: true });
  } else if (game.users.activeGM) {
    game.socket.emit(SOCKET, { action: 'weaponDamageApplied', messageId: message.id });
  }
}

/**
 * Aplica o dano do cartão de ataque por quem clicou: no Guardião, se alguém assumiu o ataque;
 * senão, nos tokens mirados (alvos).
 */
async function applyWeaponDamage(message) {
  const data = weaponFlag(message);
  if (!data) return;
  let targets;
  if (data.guardiao) {
    const guardian = await foundry.utils.fromUuid(data.guardiao.actorUuid);
    targets = guardian ? [guardian] : [];
  } else {
    targets = [...game.user.targets].map((token) => token.actor).filter(Boolean);
  }
  if (!targets.length) {
    ui.notifications.warn(t('DESORDEM.Equipamento.SemAlvo'));
    return;
  }
  let applied = false;
  for (const target of targets) {
    if (!target.isOwner) {
      ui.notifications.warn(t('DESORDEM.Equipamento.SoMestre', { nome: target.name }));
      continue;
    }
    await damageActor(target, data.amount, { nonLethal: data.naoLetal });
    applied = true;
  }
  if (applied) await markWeaponDamage(message);
}

/**
 * Hook renderChatMessageHTML: liga o botão de aplicar dano do cartão de ataque, mostra o Guardião
 * (se alguém assumiu) e põe o botão de assumir o ataque enquanto ainda dá.
 */
export function renderEquipmentCard(message, html) {
  const button = html.querySelector('[data-desordem-aplicar-dano]');
  const data = weaponFlag(message);
  if (!button || !data) return;
  if (data.guardiao) {
    const line = document.createElement('p');
    line.className = 'desordem-ficha__dica';
    line.textContent = t('DESORDEM.Efeito.Guardiao.Alvo', {
      nome: data.guardiao.nome,
      habilidade: data.guardiao.habilidade,
    });
    button.before(line);
    button.textContent = t('DESORDEM.Equipamento.AplicarEm', { nome: data.guardiao.nome });
  }
  button.addEventListener('click', async (event) => {
    event.preventDefault();
    button.disabled = true;
    try {
      await applyWeaponDamage(message);
    } finally {
      button.disabled = false;
    }
  });
  if (!canGuardWeaponCard(data) || !message.isContentVisible) return;
  const attacker = attackerOf(message);
  const guards = guardButtons(message, { kind: 'arma', exclude: attacker ? [attacker.uuid] : [] });
  if (guards.length) button.after(...guards);
}

/** Fila do mestre para os cartões de ataque: cada gravação espera a anterior. */
let queue = Promise.resolve();
function enqueue(task) {
  queue = queue.then(task).catch((error) => console.error(`${SYSTEM_ID} | ataque`, error));
  return queue;
}

/**
 * Assumir ataque no cartão comum: o mestre confere que o cartão ainda aceita (dano não aplicado,
 * ninguém assumiu, o Guardião não é quem atacou) e grava o Guardião.
 */
registerGuardHandler('arma', {
  enqueue,
  check(message, data, guardian) {
    const flag = weaponFlag(message);
    const attacker = attackerOf(message);
    const next = guardWeaponCard(flag, guardian, attacker?.uuid ?? '');
    if (!next) return null;
    return {
      text: t('DESORDEM.Efeito.Nota.interceptarDe', { atacante: attacker?.name ?? '' }),
      apply: () => message.update({ [`flags.${SYSTEM_ID}.danoArma`]: next }),
    };
  },
});

/** Escuta os pedidos dos jogadores para marcar o dano como aplicado (só o mestre ativo atende). */
export function registerEquipmentSocket() {
  game.socket.on(SOCKET, (data) => {
    if (data?.action !== 'weaponDamageApplied') return;
    if (game.users.activeGM?.id !== game.user.id) return;
    const message = game.messages.get(data.messageId);
    if (!weaponFlag(message) || weaponFlag(message).aplicado) return;
    enqueue(() => message.update({ [`flags.${SYSTEM_ID}.danoArma.aplicado`]: true }));
  });
}
