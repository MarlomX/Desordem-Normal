/**
 * Ligação ao Foundry dos equipamentos: atacar com uma arma, aplicar o dano da arma e usar itens.
 */
import { SYSTEM_ID } from '../config.js';
import { render, postMessage, rollSkill } from './chat.js';
import { computeDamage } from './damage.js';
import { damageActor } from './health.js';
import { weaponSkill, weaponDamageLabel, itemUse, itemUseChanges } from './equipment.js';
import { hasAbility } from './abilities.js';
import { abilityNote } from './abilities-chat.js';

const TEMPLATE_ATAQUE = `systems/${SYSTEM_ID}/templates/chat/ataque.hbs`;
const TEMPLATE_USO = `systems/${SYSTEM_ID}/templates/chat/item-uso.hbs`;

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

/**
 * Ataque com uma arma: teste da perícia da arma (DT 7 por padrão) e, se acertar, um cartão com o
 * dano (rolagem alta + modificador da arma) e o botão de aplicá-lo aos alvos mirados.
 * @param {Actor} actor
 * @param {Item} weapon Item do tipo arma.
 * @param {Object} [options] Opções do teste de perícia (dt, extraDice, stepMods, helpers...).
 * @returns {Promise<{result: object, amount: (number|null)}>}
 */
export async function attackWithWeapon(actor, weapon, options = {}) {
  const { system } = weapon;
  // Companheiro animal: +d6 nos ataques corpo a corpo, até o animal se ferir (dado em 1)
  const companion =
    system.tipo === 'corpo' && hasAbility(actor, 'companheiro') && !actor.system.cena.animalFerido;
  const result = await rollSkill(actor, weaponSkill(system), {
    dt: 7,
    ...options,
    extraDice: [...(companion ? [6] : []), ...(options.extraDice ?? [])],
  });
  // O dado do companheiro é o primeiro dado extra do teste
  if (companion && result.dice[2]?.source === 'extra' && result.dice[2].value === 1) {
    await actor.update({ 'system.cena.animalFerido': true });
    await abilityNote(actor, t('DESORDEM.Habilidade.AnimalFerido'));
  }
  if (!result.success) return { result, amount: null };
  const amount = computeDamage(result, system.bonusDano);
  await postMessage({
    actor,
    content: await render(TEMPLATE_ATAQUE, {
      name: actor.name,
      weapon: weapon.name,
      amount,
      high: result.highSum,
      formula: weaponDamageLabel(system.bonusDano),
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

/** Aplica o dano do cartão de ataque aos tokens mirados (alvos) por quem clicou. */
async function applyWeaponDamage(message) {
  const data = message.flags?.[SYSTEM_ID]?.danoArma;
  if (!data) return;
  const targets = [...game.user.targets].map((token) => token.actor).filter(Boolean);
  if (!targets.length) {
    ui.notifications.warn(t('DESORDEM.Equipamento.SemAlvo'));
    return;
  }
  for (const target of targets) {
    if (!target.isOwner) {
      ui.notifications.warn(t('DESORDEM.Equipamento.SoMestre', { nome: target.name }));
      continue;
    }
    await damageActor(target, data.amount, { nonLethal: data.naoLetal });
  }
}

/** Hook renderChatMessageHTML: liga o botão de aplicar dano do cartão de ataque. */
export function renderEquipmentCard(message, html) {
  const button = html.querySelector('[data-desordem-aplicar-dano]');
  if (!button || !message.flags?.[SYSTEM_ID]?.danoArma) return;
  button.addEventListener('click', async (event) => {
    event.preventDefault();
    button.disabled = true;
    try {
      await applyWeaponDamage(message);
    } finally {
      button.disabled = false;
    }
  });
}
