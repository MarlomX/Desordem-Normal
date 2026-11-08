/**
 * Preparação de dados para a ficha. Funções puras (sem Foundry), testadas em Node.
 */
import { DIE_STEPS } from '../rolls/dice.js';
import { RELATION_MAX_DEGREE, degreeKey, invokeCheck } from '../rolls/relation.js';
import {
  HANDS,
  armorSummary,
  handsInUse,
  itemUse,
  weaponSkill,
  weaponDamageLabel,
} from '../rolls/equipment.js';
import { EFFECT_MAX_STEPS } from '../rolls/effects.js';

/**
 * Opções de um seletor de dado (d4 a d12). Se o valor atual estiver fora da escada
 * (ex.: d20 de efeitos paranormais), ele é incluído para não ser perdido ao salvar.
 * @param {number} current Dado atual (número de faces).
 */
export function dieOptions(current) {
  const value = Number(current);
  const sides = DIE_STEPS.includes(value)
    ? [...DIE_STEPS]
    : [...DIE_STEPS, value].sort((a, b) => a - b);
  return sides.map((faces) => ({ value: faces, label: `d${faces}`, selected: faces === value }));
}

/**
 * @param {Record<string, number>} attributes Ex.: { fisico: 6, ... }
 * @param {string[]} keys Chaves dos atributos, na ordem de exibição.
 * @param {(key: string) => string} label Devolve o nome traduzido.
 */
export function buildAttributeRows(attributes, keys, label) {
  return keys.map((key) => ({
    key,
    label: label(key),
    options: dieOptions(attributes[key]),
  }));
}

/**
 * Linhas da lista de perícias, em ordem alfabética pelo nome traduzido.
 * @param {Record<string, number>} skills Dados das perícias do personagem.
 * @param {Record<string, string>} skillAttributes Perícia -> atributo-base.
 * @param {Object} labels
 * @param {(key: string) => string} labels.skillLabel
 * @param {(key: string) => string} labels.attrLabel
 */
