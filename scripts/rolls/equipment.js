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

/** Subtipos de armadura: armadura (vestida, dá pontos) e escudo (empunhado, sem pontos). */
export const ARMOR_KINDS = Object.freeze(['armadura', 'escudo']);

/** Marca de «gastar o ponto da Armadura extra» em `pickArmorToSpend` (não é id de item). */
export const ARMOR_EXTRA = 'extra';

/** O item de armadura é um escudo? */
export function isShield(system) {
  return system?.subtipo === 'escudo';
}

/** Armadura vestida que conta pontos (escudos nunca contam). */
const wornArmor = (armor) => Boolean(armor.vestida) && !isShield(armor);

/** Pontos de armadura que ainda restam em uma armadura (nunca mais que o total dela). */
const remainingPoints = (armor) => Math.max(0, Math.min(armor.restantes, armor.pontos));

/**
 * Pontos de armadura das armaduras vestidas (várias podem ser vestidas: os pontos somam). A
 * «Armadura extra» (efeito de habilidade) só conta com uma armadura vestida que dê pontos.
 * @param {{pontos: number, restantes: number, vestida: boolean, subtipo?: string}[]} armors
 * @param {{extra?: number, extraSpent?: number}} [bonus] Pontos de Armadura extra e quantos já
 *   foram gastos (`system.armaduraExtraGasta`).
 * @returns {{total: number, available: number, extra: number, extraLeft: number}} `total` conta
 *   os pontos (com o extra), `available` os que restam; `extra` e `extraLeft` só os do extra.
 */
export function armorSummary(armors, { extra = 0, extraSpent = 0 } = {}) {
  let total = 0;
  let available = 0;
  for (const armor of armors) {
    if (!wornArmor(armor)) continue;
    total += armor.pontos;
    available += remainingPoints(armor);
  }
  const counts = armors.some((armor) => wornArmor(armor) && armor.pontos > 0);
  const extraTotal = counts ? Math.max(0, extra) : 0;
  const extraLeft = counts ? Math.max(0, extraTotal - Math.max(0, extraSpent)) : 0;
  return {
    total: total + extraTotal,
    available: available + extraLeft,
    extra: extraTotal,
    extraLeft,
  };
}

/**
 * Escolhe de onde sai o ponto gasto: primeiro a primeira armadura vestida que ainda tem pontos;
 * sem pontos nas armaduras, a Armadura extra (`ARMOR_EXTRA`), se ainda houver.
 * @param {{id: string, pontos: number, restantes: number, vestida: boolean, subtipo?: string}[]}
 *   armors
 * @param {{extra?: number, extraSpent?: number}} [bonus] Como em `armorSummary`.
 * @returns {string|null} id da armadura, `ARMOR_EXTRA`, ou null se não houver pontos.
 */
export function pickArmorToSpend(armors, bonus = {}) {
  const armor = armors.find((a) => wornArmor(a) && remainingPoints(a) > 0);
  if (armor) return armor.id;
  return armorSummary(armors, bonus).extraLeft > 0 ? ARMOR_EXTRA : null;
}

/**
 * Penalidades passivas das armaduras vestidas e dos escudos empunhados: quantos passos cada
 * perícia perde e de quais itens (os passos de vários itens somam).
 * @param {{name: string, type: string, system: object}[]} items Itens do personagem.
 * @returns {Object<string, {steps: number, sources: string[]}>} Por perícia; `steps` positivo
 *   (passos a menos).
 */
export function armorSkillPenalties(items) {
  const penalties = {};
  for (const item of items ?? []) {
    if (item.type !== 'armadura') continue;
    const { system } = item;
    const inUse = isShield(system) ? system.empunhada : system.vestida;
    const steps = Math.max(0, Math.trunc(Number(system.penalidadePassos) || 0));
    if (!inUse || !steps) continue;
    for (const skill of system.penalidadePericias ?? []) {
      penalties[skill] ??= { steps: 0, sources: [] };
      penalties[skill].steps += steps;
      penalties[skill].sources.push(item.name);
    }
  }
  return penalties;
}

/**
 * Passos de penalidade das armaduras num teste de uma perícia, no formato dos passos do teste
 * (vazio sem penalidade).
 * @param {Object<string, {steps: number}>} penalties `armorSkillPenalties`.
 * @param {string} skillKey
 * @returns {{target: 'skill', steps: number}[]}
 */
