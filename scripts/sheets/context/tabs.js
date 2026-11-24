/**
 * Abas, barras de recurso, etiquetas de estado, busca e ordem das perícias, habilidades
 * abertas.
 * Parte de `context.js` (v0.28.7). Lógica pura, sem Foundry.
 */

/** Abas da ficha, na ordem de exibição (`icon` é uma classe do Font Awesome). */
export const SHEET_TABS = [
  { id: 'testes', icon: 'fa-dice-d20' },
  { id: 'habilidades', icon: 'fa-bolt' },
  { id: 'equipamento', icon: 'fa-shield-halved' },
  { id: 'condicao', icon: 'fa-heart-pulse' },
  { id: 'relacoes', icon: 'fa-people-arrows' },
  // Descrição, história e anotações do personagem (v0.23.2)
  { id: 'notas', icon: 'fa-book-open' },
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