export function buildSkillRows(skills, skillAttributes, { skillLabel, attrLabel }) {
  return Object.entries(skillAttributes)
    .map(([key, attrKey]) => ({
      key,
      label: skillLabel(key),
      attrLabel: attrLabel(attrKey),
      options: dieOptions(skills[key]),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
}

/**
 * Linhas das áreas de Aptidão (mesmo formato dos atributos: um dado por área).
 * @param {Record<string, number>} aptitudes Ex.: { erudicao: 6, ... }
 * @param {string[]} keys Chaves das áreas, na ordem de exibição.
 * @param {(key: string) => string} label Devolve o nome traduzido.
 */
export function buildAptitudeRows(aptitudes, keys, label) {
  return buildAttributeRows(aptitudes, keys, label);
}

/**
 * Lesões do personagem agrupadas por tipo (ex.: duas lacerações viram uma linha com ×2).
 * @param {string[]} keys Chaves das lesões, na ordem em que foram recebidas.
 * @param {(key: string) => string} label Devolve o nome traduzido.
 */
export function buildLesionRows(keys, label, describe) {
  const counts = new Map();
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  return [...counts].map(([key, count]) => ({
    key,
    label: label(key),
    count,
    repeated: count > 1,
    ...(describe ? { description: describe(key) } : {}),
  }));
}

/**
 * Opções do seletor do dado de pavor (0 = sem pavor, d4 a d12).
 * @param {number} current Dado de pavor atual.
 * @param {string} noneLabel Texto de "sem pavor".
 */
export function buildFearChoices(current, noneLabel) {
  return [0, 4, 6, 8, 10, 12].map((value) => ({
    value,
    label: value === 0 ? noneLabel : `d${value}`,
    selected: value === current,
  }));
}

/**
 * Linhas da lista de relações da ficha (bolinhas de grau e estado dos botões).
 * @param {{pessoa: string, grau: number, descricao: string, usada: boolean}[]} relations
 * @param {Object} options
 * @param {(key: string) => string} options.degreeLabel Nome traduzido do grau (chave de degreeKey).
 * @param {boolean} [options.editable=true] Se falso, nenhum botão fica ativo.
 */
export function buildRelationRows(relations, { degreeLabel, editable = true }) {
  return relations.map((relation, index) => ({
    index,
    pessoa: relation.pessoa,
    descricao: relation.descricao,
    grau: relation.grau,
    grauLabel: degreeLabel(degreeKey(relation.grau)),
    usada: relation.usada,
    locked: !editable,
    dots: Array.from({ length: RELATION_MAX_DEGREE }, (_, i) => ({
      n: i + 1,
      filled: i + 1 <= relation.grau,
    })),
    showInvoke: relation.grau > 0,
    canInvoke: editable && invokeCheck(relation).ok,
  }));
}

/**
 * Linhas dos efeitos temporários da ficha, com as opções dos seletores de atributo e de passos.
 * @param {{nome: string, descricao: string, atributo: string, passos: number}[]} effects
 * @param {Object} options
 * @param {(key: string) => string} options.attrLabel Nome traduzido do atributo.
 * @param {string} options.noAttrLabel Texto de "sem atributo".
 * @param {string[]} options.attributes Chaves dos atributos, na ordem do seletor.
 * @param {boolean} [options.editable=true]
 */
export function buildEffectRows(effects, { attrLabel, noAttrLabel, attributes, editable = true }) {
  const steps = Array.from({ length: EFFECT_MAX_STEPS * 2 + 1 }, (_, i) => i - EFFECT_MAX_STEPS);
  return effects.map((effect, index) => ({
    index,
    nome: effect.nome,
    descricao: effect.descricao,
    fimDeCena: effect.fimDeCena,
    locked: !editable,
    attrOptions: [
      { value: '', label: noAttrLabel, selected: effect.atributo === '' },
      ...attributes.map((key) => ({
        value: key,
        label: attrLabel(key),
        selected: effect.atributo === key,
      })),
    ],
    stepOptions: steps.map((value) => ({
      value,
      label: value > 0 ? `+${value}` : String(value),
      selected: value === effect.passos,
    })),
  }));
}

/**
 * Equipamento da ficha: armas, armaduras e outros itens, com mãos em uso e pontos de armadura.
 * Itens que não podem ser equipados agora (sem mãos livres, ou já há uma armadura vestida) vêm
 * com `blocked` verdadeiro, para a caixa de equipar ficar desativada.
 * @param {{id: string, name: string, type: string, system: Object}[]} items Itens do personagem.
 * @param {Object} options
 * @param {(kind: string) => string} options.kindLabel Nome traduzido do tipo de arma.
 * @param {(hands: number) => string} options.handsLabel Texto de "uma mão" / "duas mãos".
 * @param {(skillKey: string) => string} options.skillLabel Nome traduzido da perícia.
 * @param {boolean} [options.editable=true]
 */
export function buildEquipmentRows(items, { kindLabel, handsLabel, skillLabel, editable = true }) {
  const of = (type) => items.filter((item) => item.type === type);
  const weapons = of('arma');
  const armors = of('armadura');
  const others = of('item');
  const hands = handsInUse([...weapons, ...others].map((i) => i.system));
  const armorWorn = armors.some((a) => a.system.vestida);
  // Equipar fica bloqueado se o item não está equipado e não cabe
  const cannotHold = (system) => !system.empunhada && hands.used + system.maos > HANDS;
  return {
    weapons: weapons.map(({ id, name, system }) => ({
      id,
      name,
      descricao: system.descricao,
      kindLabel: kindLabel(system.tipo),
      handsLabel: handsLabel(system.maos),
      damageLabel: weaponDamageLabel(system.bonusDano),
      skillLabel: skillLabel(weaponSkill(system)),
      empunhada: system.empunhada,
      naoLetal: system.naoLetal,
      locked: !editable,
      blocked: !editable || cannotHold(system),
    })),
    armors: armors.map(({ id, name, system }) => ({
      id,
      name,
      descricao: system.descricao,
      pontos: system.pontos,
      restantes: Math.max(0, Math.min(system.restantes, system.pontos)),
      vestida: system.vestida,
      locked: !editable,
      blocked: !editable || (!system.vestida && armorWorn),
    })),
    others: others.map(({ id, name, system }) => {
      const use = itemUse(system);
      return {
        id,
        name,
        descricao: system.descricao,
        quantidade: system.quantidade,
        usos: system.usos,
        usosMax: system.usosMax,
        hasUsos: system.usosMax > 0,
        handsLabel: handsLabel(system.maos),
        empunhada: system.empunhada,
        showUse: use.kind !== null,
        canUse: editable && use.canUse,
        locked: !editable,
        blocked: !editable || cannotHold(system),
      };
    }),
    hands,
    armorTotals: armorSummary(armors.map((a) => a.system)),
  };
}

/** Opções de um seletor simples (valor, texto e marca do atual). */
export function buildChoices(values, current, label) {
  return values.map((value) => ({ value, label: label(value), selected: value === current }));
}

/**
 * Linhas das habilidades da ficha: a de perfil primeiro, depois as outras por nome. Cada linha
 * diz quais controles mostrar, conforme a automação da habilidade.
 * @param {{id: string, name: string, system: Object}[]} items Habilidades do personagem.
 * @param {Object} options
 * @param {string[]} options.active Habilidades ativadas para o próximo teste.
 * @param {{impeto: number, analise: number}} options.resources
 * @param {boolean} options.hurtCompanion O animal está ferido nesta cena.
 * @param {boolean} [options.editable=true]
 */
export function buildAbilityRows(items, { active, resources, hurtCompanion, editable = true }) {
  const rows = items.map(({ id, name, system }) => ({
    id,
    name,
    descricao: system.descricao,
    perfil: system.perfil,
    automacao: system.automacao,
    locked: !editable,
    showImpeto: system.automacao === 'impeto',
    showAnalise: system.automacao === 'analise',
    showDodge: system.automacao === 'esquiva',
    showHeal: system.automacao === 'curandeiro',
    showCompanion: system.automacao === 'companheiro',
    showSneak: system.automacao === 'sorrateiro',
    impeto: resources.impeto,
    analise: resources.analise,
    impetoDadoAtivo: active.includes('impetoDado'),
    sorrateiroAtivo: active.includes('sorrateiro'),
    animalFerido: hurtCompanion,
  }));
  return rows.sort(
    (a, b) => Number(b.perfil) - Number(a.perfil) || a.name.localeCompare(b.name, 'pt-BR'),
  );
}