export function armorStepMods(penalties, skillKey) {
  const steps = penalties?.[skillKey]?.steps ?? 0;
  return steps ? [{ target: 'skill', steps: -steps }] : [];
}

/**
 * Linha da penalidade das armaduras num teste, no mesmo formato das linhas dos efeitos da arma
 * (`weaponAttackEffects(...).lines`): vai para a seção «Itens» da janela e para a linha «Usou».
 * `null` se a perícia não tem penalidade.
 * @param {Object<string, {steps: number, sources: string[]}>} penalties `armorSkillPenalties`.
 * @param {string} skillKey
 */
export function armorPenaltyLine(penalties, skillKey) {
  const entry = penalties?.[skillKey];
  if (!entry?.steps) return null;
  return {
    key: 'penalidadeArmadura',
    kind: 'penalidade',
    itemName: entry.sources.join(', '),
    value: entry.steps,
    quando: null,
    applies: true,
    optional: false,
  };
}

/** Dano depois de gastar um ponto de armadura (nunca negativo). */
export function reduceDamageWithArmor(amount) {
  return Math.max(0, amount - ARMOR_REDUCTION);
}

/** Quantas mãos a pessoa tem. */
export const HANDS = 2;

/**
 * Mãos ocupadas pelas armas, itens e escudos empunhados (cada um usa uma ou duas; veja `handsOf`).
 * @param {{empunhadura: string, empunhada: boolean, categoria?: string}[]} held Armas, itens e
 *   escudos (os não empunhados e as armas naturais não contam).
 * @returns {{used: number, over: boolean}} `over` indica mais de duas mãos em uso.
 */
export function handsInUse(held) {
  const used = held.filter((h) => h.empunhada).reduce((sum, h) => sum + handsOf(h), 0);
  return { used, over: used > HANDS };
}

/** A arma, armadura ou escudo é marcial (precisa de proficiência para ser equipado)? */
export function isMartial(system) {
  return system?.categoria === 'marcial';
}

/** O que ocupa mãos: armas, itens gerais e escudos (dados `system`). */
const handHolders = (items) =>
  items
    .filter(
      (i) =>
        i.type === 'arma' || i.type === 'item' || (i.type === 'armadura' && isShield(i.system)),
    )
    .map((i) => i.system);

/** O item está equipado (vestido, se for armadura; empunhado, nos outros e no escudo)? */
export function isEquipped(item) {
  const { system } = item;
  if (item.type === 'armadura' && !isShield(system)) return Boolean(system.vestida);
  return Boolean(system.empunhada);
}

/**
 * Decide se uma mudança em um item do personagem respeita os limites do equipamento:
 * - no máximo duas mãos ocupadas (armas, itens e escudos empunhados);
 * - um só escudo empunhado;
 * - sem proficiência marcial, nada marcial equipado (arma empunhada, armadura vestida, escudo);
 * - armaduras: várias podem ser vestidas juntas (o mestre decide se vale).
 * @param {{id: string, type: string, system: Object}[]} siblings Os outros itens do personagem.
 * @param {{type: string, system: Object}} next O item, já com a mudança aplicada.
 * @param {{proficient?: boolean}} [owner] `proficient`: o dono tem proficiência marcial (padrão
 *   verdadeiro: criaturas e quem chama sem saber não são travados).
 * @returns {{ok: boolean, reason: ('maos'|'escudo'|'proficiencia'|null)}}
 */
export function checkEquipment(siblings, next, { proficient = true } = {}) {
  const ok = { ok: true, reason: null };
  const { system } = next;
  if (!isEquipped(next)) return ok;
  // Marcial sem proficiência: não pode ser equipado (regra da missão, até uma regra melhor)
  if (isMartial(system) && !proficient) return { ok: false, reason: 'proficiencia' };
  // Armadura vestida: sem limite de quantidade nem de mãos
  if (next.type === 'armadura' && !isShield(system)) return ok;
  if (next.type === 'armadura') {
    const otherShield = siblings.some(
      (i) => i.type === 'armadura' && isShield(i.system) && i.system.empunhada,
    );
    if (otherShield) return { ok: false, reason: 'escudo' };
  }
  if (isNatural(system)) return ok;
  const used = handsInUse(handHolders(siblings)).used;
  if (used + handsOf(system) > HANDS) return { ok: false, reason: 'maos' };
  return ok;
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
