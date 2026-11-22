/**
 * Preparação de dados para a ficha. Funções puras (sem Foundry), testadas em Node.
 */
import { ATRIBUTOS } from '../config.js';
import { DIE_STEPS } from '../rolls/dice.js';
import { extraKey } from '../rolls/extras.js';
import { RELATION_MAX_DEGREE, degreeKey, invokeCheck } from '../rolls/relation.js';
import {
  HANDS,
  armorSummary,
  handsInUse,
  handsOf,
  isMartial,
  isNatural,
  isShield,
  itemUseState,
  weaponReady,
  weaponSkill,
  weaponDamageLabel,
} from '../rolls/equipment.js';
import { itemUsePlan, ownEffects } from '../rolls/ability-effects.js';
import { normalizeSheetEffects } from '../rolls/effects.js';
import { abilityControls } from './ability-controls.js';
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
 * Direção em que um passo temporário mudou o dado: 'up' (dado maior), 'down' (menor) ou ''
 * (igual; inclui o caso de um dado que já estava no limite e não pôde se mover).
 * @param {number} base Dado base.
 * @param {number} shown Dado mostrado, já com os passos.
 */
export function shiftDirection(base, shown) {
  const from = Number(base);
  const to = Number(shown);
  if (to > from) return 'up';
  if (to < from) return 'down';
  return '';
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
      shiftDir: shiftDirection(attributes[key], shownDie(attributes[key], indicator)),
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
 * Campos do atributo-base de uma linha (perícia, aptidão ou ofício): qual atributo, o dado dele
 * (com passos), se foi alterado na ficha e as opções da lista de troca.
 * @param {Object} opts
 * @param {string} opts.attrKey Atributo usado (já resolvido: escolha da ficha ou padrão).
 * @param {string} opts.defaultKey Atributo padrão da perícia.
 * @param {(key: string) => string} opts.attrLabel Nome traduzido de um atributo.
 * @param {(defaultKey: string) => string} [opts.defaultLabel] Texto da opção "padrão".
 * @param {Record<string, number>} [opts.attributeDice] Dados dos atributos.
 * @param {(key: string) => object} [opts.attrStepOf] `stepIndicator` de cada atributo.
 */
export function buildAttributeFields({
  attrKey,
  defaultKey,
  attrLabel,
  defaultLabel,
  attributeDice,
  attrStepOf,
}) {
  const base = attributeDice ? Number(attributeDice[attrKey]) : undefined;
  const shown = base === undefined ? undefined : shownDie(base, attrStepOf?.(attrKey));
  const overridden = attrKey !== defaultKey;
  return {
    attrKey,
    attrLabel: attrLabel(attrKey),
    attrDie: base,
    attrShownDie: shown,
    attrShifted: base !== undefined && shown !== base,
    attrShiftDir: base === undefined ? '' : shiftDirection(base, shown),
    attrOverridden: overridden,
    attrDefaultLabel: attrLabel(defaultKey),
    attrOptions: [
      {
        value: '',
        label: defaultLabel ? defaultLabel(defaultKey) : attrLabel(defaultKey),
        selected: !overridden,
      },
      ...ATRIBUTOS.map((key) => ({
        value: key,
        label: attrLabel(key),
        selected: overridden && key === attrKey,
      })),
    ],
  };
}

/** Atributo escolhido na ficha se for válido; senão, o padrão. */
function chosenOrDefault(chosen, defaultKey) {
  return ATRIBUTOS.includes(chosen) ? chosen : defaultKey;
}

/**
 * Linhas da lista de perícias, em ordem alfabética pelo nome traduzido.
 * @param {Record<string, number>} skills Dados das perícias do personagem.
 * @param {Record<string, string>} skillAttributes Perícia -> atributo-base padrão.
 * @param {Object} labels
 * @param {(key: string) => string} labels.skillLabel
 * @param {(key: string) => string} labels.attrLabel
 * @param {(defaultKey: string) => string} [labels.defaultLabel] Texto da opção "padrão".
 * @param {Record<string, number>} [labels.attributeDice] Dados dos atributos (para mostrar o
 *   dado do atributo-base ao lado do dado da perícia).
 * @param {(key: string) => object} [labels.attrStepOf] `stepIndicator` de cada atributo.
 * @param {object} [labels.skillStep] `stepIndicator` do dado geral das perícias.
 * @param {Record<string, string>} [labels.attrChoices] Perícia -> atributo escolhido na ficha
 *   (vazio ou ausente = padrão).
 * @param {Object<string, {steps: number, sources: string[]}>} [labels.penalties] Penalidades
 *   passivas das armaduras em uso (`armorSkillPenalties`): o dado mostrado já desce, junto com o
 *   passo manual (um único total; a escada para em d4 e d12, então nunca passa de d12).
 * @param {(entry: {steps: number, sources: string[]}) => string} [labels.penaltyLabel] Texto da
 *   dica da penalidade (quais armaduras, quantos passos).
 */
export function buildSkillRows(
  skills,
  skillAttributes,
  {
    skillLabel,
    attrLabel,
    defaultLabel,
    attributeDice,
    attrStepOf,
    skillStep,
    attrChoices,
    penalties = {},
    penaltyLabel = () => '',
  },
) {
  return Object.entries(skillAttributes)
    .map(([key, defaultKey]) => {
      const attrKey = chosenOrDefault(attrChoices?.[key], defaultKey);
      const attr = buildAttributeFields({
        attrKey,
        defaultKey,
        attrLabel,
        defaultLabel,
        attributeDice,
        attrStepOf,
      });
      // Passos da perícia: o manual (geral) menos a penalidade das armaduras, somados antes de
      // mexer no dado (d12 −1 da armadura +1 manual = d12)
      const penalty = penalties[key];
      const net = (skillStep?.net ?? 0) - (penalty?.steps ?? 0);
      const shown = shownDie(skills[key], { net });
      return {
        key,
        label: skillLabel(key),
        ...attr,
        die: Number(skills[key]),
        shownDie: shown,
        shifted: shown !== Number(skills[key]),
        shiftDir: shiftDirection(skills[key], shown),
        // Dica no dado: de onde vem a redução (vazio sem penalidade)
        penaltyNote: penalty?.steps ? penaltyLabel(penalty) : '',
        trained: Number(skills[key]) >= 6,
        search: normalizeSearch(`${skillLabel(key)} ${attr.attrLabel}`),
        options: dieOptions(skills[key]),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
}

/**
 * Acrescenta o atributo-base a linhas de aptidão ou de ofício (do livro ou extras).
 * @param {object[]} rows Linhas de buildAreaRows ou buildExtraRows.
 * @param {Object} opts
 * @param {(row: object) => string} opts.chosenOf Atributo escolhido na ficha para a linha.
 * @param {string} [opts.defaultKey='mente'] Atributo padrão (aptidões e ofícios usam Mente).
 * @param {(key: string) => string} opts.attrLabel
 * @param {(defaultKey: string) => string} [opts.defaultLabel]
 * @param {Record<string, number>} [opts.attributeDice]
 * @param {(key: string) => object} [opts.attrStepOf]
 */
export function addRowAttributes(
  rows,
  { chosenOf, defaultKey = 'mente', attrLabel, defaultLabel, attributeDice, attrStepOf },
) {
  return rows.map((row) => ({
    ...row,
    ...buildAttributeFields({
      attrKey: chosenOrDefault(chosenOf(row), defaultKey),
      defaultKey,
      attrLabel,
      defaultLabel,
      attributeDice,
      attrStepOf,
    }),
  }));
}

/**
 * Linhas das áreas de Aptidão ou de Ofício (mesmo formato dos atributos: um dado por área).
 * @param {Record<string, number>} aptitudes Ex.: { erudicao: 6, ... }
 * @param {string[]} keys Chaves das áreas, na ordem de exibição.
 * @param {(key: string) => string} label Devolve o nome traduzido.
 */
export function buildAreaRows(aptitudes, keys, label, skillStep) {
  return buildAttributeRows(aptitudes, keys, label, skillStep ? () => skillStep : undefined);
}

/**
 * Linhas das áreas extras de Aptidão ou de Ofício (criadas pelo jogador).
 * Mesmo formato das áreas do livro, mais `id`, `index`, `nome` (o texto digitado) e `group`.
 * A `key` é a chave de teste (`aptidao:<id>` ou `oficio:<id>`). Se o nome estiver vazio, o
 * `label` mostra `emptyLabel`, mas `nome` continua vazio (é o que vai no campo de texto).
 * @param {{id: string, nome: string, dado: number}[]} extras
 * @param {string} group `aptidao` ou `oficio`.
 * @param {Object} opts
 * @param {string} opts.emptyLabel Texto para áreas sem nome.
 * @param {object} [opts.skillStep] `stepIndicator` do dado geral das perícias.
 */
export function buildExtraRows(extras, group, { emptyLabel, skillStep }) {
  const dice = Object.fromEntries(extras.map((extra) => [extra.id, extra.dado]));
  const names = Object.fromEntries(extras.map((extra) => [extra.id, extra.nome || emptyLabel]));
  const rows = buildAttributeRows(
    dice,
    extras.map((extra) => extra.id),
    (id) => names[id],
    skillStep ? () => skillStep : undefined,
  );
  return rows.map((row, index) => ({
    ...row,
    id: row.key,
    key: extraKey(group, row.key),
    group,
    index,
    nome: extras[index].nome,
    atributo: extras[index].atributo ?? '',
  }));
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
 * Opções do seletor do dado de pavor (0 = sem pavor, d4 a d12 e d20).
 * @param {number} current Dado de pavor atual.
 * @param {string} noneLabel Texto de "sem pavor".
 */
export function buildFearChoices(current, noneLabel) {
  return [0, 4, 6, 8, 10, 12, 20].map((value) => ({
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
 * Linhas dos efeitos da aba Condição (formato de rolls/effects.js), na versão compacta da v0.22.1:
 * nome, resumo dos passos, duração, origem e descrição. A edição é feita na janela do efeito
 * (botão ✎), não na linha.
 * @param {object[]} effects `system.efeitos` (formato novo ou antigo: tudo passa pela limpeza).
 * @param {Object} options
 * @param {(entry: object) => string} options.describe Resumo de um efeito do catálogo.
 * @param {(duracao: string) => string} options.durationLabel Nome traduzido da duração.
 * @param {string} [options.noStepsLabel] Texto do efeito sem passos (só nome e descrição).
 * @param {boolean} [options.editable=true]
 */
export function buildEffectRows(
  effects,
  { describe, durationLabel, noStepsLabel = '', editable = true },
) {
  return normalizeSheetEffects(effects).map((effect, index) => ({
    index,
    id: effect.id,
    nome: effect.nome,
    descricao: effect.descricao,
    duracao: effect.duracao,
    durationLabel: durationLabel(effect.duracao),
    // Um resumo por efeito do catálogo («−1 passo(s) no dado de Físico; ...»)
    summary: effect.efeitos.length
      ? effect.efeitos.map((entry) => describe(entry)).join('; ')
      : noStepsLabel,
    locked: !editable,
    // Criado por uma habilidade (passo condicional): a etiqueta diz «Habilidade», e o efeito
    // some sozinho quando a condição deixa de valer
    fromAbility: String(effect.origem ?? '').startsWith('hab:'),
  }));
}

/**
 * O texto da busca combina com este item da lista? A busca ignora acentos e maiúsculas e vale em
 * qualquer parte do texto (vazia combina com tudo).
 * @param {string} search Texto já normalizado do item (`normalizeSearch`).
 * @param {string} query O que a pessoa digitou.
 */
export function matchesSearch(search, query) {
  const wanted = normalizeSearch(query);
  return !wanted || String(search ?? '').includes(wanted);
}

/**
 * Grupos da lista «Do compêndio»: os Items de efeito encontrados, agrupados pela fonte (o mundo ou
 * cada compêndio) e, dentro dela, ordenados pela pasta e pelo nome. Cada entrada traz o texto de
 * busca (nome, pasta e fonte, sem acento) para filtrar enquanto se digita.
 * @param {{uuid: string, name: string, source: string, folder?: string, summary?: string}[]} list
 * @returns {{source: string, entries: object[]}[]}
 */
export function buildEffectPicker(list) {
  const groups = new Map();
  for (const entry of list ?? []) {
    const source = entry.source ?? '';
    if (!groups.has(source)) groups.set(source, []);
    groups.get(source).push({
      uuid: entry.uuid,
      name: entry.name ?? '',
      folder: entry.folder ?? '',
      summary: entry.summary ?? '',
      search: normalizeSearch(`${entry.name ?? ''} ${entry.folder ?? ''} ${source}`),
    });
  }
  const byText = (a, b) => a.localeCompare(b, 'pt-BR');
  return [...groups]
    .map(([source, entries]) => ({
      source,
      entries: entries.sort((a, b) => byText(a.folder, b.folder) || byText(a.name, b.name)),
    }))
    .sort((a, b) => byText(a.source, b.source));
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
 * @param {(category: string) => string} [options.categoryLabel] Nome da categoria da arma.
 * @param {(item: Object) => string} [options.effectsText] Resumo dos efeitos do item, um por
 *   linha (mostrado embaixo do nome); vazio = sem efeitos.
 * @param {boolean} [options.proficient=true] O personagem tem proficiência marcial (sem ela, a
 *   caixa de equipar das armas, armaduras e escudos marciais fica travada).
 * @param {{extra?: number, extraSpent?: number}} [options.armorBonus] Armadura extra (pontos e
 *   gastos), somada no resumo de pontos.
 * @param {(kind: string, category: string) => string} [options.armorKindLabel] Rótulo do
 *   subtipo com a categoria já traduzida («Armadura marcial», «Escudo simples»).
 * @param {boolean} [options.editable=true]
 */
export function buildEquipmentRows(items, {
  kindLabel,
  handsLabel,
  skillLabel,
  categoryLabel = (category) => category,
  effectsText = () => '',
  proficient = true,
  armorBonus = {},
  armorKindLabel = (kind, category) => `${kind} ${category}`,
  editable = true,
}) {
  const of = (type) => items.filter((item) => item.type === type);
  const weapons = of('arma');
  const armors = of('armadura');
  const others = of('item');
  // Mãos: armas, itens e escudos empunhados
  const shields = armors.filter((a) => isShield(a.system));
  const hands = handsInUse([...weapons, ...others, ...shields].map((i) => i.system));
  const shieldHeld = shields.some((a) => a.system.empunhada);
  // Equipar fica bloqueado se o item não está equipado e não cabe
  const cannotHold = (system) => !system.empunhada && hands.used + handsOf(system) > HANDS;
  // Resumo dos efeitos, uma linha por efeito (fica visível embaixo do nome, sem passar o mouse)
  const effectLines = (item) => String(effectsText(item) ?? '').split('\n').filter(Boolean);
  return {
    weapons: weapons.map((item) => {
      const { id, name, system } = item;
      const natural = isNatural(system);
      // Marcial sem proficiência: não pode ser empunhada (se já estiver, só um aviso na linha)
      const lacksProficiency = isMartial(system) && !proficient;
      return {
        id,
        name,
        descricao: system.descricao,
        effects: effectLines(item),
        kindLabel: kindLabel(system.tipo),
        categoryLabel: categoryLabel(system.categoria),
        handsLabel: handsLabel(handsOf(system)),
        damageLabel: weaponDamageLabel(system.bonusDano, system.baseDano),
        skillLabel: skillLabel(weaponSkill(system)),
        empunhada: system.empunhada,
        naoLetal: system.naoLetal,
        // Arma natural: sem caixa de empunhar (não ocupa as mãos)
        natural,
        // Arma de arremesso: quantidade na linha; sem unidades, o Atacar fica desativado
        consumivel: Boolean(system.consumivel),
        quantidade: system.quantidade ?? 0,
        canAttack: editable && weaponReady(system),
        lacksProficiency,
        // Caixa de empunhar: desativada se não cabe ou se falta proficiência (só para empunhar;
        // uma arma já empunhada sempre pode ser guardada)
        blockReason: system.empunhada
          ? null
          : lacksProficiency
            ? 'proficiencia'
            : !natural && cannotHold(system)
              ? 'maos'
              : null,
        locked: !editable,
        blocked:
          !editable ||
          (!system.empunhada && (lacksProficiency || (!natural && cannotHold(system)))),
      };
    }),
    armors: armors.map((item) => {
      const { id, name, system } = item;
      const shield = isShield(system);
      const lacksProficiency = isMartial(system) && !proficient;
      // Equipado: escudo empunhado ou armadura vestida (várias armaduras podem ser vestidas)
      const equipped = shield ? Boolean(system.empunhada) : Boolean(system.vestida);
      const blockReason = equipped
        ? null
        : lacksProficiency
          ? 'proficiencia'
          : shield && shieldHeld
            ? 'escudo'
            : shield && cannotHold(system)
              ? 'maos'
              : null;
      return {
        id,
        name,
        descricao: system.descricao,
        effects: effectLines(item),
        shield,
        kindLabel: armorKindLabel(
          system.subtipo ?? 'armadura',
          categoryLabel(system.categoria ?? 'simples'),
        ),
        pontos: system.pontos,
        restantes: Math.max(0, Math.min(system.restantes, system.pontos)),
        vestida: system.vestida,
        empunhada: Boolean(system.empunhada),
        // Campo da caixa de equipar na linha: vestida (armadura) ou empunhada (escudo)
        equipField: shield ? 'empunhada' : 'vestida',
        equipped,
        lacksProficiency,
        blockReason,
        locked: !editable,
        blocked: !editable || blockReason !== null,
      };
    }),
    others: others.map((item) => {
      const { id, name, system } = item;
      // Efeitos de uso (cura, passo no alvo, ação com aviso): o botão Usar aparece mesmo sem limite
      const useState = itemUseState(system, itemUsePlan(ownEffects(item)).hasUse);
      return {
        id,
        name,
        descricao: system.descricao,
        effects: effectLines(item),
        quantidade: system.quantidade,
        usos: system.usos,
        usosMax: system.usosMax,
        hasUsos: system.usosMax > 0,
        handsLabel: handsLabel(handsOf(system)),
        empunhada: system.empunhada,
        showUse: useState.show,
        canUse: editable && useState.canUse,
        locked: !editable,
        blocked: !editable || cannotHold(system),
      };
    }),
    hands,
    armorTotals: armorSummary(
      armors.map((a) => a.system),
      armorBonus,
    ),
  };
}

/** Opções de um seletor simples (valor, texto e marca do atual). */
export function buildChoices(values, current, label) {
  return values.map((value) => ({ value, label: label(value), selected: value === current }));
}

/**
 * Linhas das habilidades da ficha: a de perfil primeiro, depois as outras por nome. Cada linha
 * traz os contadores dos recursos e os botões dos efeitos da habilidade (os da lista ou, com a
 * lista vazia, os equivalentes à automação antiga): veja `abilityControls`.
 * @param {{id: string, name: string, system: Object}[]} items Habilidades do personagem.
 * @param {Object} options
 * @param {Object<string, number>} options.resources Valores guardados dos recursos das habilidades.
 * @param {boolean} options.hurtCompanion O animal está ferido nesta cena.
 * @param {boolean} [options.editable=true]
 * @param {Function} [options.t] Tradução (nos testes, a própria chave).
 * @param {(key: string) => string} [options.skill] Nome de uma perícia.
 */
export function buildAbilityRows(
  items,
  {
    resources,
    hurtCompanion,
    editable = true,
    openIds = [],
    t = (key) => key,
    skill = (key) => key
  }
) {
  const rows = items.map((item) => {
    const { id, name, system } = item;
    const controls = abilityControls(item, resources ?? {}, { t, skill });
    return {
      id,
      name,
      descricao: system.descricao,
      perfil: system.perfil,
      locked: !editable,
      open: openIds.includes(id),
      counters: controls.counters,
      buttons: controls.buttons,
      showCompanion: controls.showCompanion,
      animalFerido: hurtCompanion
    };
  });
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
 * Diz se uma linha de perícia (ou aptidão ou ofício) aparece com o filtro atual.
 * Todas as palavras digitadas precisam estar no texto da linha (nome e atributo).
 * @param {{search: string}} row `search` já normalizado por normalizeSearch.
 * @param {{text?: string}} filter
 */
export function rowMatches(row, filter) {
  const words = normalizeSearch(filter.text).split(/\s+/).filter(Boolean);
  return words.every((word) => row.search.includes(word));
}

/** Aplica rowMatches a uma lista de linhas. */
export function filterSkillRows(rows, filter) {
  return rows.filter((row) => rowMatches(row, filter));
}

/** Modos de ordenação das perícias: pelo nome (A→Z) ou pelo dado (do maior para o menor). */
export const SKILL_SORT_MODES = Object.freeze(['nome', 'dado']);
export const DEFAULT_SKILL_SORT = 'nome';

/** Devolve o modo se for válido; qualquer outra coisa vira o padrão (nome). */
export function normalizeSkillSort(mode) {
  return SKILL_SORT_MODES.includes(mode) ? mode : DEFAULT_SKILL_SORT;
}

// Compara textos em português, ignorando maiúsculas e acentos ("Ofício" fica junto de "Oficio").
const nameCollator = new Intl.Collator('pt-BR', { sensitivity: 'base' });

/**
 * Posição de cada linha de uma lista depois de ordenada (sem mexer na lista).
 * - Modo `nome`: nome de A a Z.
 * - Modo `dado`: dado final do maior para o menor; empate: dado do atributo-base (maior
 *   primeiro); se continuar empatado, o nome de A a Z.
 * Em empate total vale a posição original, então o resultado é sempre estável.
 * @param {{label: string, die?: number, attrDie?: number}[]} rows `die` e `attrDie` são os
 *   dados finais mostrados na ficha (com passos e efeitos). Dado ausente conta como 0.
 * @param {string} mode `nome` ou `dado` (outro valor usa `nome`).
 * @returns {number[]} `order[i]` é a posição (0, 1, 2…) da linha `rows[i]`.
 */
export function skillRowOrder(rows, mode) {
  const number = (value) => Number(value) || 0;
  const byName = (a, b) => nameCollator.compare(a.row.label, b.row.label);
  const byDie = (a, b) =>
    number(b.row.die) - number(a.row.die) ||
    number(b.row.attrDie) - number(a.row.attrDie) ||
    byName(a, b);
  const compare = normalizeSkillSort(mode) === 'dado' ? byDie : byName;

  const sorted = rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => compare(a, b) || a.index - b.index);
  const order = new Array(rows.length);
  sorted.forEach(({ index }, position) => {
    order[index] = position;
  });
  return order;
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
