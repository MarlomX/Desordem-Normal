/**
 * Janela «Responder ao teste oposto» (v0.25.4): abas Personagens/Criaturas, lista com retrato e
 * busca por nome. Aqui ficam as decisões, em funções puras (tests/opposed-picker.test.js); o
 * desenho e os cliques ficam em `opposed-chat.js` e `templates/dialog/oposto-ator.hbs`.
 */
import { normalizeSearch } from '../sheets/context.js';
import { OPPOSED_ACTOR_TYPES } from './candidates.js';

/** A busca por nome aparece a partir desta quantidade de atores na janela. */
export const PICKER_SEARCH_MIN = 10;

/**
 * Aba que abre primeiro: a do tipo oposto ao de quem propôs (personagem propôs, abre Criaturas;
 * criatura propôs, abre Personagens). Se ela não existir, a primeira aba que tiver atores.
 * @param {string[]} types Tipos com atores, na ordem das abas.
 * @param {string|null} proposerType Tipo do ator do outro lado.
 * @returns {string|null}
 */
export function firstTab(types, proposerType) {
  const opposite = { personagem: 'criatura', criatura: 'personagem' }[proposerType];
  return types.includes(opposite) ? opposite : (types[0] ?? null);
}

/**
 * Dados da janela: uma aba por tipo com atores (Personagens antes de Criaturas), a lista de cada
 * uma na ordem recebida (selecionados, cena, resto do mundo) e o primeiro ator da aba ativa já
 * marcado.
 * @param {{uuid: string, name: string, img?: string, type: string}[]} candidates
 * @param {object} options
 * @param {string|null} [options.proposerType] Tipo do ator do outro lado.
 * @param {(type: string, count: number) => string} [options.label] Nome da aba («Criaturas (3)»).
 * @returns {{tabs: object[], activeType: string|null, showTabs: boolean, showSearch: boolean}}
 */
export function pickerModel(candidates, { proposerType = null, label = (type) => type } = {}) {
  const groups = OPPOSED_ACTOR_TYPES.map((type) => ({
    type,
    actors: candidates.filter((actor) => actor.type === type),
  })).filter((group) => group.actors.length);
  const activeType = firstTab(
    groups.map((group) => group.type),
    proposerType,
  );
  const tabs = groups.map((group) => {
    const active = group.type === activeType;
    return {
      type: group.type,
      label: label(group.type, group.actors.length),
      active,
      actors: group.actors.map((actor, index) => ({
        uuid: actor.uuid,
        name: actor.name,
        img: actor.img ?? '',
        // Nome sem acento e em minúsculas, para a busca comparar sem depender da grafia
        search: normalizeSearch(actor.name),
        checked: active && index === 0,
      })),
    };
  });
  return {
    tabs,
    activeType,
    showTabs: tabs.length > 1,
    showSearch: candidates.length >= PICKER_SEARCH_MIN,
  };
}

/**
 * Se um nome (já normalizado) passa na busca: todas as palavras digitadas precisam estar nele.
 * Busca vazia mostra todos.
 * @param {string} search Nome normalizado (`data-busca` da linha).
 * @param {string} query O que foi digitado.
 * @returns {boolean}
 */
export function matchesName(search, query) {
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean);
  return words.every((word) => search.includes(word));
}
