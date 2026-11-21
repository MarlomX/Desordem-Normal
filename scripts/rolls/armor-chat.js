/**
 * Ligação ao Foundry dos pontos de armadura: lê as armaduras do ator (e a Armadura extra das
 * habilidades) e grava o gasto de um ponto (no item ou, no ponto extra, no personagem). A escolha
 * de gastar fica na janela Resolver dano (damage-dialog.js).
 */
import { ARMOR_EXTRA, armorSummary, pickArmorToSpend } from './equipment.js';
import { armorExtraPoints } from './ability-effects.js';
import { actorEffects } from './ability-effects-actor.js';

/** Armaduras e escudos do ator no formato usado pela lógica pura. */
export function armorList(actor) {
  return actor.items
    .filter((item) => item.type === 'armadura')
    .map((item) => ({
      id: item.id,
      pontos: item.system.pontos,
      restantes: item.system.restantes,
      vestida: item.system.vestida,
      subtipo: item.system.subtipo,
    }));
}

/**
 * Armadura extra do ator: pontos (efeitos `armaduraExtra` das habilidades) e quantos já foram
 * gastos. Criaturas não têm o campo: 0.
 * @returns {{extra: number, extraSpent: number}}
 */
export function armorBonus(actor) {
  return {
    extra: armorExtraPoints(actorEffects(actor)),
    extraSpent: actor.system?.armaduraExtraGasta ?? 0,
  };
}

/** Pontos de armadura restantes das armaduras vestidas, com a Armadura extra. */
export function armorAvailable(actor) {
  return armorSummary(armorList(actor), armorBonus(actor)).available;
}

/**
 * Gasta um ponto de armadura do ator: da primeira armadura vestida que ainda tem pontos ou, sem
 * eles, da Armadura extra (contador no personagem).
 * @returns {Promise<boolean>} Se algum ponto foi gasto.
 */
export async function spendArmorPoint(actor) {
  const bonus = armorBonus(actor);
  const id = pickArmorToSpend(armorList(actor), bonus);
  if (!id) return false;
  if (id === ARMOR_EXTRA) {
    await actor.update({ 'system.armaduraExtraGasta': bonus.extraSpent + 1 });
    return true;
  }
  const item = actor.items.get(id);
  await item.update({ 'system.restantes': Math.max(0, item.system.restantes - 1) });
  return true;
}
