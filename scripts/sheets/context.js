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
import { shownDie, stepLimits } from '../rolls/steps.js';

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
 * @param {(key: string) => object} [stepOf] Devolve o `stepIndicator` do atributo (passos
 *   temporários); sem ele, o dado mostrado é o dado base.
 */
export function buildAttributeRows(attributes, keys, label, stepOf) {
  return keys.map((key) => {
    const indicator = stepOf?.(key);
    const limits = stepLimits(attributes[key], indicator?.effects ?? 0);
    const manual = indicator?.manual ?? 0;
    return {
      key,
      label: label(key),
      die: Number(attributes[key]),
      shownDie: shownDie(attributes[key], indicator),
      shifted: shownDie(attributes[key], indicator) !== Number(attributes[key]),
      stepNet: indicator?.net ?? 0,
      stepUp: (indicator?.net ?? 0) > 0,
      stepAbs: Math.abs(indicator?.net ?? 0),
      stepBig: Math.abs(indicator?.net ?? 0) > 1,
      stepDirection: indicator?.direction ?? 'none',
      stepManual: manual,
      canStepUp: manual < limits.max,
      canStepDown: manual > limits.min,
      trained: Number(attributes[key]) >= 6,
      search: normalizeSearch(label(key)),
      options: dieOptions(attributes[key]),
    };
  });
}

/**
 * Linhas da lista de perícias, em ordem alfabética pelo nome traduzido.
 * @param {Record<string, number>} skills Dados das perícias do personagem.
 * @param {Record<string, string>} skillAttributes Perícia -> atributo-base.
 * @param {Object} labels
 * @param {(key: string) => string} labels.skillLabel
 * @param {(key: string) => string} labels.attrLabel
 * @param {Record<string, number>} [labels.attributeDice] Dados dos atributos (para mostrar o
 *   dado do atributo-base ao lado do dado da perícia).
 * @param {(key: string) => object} [labels.attrStepOf] `stepIndicator` de cada atributo.
 * @param {object} [labels.skillStep] `stepIndicator` do dado geral das perícias.
 */
