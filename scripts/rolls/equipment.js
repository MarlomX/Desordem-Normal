/**
 * Equipamentos: armas, armaduras (pontos de armadura) e itens. Lógica pura, sem dependência do
 * Foundry. Os dados vêm dos Items do ator (`item.system`).
 */

/** Cada ponto de armadura gasto reduz o dano físico sofrido em tanto. */
export const ARMOR_REDUCTION = 10;

/** Tipos de arma (alcance). */
export const WEAPON_KINDS = Object.freeze(['corpo', 'distancia']);

/**
 * Categorias de arma: natural (garras, mordida, soco; não ocupa mãos), simples e marcial (esta
 * precisa de proficiência, a partir da v0.21.1).
 */
export const WEAPON_CATEGORIES = Object.freeze(['natural', 'simples', 'marcial']);

/** Empunhaduras: uma ou duas mãos. */
export const GRIPS = Object.freeze(['uma', 'duas']);

/** A arma é natural (não ocupa mãos e não precisa ser empunhada)? */
export function isNatural(system) {
  return system?.categoria === 'natural';
}

/**
 * Quantas mãos uma arma ou item ocupa quando empunhado: 0 na arma natural, 2 na empunhadura
 * `duas`, 1 no resto (também em dados incompletos).
 * @param {{categoria?: string, empunhadura?: string}} system
 */
export function handsOf(system) {
  if (isNatural(system)) return 0;
  return system?.empunhadura === 'duas' ? 2 : 1;
}

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
 * Mãos ocupadas pelos itens e armas empunhados (cada um usa uma ou duas; veja `handsOf`).
 * @param {{empunhadura: string, empunhada: boolean, categoria?: string}[]} held Armas e itens
 *   (os não empunhados e as armas naturais não contam).
 * @returns {{used: number, over: boolean}} `over` indica mais de duas mãos em uso.
 */
export function handsInUse(held) {
  const used = held.filter((h) => h.empunhada).reduce((sum, h) => sum + handsOf(h), 0);
  return { used, over: used > HANDS };
}

/** A arma é marcial (precisa de proficiência para ser empunhada)? */
export function isMartial(system) {
  return system?.categoria === 'marcial';
}

/**
 * Decide se uma mudança em um item do personagem respeita os limites do equipamento: no máximo
 * duas mãos ocupadas (armas e itens empunhados), uma só armadura vestida e, sem proficiência
 * marcial, nenhuma arma marcial empunhada.
 * @param {{id: string, type: string, system: Object}[]} siblings Os outros itens do personagem.
 * @param {{type: string, system: Object}} next O item, já com a mudança aplicada.
 * @param {{proficient?: boolean}} [owner] `proficient`: o dono tem proficiência marcial (padrão
 *   verdadeiro: criaturas e quem chama sem saber não são travados).
 * @returns {{ok: boolean, reason: ('maos'|'armadura'|'proficiencia'|null)}}
 */
export function checkEquipment(siblings, next, { proficient = true } = {}) {
  if (next.type === 'armadura') {
    const other = siblings.some((i) => i.type === 'armadura' && i.system.vestida);
    return next.system.vestida && other
      ? { ok: false, reason: 'armadura' }
      : { ok: true, reason: null };
  }
  // Arma marcial sem proficiência: não pode ser empunhada (regra da missão, até uma regra melhor)
  if (next.type === 'arma' && next.system.empunhada && isMartial(next.system) && !proficient) {
    return { ok: false, reason: 'proficiencia' };
  }
  if (next.system.empunhada && !isNatural(next.system)) {
    const used = handsInUse(
      siblings.filter((i) => i.type === 'arma' || i.type === 'item').map((i) => i.system),
    ).used;
    if (used + handsOf(next.system) > HANDS) return { ok: false, reason: 'maos' };
  }
  return { ok: true, reason: null };
}

/**
 * A arma pode atacar agora? Só a arma consumível (de arremesso) sem unidades não pode.
 * @param {{consumivel?: boolean, quantidade?: number}} system
 */
export function weaponReady(system) {
  return !system?.consumivel || (system.quantidade ?? 0) > 0;
}

/**
 * Gravação que gasta uma unidade da arma consumível ao atacar (para `item.update`), ou `null` se
 * a arma não é consumível ou já está em 0 (em 0 ela só fica zerada).
 * @param {{consumivel?: boolean, quantidade?: number}} system
 * @returns {{'system.quantidade': number}|null}
 */
export function weaponAmmoChanges(system) {
  if (!system?.consumivel || !((system.quantidade ?? 0) > 0)) return null;
  return { 'system.quantidade': system.quantidade - 1 };
}

/** Perícia do ataque: a escolhida na arma ou, sem ela, Luta (corpo a corpo) ou Pontaria. */
export function weaponSkill(weapon) {
  if (weapon.pericia) return weapon.pericia;
  return weapon.tipo === 'distancia' ? 'pontaria' : 'luta';
}

/** Texto do dano da arma (ex.: "RA", "RA+2", "RB"); `base` é 'ra' (padrão) ou 'rb'. */
export function weaponDamageLabel(bonus, base = 'ra') {
  const name = base === 'rb' ? 'RB' : 'RA';
  if (!bonus) return name;
  return bonus > 0 ? `${name}+${bonus}` : `${name}−${Math.abs(bonus)}`;
}

/** Marca (flag) da arma padrão «Desarmado», criada com toda ficha nova. */
export const UNARMED_FLAG = 'desarmado';

/**
 * Dados do item «Desarmado» (soco e chute): arma natural corpo a corpo, sem mãos, com dano RB
 * não letal (regras p. 22: socos e chutes causam dano não letal).
 * @param {string} systemId Id do sistema (chave das flags).
 * @param {{nome: string, descricao: string}} texts Nome e descrição já traduzidos.
 */
export function unarmedWeaponData(systemId, { nome, descricao }) {
  return {
    name: nome,
    type: 'arma',
    system: {
      tipo: 'corpo',
      categoria: 'natural',
      empunhadura: 'uma',
      bonusDano: 0,
      baseDano: 'rb',
      pericia: '',
      naoLetal: true,
      empunhada: false,
      descricao,
    },
    flags: { [systemId]: { [UNARMED_FLAG]: true } },
  };
}

/**
 * A ficha que vai ser criada precisa ganhar o «Desarmado»? Só se ainda não tem um (fichas
 * duplicadas ou importadas já trazem o delas).
 * @param {{flags?: object}[]} items Itens da ficha (dados de origem).
 * @param {string} systemId
 */
export function needsUnarmed(items, systemId) {
  return !(items ?? []).some((item) => item?.flags?.[systemId]?.[UNARMED_FLAG]);
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
