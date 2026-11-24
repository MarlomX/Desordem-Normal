/**
 * Linhas da ficha: atributos, perícias, áreas, extras, pavor, relações e efeitos.
 * Parte de `context.js` (v0.28.7). Lógica pura, sem Foundry.
 */
import { ATRIBUTOS } from '../../config.js';
import { DIE_STEPS } from '../../rolls/dice.js';
import { extraKey } from '../../rolls/extras.js';
import { RELATION_MAX_DEGREE, degreeKey, invokeCheck } from '../../rolls/relation.js';
import { normalizeSheetEffects } from '../../rolls/effects.js';
import { formatStepSources, shownDie, stepLimits } from '../../rolls/steps.js';
import { normalizeSearch } from './tabs.js';

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
 * @param {{manual: string, unnamed?: string}} [stepLabels] Nomes do passo manual e de um efeito
 *   sem nome, para o texto das origens dos passos (`stepSources`, v0.23.1).
 */
export function buildAttributeRows(attributes, keys, label, stepOf, stepLabels = { manual: '' }) {
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
      // Um aumento e uma redução que se anulam: o dado parece o base, mas está sendo mexido
      stepBalanced: indicator?.balanced ?? false,
      // De onde vem cada passo (dica da ficha): «Manual −1 · Ímpeto +1»
      stepSources: formatStepSources(indicator?.sources ?? [], stepLabels),
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
  const indicator = attrStepOf?.(attrKey);
  const shown = base === undefined ? undefined : shownDie(base, indicator);
  const overridden = attrKey !== defaultKey;
  return {
    attrKey,
    attrLabel: attrLabel(attrKey),
    attrDie: base,
    attrShownDie: shown,
    attrShifted: base !== undefined && shown !== base,
    attrShiftDir: base === undefined ? '' : shiftDirection(base, shown),
    // O atributo tem passos dos dois lados que se anulam (o dado mostrado é o base)
    attrBalanced: base !== undefined && Boolean(indicator?.balanced),
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
 * @param {{manual: string}} [labels.stepLabels] Nome do passo manual, para a dica do dado quando
 *   o passo manual e a penalidade das armaduras aparecem juntos (v0.23.1).
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
    stepLabels = { manual: '' },
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
      const manual = skillStep?.net ?? 0;
      const penaltySteps = penalty?.steps ?? 0;
      const net = manual - penaltySteps;
      const shown = shownDie(skills[key], { net });
      // Dica do dado: a penalidade das armaduras e, se houver, o passo manual junto
      let penaltyNote = penaltySteps ? penaltyLabel(penalty) : '';
      if (penaltySteps && manual) {
        const manualNote = formatStepSources([{ kind: 'manual', steps: manual }], stepLabels);
        penaltyNote = `${manualNote} · ${penaltyNote}`;
      }
      return {
        key,
        label: skillLabel(key),
        ...attr,
        die: Number(skills[key]),
        shownDie: shown,
        shifted: shown !== Number(skills[key]),
        shiftDir: shiftDirection(skills[key], shown),
        // Passo manual para cima anulado pela penalidade das armaduras (o dado parece o base)
        stepBalanced: manual > 0 && penaltySteps > 0 && net === 0,
        // Dica no dado: de onde vêm os passos (vazio sem penalidade)
        penaltyNote,
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
 * @param {(effect: object) => {nome: string, descricao: string, kind: string}} [options.text]
 *   Nome e descrição para mostrar (as lesões e traumas das tabelas vêm traduzidos pela chave) e
 *   a tabela de onde o efeito veio (`lesao`, `trauma` ou vazio). Sem ela, os do próprio efeito.
 */
export function buildEffectRows(
  effects,
  { describe, durationLabel, noStepsLabel = '', editable = true, text },
) {
  return normalizeSheetEffects(effects).map((effect, index) => {
    const shown = text?.(effect) ?? { nome: effect.nome, descricao: effect.descricao, kind: '' };
    const fromAbility = String(effect.origem ?? '').startsWith('hab:');
    return {
      index,
      id: effect.id,
      nome: shown.nome,
      descricao: shown.descricao,
      duracao: effect.duracao,
      durationLabel: durationLabel(effect.duracao),
      // Um resumo por efeito do catálogo («−1 passo(s) no dado de Físico; ...»)
      summary: effect.efeitos.length
        ? effect.efeitos.map((entry) => describe(entry)).join('; ')
        : noStepsLabel,
      locked: !editable,
      // Criado por uma habilidade (passo condicional): a etiqueta diz «Habilidade», e o efeito
      // some sozinho quando a condição deixa de valer
      fromAbility,
      // Etiqueta da origem: Lesão, Trauma (pela chave), Habilidade ou Efeito
      origin: shown.kind || (fromAbility ? 'habilidade' : 'efeito'),
      // Chave de idioma da etiqueta (`DESORDEM.Ficha.EfeitoOrigem.<origem>`)
      originKey: `DESORDEM.Ficha.EfeitoOrigem.${shown.kind || (fromAbility ? 'habilidade' : 'efeito')}`,
    };
  });
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