export function buildSkillRows(
  skills,
  skillAttributes,
  { skillLabel, attrLabel, attributeDice, attrStepOf, skillStep },
) {
  return Object.entries(skillAttributes)
    .map(([key, attrKey]) => {
      const attrBase = attributeDice ? Number(attributeDice[attrKey]) : undefined;
      return {
        key,
        label: skillLabel(key),
        attrLabel: attrLabel(attrKey),
        attrDie: attrBase,
        attrShownDie: attrBase === undefined ? undefined : shownDie(attrBase, attrStepOf?.(attrKey)),
        attrShifted:
          attrBase !== undefined && shownDie(attrBase, attrStepOf?.(attrKey)) !== attrBase,
        die: Number(skills[key]),
        shownDie: shownDie(skills[key], skillStep),
        shifted: shownDie(skills[key], skillStep) !== Number(skills[key]),
        trained: Number(skills[key]) >= 6,
        search: normalizeSearch(`${skillLabel(key)} ${attrLabel(attrKey)}`),
        options: dieOptions(skills[key]),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
}

/**
 * Linhas das áreas de Aptidão (mesmo formato dos atributos: um dado por área).
 * @param {Record<string, number>} aptitudes Ex.: { erudicao: 6, ... }
 * @param {string[]} keys Chaves das áreas, na ordem de exibição.
 * @param {(key: string) => string} label Devolve o nome traduzido.
 */
export function buildAptitudeRows(aptitudes, keys, label, skillStep) {
  return buildAttributeRows(aptitudes, keys, label, skillStep ? () => skillStep : undefined);
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
export function buildAbilityRows(
  items,
  { active, resources, hurtCompanion, editable = true, openIds = [] },
) {
  const rows = items.map(({ id, name, system }) => ({
    id,
    name,
    descricao: system.descricao,
    perfil: system.perfil,
    automacao: system.automacao,
    locked: !editable,
    open: openIds.includes(id),
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


/** Abas da ficha, na ordem de exibição (`icon` é uma classe do Font Awesome). */
export const SHEET_TABS = [
  { id: 'testes', icon: 'fa-dice-d20' },
  { id: 'habilidades', icon: 'fa-bolt' },
  { id: 'equipamento', icon: 'fa-shield-halved' },
  { id: 'condicao', icon: 'fa-heart-pulse' },
  { id: 'relacoes', icon: 'fa-people-arrows' },
];

/**
 * Escolhe a aba a mostrar: a pedida, se existir; senão, a primeira.
 * @param {string|undefined} requested Id da aba pedida ou lembrada.
 * @param {{id: string}[]} [tabs]
 */
export function resolveActiveTab(requested, tabs = SHEET_TABS) {
  return tabs.some((tab) => tab.id === requested) ? requested : tabs[0].id;
}

/**
 * Dados da navegação por abas.
 * @param {string} active Id da aba ativa (já validada por resolveActiveTab).
 * @param {(id: string) => string} label Devolve o nome traduzido da aba.
 * @returns {{list: {id: string, icon: string, label: string, active: boolean}[], state: Record<string, boolean>}}
 *   `list` alimenta os botões; `state` diz, por id, qual painel começa visível.
 */
export function buildTabs(active, label, tabs = SHEET_TABS) {
  return {
    list: tabs.map(({ id, icon }) => ({ id, icon, label: label(id), active: id === active })),
    state: Object.fromEntries(tabs.map(({ id }) => [id, id === active])),
  };
}

/** Aba que mostra um item recém-arrastado para a ficha (undefined se não houver). */
export function tabForItemType(type) {
  return {
    habilidade: 'habilidades',
    arma: 'equipamento',
    armadura: 'equipamento',
    item: 'equipamento',
  }[type];
}

/** Largura (0 a 100) do preenchimento de uma barra de recurso. */
export function resourcePercent(value, max) {
  if (!(max > 0)) return 0;
  return Math.round(Math.min(100, Math.max(0, (value / max) * 100)));
}

/**
 * Novo valor de PV/PD após os botões −/+ da ficha (edição crua, sem teste de lesão ou trauma).
 * Fica entre 0 e o máximo.
 * @param {{value: number, max: number}} resource
 * @param {number} delta
 */
export function stepResource(resource, delta) {
  return Math.min(resource.max, Math.max(0, resource.value + delta));
}

/** Contador de testes da cena (lesão ou trauma) após −/+; nunca abaixo de 0. */
export function stepCounter(current, delta) {
  return Math.max(0, current + delta);
}

/** Máximo de marcadores clicáveis de cada recurso de habilidade. */
export const PIP_MAX = { impeto: 5, analise: 4 };

/** Marcadores (bolinhas) de um recurso: `filled` para os que já estão preenchidos. */
export function buildPips(value, max) {
  return Array.from({ length: max }, (_, i) => ({ n: i + 1, filled: i + 1 <= value }));
}

/**
 * Valor do recurso depois de clicar no marcador `n`: clicar no último marcador preenchido
 * apaga-o; clicar em qualquer outro leva o recurso até ele.
 */
export function togglePip(current, n) {
  return n === current ? n - 1 : n;
}

const HEALTH_STATES = ['inconsciente', 'moribundo', 'morteLenta', 'contusao', 'morto'];
const MENTAL_STATES = ['estupor', 'colapso'];

/**
 * Etiquetas de estado do cabeçalho: condições ativas e o dado de pavor, se houver.
 * `tone` serve só para a cor (saude, mental, grave).
 * @param {Object} estado `system.estado` do personagem.
 * @param {Object} labels
 * @param {(key: string) => string} labels.stateLabel Nome traduzido do estado.
 * @param {(die: number) => string} labels.fearLabel Texto do pavor (ex.: "Pavor d6").
 */
export function buildStatusTags(estado, { stateLabel, fearLabel }) {
  const tags = [];
  for (const key of HEALTH_STATES) {
    if (estado[key])
      tags.push({ key, label: stateLabel(key), tone: key === 'morto' ? 'grave' : 'saude' });
  }
  for (const key of MENTAL_STATES) {
    if (estado[key]) tags.push({ key, label: stateLabel(key), tone: 'mental' });
  }
  if (estado.pavor > 0) {
    tags.push({ key: 'pavor', label: fearLabel(estado.pavor), tone: 'mental', die: estado.pavor });
  }
  return tags;
}

/** PV ou PD "baixo" (um quarto do máximo ou menos): a barra do cabeçalho muda de aparência. */
export function isResourceLow(value, max) {
  return max > 0 && value / max <= 0.25;
}

/** Texto sem acentos, em minúsculas e sem espaços nas pontas (para buscar sem depender da grafia). */
export function normalizeSearch(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();
}

/**
 * Diz se uma linha de perícia (ou aptidão) aparece com o filtro atual.
 * Todas as palavras digitadas precisam estar no texto da linha (nome e atributo).
 * @param {{search: string, die: number}} row `search` já normalizado por normalizeSearch.
 * @param {{text?: string, trained?: boolean}} filter `trained` esconde as destreinadas (d4).
 */
export function rowMatches(row, filter) {
  const words = normalizeSearch(filter.text).split(/\s+/).filter(Boolean);
  if (!words.every((word) => row.search.includes(word))) return false;
  if (filter.trained && !(row.die >= 6)) return false;
  return true;
}

/** Aplica rowMatches a uma lista de linhas. */
export function filterSkillRows(rows, filter) {
  return rows.filter((row) => rowMatches(row, filter));
}

/**
 * Lista de habilidades abertas depois de abrir ou recolher uma delas (sem repetir ids).
 * @param {Iterable<string>} current
 * @param {string} id
 * @param {boolean} open
 */
export function nextOpenIds(current, id, open) {
  const ids = new Set(current);
  if (open) ids.add(id);
  else ids.delete(id);
  return [...ids];
}
