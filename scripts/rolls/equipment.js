/**
 * Equipamentos: armas, armaduras (pontos de armadura) e itens. Lógica pura, sem dependência do
 * Foundry. Os dados vêm dos Items do ator (`item.system`).
 */

/** Cada ponto de armadura gasto reduz o dano físico sofrido em tanto. */
export const ARMOR_REDUCTION = 10;

/** Tipos de arma. */
export const WEAPON_KINDS = Object.freeze(['corpo', 'distancia']);

/**
 * Pontos de armadura dos itens vestidos.
 * @param {{pontos: number, gastos: number, vestida: boolean}[]} armors
 * @returns {{total: number, available: number}} `total` conta os pontos e `available` os que restam.
 */
export function armorSummary(armors) {
  let total = 0;
  let available = 0;
  for (const armor of armors) {
    if (!armor.vestida) continue;
    total += armor.pontos;
    available += Math.max(0, armor.pontos - armor.gastos);
  }
  return { total, available };
}

/**
 * Escolhe de qual armadura sai o ponto gasto: a primeira vestida que ainda tem pontos.
 * @param {{id: string, pontos: number, gastos: number, vestida: boolean}[]} armors
 * @returns {string|null} id da armadura, ou null se não houver pontos.
 */
export function pickArmorToSpend(armors) {
  const armor = armors.find((a) => a.vestida && a.gastos < a.pontos);
  return armor ? armor.id : null;
}

/** Dano depois de gastar um ponto de armadura (nunca negativo). */
export function reduceDamageWithArmor(amount) {
  return Math.max(0, amount - ARMOR_REDUCTION);
}

/**
 * Mãos ocupadas pelas armas empunhadas (cada arma usa uma ou duas).
 * @param {{maos: number, empunhada: boolean}[]} weapons
 * @returns {{used: number, over: boolean}} `over` indica mais de duas mãos em uso.
 */
export function handsInUse(weapons) {
  const used = weapons.filter((w) => w.empunhada).reduce((sum, w) => sum + w.maos, 0);
  return { used, over: used > 2 };
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
