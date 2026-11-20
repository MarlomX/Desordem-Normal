/**
 * Dados da ficha de criatura que não dependem do Foundry (abas, ataques, habilidades, filtro das
 * perícias treinadas e etiquetas do cabeçalho). As linhas de atributos, perícias e efeitos vêm
 * dos mesmos construtores da ficha de personagem (`context.js`).
 */
import { weaponDamageLabel, weaponSkill } from '../rolls/equipment.js';

/** Abas da ficha de criatura, na ordem de exibição (`icon` é uma classe do Font Awesome). */
export const CREATURE_TABS = Object.freeze([
  { id: 'ficha', icon: 'fa-dice-d20' },
  { id: 'acoes', icon: 'fa-bolt' },
  { id: 'notas', icon: 'fa-feather' },
]);

/** Tipos de item que uma criatura aceita: ataques (armas) e habilidades especiais. */
export const CREATURE_ITEM_TYPES = Object.freeze(['arma', 'habilidade']);

/** Aba que mostra um item recém-arrastado para a ficha (undefined se a criatura não o aceita). */
export function creatureTabForItemType(type) {
  return CREATURE_ITEM_TYPES.includes(type) ? 'acoes' : undefined;
}

/**
 * Perícias mostradas na ficha: só as treinadas (d6 ou mais), a menos que o mestre peça todas.
 * @param {{trained: boolean}[]} rows Linhas de `buildSkillRows`.
 * @param {boolean} showAll
 */
export function visibleSkillRows(rows, showAll) {
  return showAll ? rows : rows.filter((row) => row.trained);
}

/**
 * Linhas dos ataques da criatura (as armas dela), com o teste no formato do bloco de criatura
 * («d8 + d6») e o dano («RA+1»).
 * @param {{id: string, name: string, type: string, system: Object}[]} items Itens da criatura.
 * @param {Object} options
 * @param {(kind: string) => string} options.kindLabel Nome traduzido do tipo de ataque.
 * @param {(skillKey: string) => string} options.skillLabel Nome traduzido da perícia.
 * @param {(skillKey: string) => {attrDie: number, skillDie: number}} options.diceOf Dados do
 *   teste da perícia (já com passos e efeitos).
 * @param {boolean} [options.editable=true]
 */
export function buildAttackRows(items, { kindLabel, skillLabel, diceOf, editable = true }) {
  return items
    .filter((item) => item.type === 'arma')
    .map(({ id, name, system }) => {
      const skill = weaponSkill(system);
      const dice = diceOf(skill);
      return {
        id,
        name,
        descricao: system.descricao,
        kindLabel: kindLabel(system.tipo),
        skillLabel: skillLabel(skill),
        testLabel: `d${dice.attrDie} + d${dice.skillDie}`,
        damageLabel: weaponDamageLabel(system.bonusDano, system.baseDano),
        naoLetal: system.naoLetal,
        locked: !editable,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

/**
 * Linhas das habilidades especiais da criatura (texto livre), por nome.
 * @param {{id: string, name: string, type: string, system: Object}[]} items Itens da criatura.
 * @param {{openIds?: string[], editable?: boolean}} [options]
 */
export function buildCreatureAbilityRows(items, { openIds = [], editable = true } = {}) {
  return items
    .filter((item) => item.type === 'habilidade')
    .map(({ id, name, system }) => ({
      id,
      name,
      descricao: system.descricao,
      open: openIds.includes(id),
      locked: !editable,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

/**
 * Etiquetas do cabeçalho da criatura: «derrotada» com 0 PV.
 * @param {{pv: {value: number}}} system
 * @param {(key: string) => string} label Texto traduzido da etiqueta.
 * @returns {{key: string, label: string, tone: string}[]}
 */
export function creatureStatusTags(system, label) {
  return system?.pv?.value === 0
    ? [{ key: 'derrotada', label: label('derrotada'), tone: 'grave' }]
    : [];
}
