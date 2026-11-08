/**
 * Equipamentos: armas, armaduras (pontos de armadura) e itens. Lógica pura, sem dependência do
 * Foundry. Os dados vêm dos Items do ator (`item.system`).
 */

/** Cada ponto de armadura gasto reduz o dano físico sofrido em tanto. */
export const ARMOR_REDUCTION = 10;

/** Tipos de arma. */
export const WEAPON_KINDS = Object.freeze(['corpo', 'distancia']);

/** Pontos de armadura que ainda restam em uma armadura (nunca mais que o total dela). */
const remainingPoints = (armor) => Math.max(0, Math.min(armor.restantes, armor.pontos));

/**
 * Pontos de armadura do item vestido.
 * @param {{pontos: number, restantes: number, vestida: boolean}[]} armors
 * @returns {{total: number, available: number}} `total` conta os pontos e `available` os que restam.
 */
export function armorSummary(armors) {
  let total = 0;
  let available = 0;
  for (const armor of armors) {
    if (!armor.vestida) continue;
    total += armor.pontos;
    available += remainingPoints(armor);
  }
  return { total, available };
}

/**
 * Escolhe de qual armadura sai o ponto gasto: a primeira vestida que ainda tem pontos.
 * @param {{id: string, pontos: number, restantes: number, vestida: boolean}[]} armors
 * @returns {string|null} id da armadura, ou null se não houver pontos.
 */
export function pickArmorToSpend(armors) {
  const armor = armors.find((a) => a.vestida && remainingPoints(a) > 0);
  return armor ? armor.id : null;
}

/** Dano depois de gastar um ponto de armadura (nunca negativo). */
export function reduceDamageWithArmor(amount) {
  return Math.max(0, amount - ARMOR_REDUCTION);
}

/** Quantas mãos a pessoa tem. */
export const HANDS = 2;

/**
 * Mãos ocupadas pelos itens e armas empunhados (cada um usa uma ou duas).
 * @param {{maos: number, empunhada: boolean}[]} held Armas e itens (os não empunhados não contam).
 * @returns {{used: number, over: boolean}} `over` indica mais de duas mãos em uso.
 */
export function handsInUse(held) {
  const used = held.filter((h) => h.empunhada).reduce((sum, h) => sum + h.maos, 0);
  return { used, over: used > HANDS };
}

/**
 * Decide se uma mudança em um item do personagem respeita os limites do equipamento: no máximo
 * duas mãos ocupadas (armas e itens empunhados) e uma só armadura vestida.
 * @param {{id: string, type: string, system: Object}[]} siblings Os outros itens do personagem.
 * @param {{type: string, system: Object}} next O item, já com a mudança aplicada.
 * @returns {{ok: boolean, reason: ('maos'|'armadura'|null)}}
 */
export function checkEquipment(siblings, next) {
  if (next.type === 'armadura') {
    const other = siblings.some((i) => i.type === 'armadura' && i.system.vestida);
    return next.system.vestida && other
      ? { ok: false, reason: 'armadura' }
      : { ok: true, reason: null };
  }
  if (next.system.empunhada) {
    const used = handsInUse(
      siblings.filter((i) => i.type === 'arma' || i.type === 'item').map((i) => i.system),
    ).used;
    if (used + next.system.maos > HANDS) return { ok: false, reason: 'maos' };
  }
  return { ok: true, reason: null };
}

/** Perícia do ataque: a escolhida na arma ou, sem ela, Luta (corpo a corpo) ou Pontaria. */
export function weaponSkill(weapon) {
  if (weapon.pericia) return weapon.pericia;
  return weapon.tipo === 'distancia' ? 'pontaria' : 'luta';
}

/** Texto do dano da arma (ex.: "RA", "RA+2", "RA−1"). */
export function weaponDamageLabel(bonus) {
  if (!bonus) return 'RA';
  return bonus > 0 ? `RA+${bonus}` : `RA−${Math.abs(bonus)}`;
}

/**
 * Situação de uso de um item. Se o item tem limite de usos, ele conta os usos restantes; se não
 * tem, mas é consumível, cada uso gasta uma unidade; senão não há o que gastar.
 * @returns {{kind: ('usos'|'quantidade'|null), remaining: number, max: (number|null),
 *   canUse: boolean}}
 */
export function itemUse(item) {
  if (item.usosMax > 0) {
    return { kind: 'usos', remaining: item.usos, max: item.usosMax, canUse: item.usos > 0 };
  }
  if (item.consumivel) {
    return {
      kind: 'quantidade',
      remaining: item.quantidade,
      max: null,
      canUse: item.quantidade > 0,
    };
  }
  return { kind: null, remaining: 0, max: null, canUse: false };
}

/**
 * Alteração do item ao usá-lo (para `item.update`), ou null se não puder ser usado.
 * @returns {Object<string, number>|null}
 */
export function itemUseChanges(item) {
  const use = itemUse(item);
  if (!use.canUse) return null;
  return use.kind === 'usos'
    ? { 'system.usos': item.usos - 1 }
    : { 'system.quantidade': item.quantidade - 1 };
}
