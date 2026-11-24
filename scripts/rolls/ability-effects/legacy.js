/**
 * Habilidades antigas (até a 0.19.x): os efeitos equivalentes ao campo `automacao`.
 * Parte de `ability-effects.js` (v0.28.7). Lógica pura, sem Foundry.
 */
import {
  ANALISE_GAIN,
  ANALISE_MAX,
  CONDITION_ONLY_TYPES,
  COSTS,
  EFFECT_TYPES,
  EQUIPMENT_ONLY_TYPES,
  IMPETO_MAX,
  SNEAK_SKILLS,
  normalizeEffect,
  normalizeEffects,
} from './catalog.js';

// ---------- Habilidades antigas ----------

const effect = (id, tipo, params) => normalizeEffect({ id, tipo, params });
const pdCost = (valor) => ({ tipo: 'pd', valor });
const resourceCost = (recurso, valor) => ({ tipo: 'recurso', recurso, valor });

/**
 * Efeitos equivalentes a uma automação antiga (campo `automacao` dos itens até a 0.19.x). Os ids
 * são fixos: os efeitos de uma mesma automação têm sempre o mesmo id.
 * @param {string} key
 * @returns {object[]}
 */
export function legacyEffects(key) {
  switch (key) {
    case 'impeto':
      return [
        effect('impetoBarra', 'recurso', { chave: 'impeto', maximo: IMPETO_MAX, esvazia: true }),
        effect('impetoFalha', 'ganharRecurso', { recurso: 'impeto', gatilho: 'falha' }),
        effect('impetoOposto', 'ganharRecurso', { recurso: 'impeto', gatilho: 'perdeOposto' }),
        effect('impetoDado', 'dadoExtra', {
          dado: 4,
          custo: resourceCost('impeto', COSTS.impetoDado),
        }),
        effect('impetoPasso', 'passoCena', { custo: resourceCost('impeto', COSTS.impetoPasso) }),
        effect('impetoAcao', 'acaoNota', { custo: resourceCost('impeto', COSTS.impetoAcao) }),
      ];
    case 'impetoInicial':
      return [
        effect('impetoInicial', 'ganharRecurso', { recurso: 'impeto', gatilho: 'inicioCena' }),
      ];
    case 'analise':
      return [
        effect('analiseMarcadores', 'recurso', {
          chave: 'analise',
          maximo: ANALISE_MAX,
          esvazia: true,
        }),
        effect('analisar', 'ganharRecurso', {
          recurso: 'analise',
          quantidade: ANALISE_GAIN,
          gatilho: 'acao',
        }),
        effect('analiseAjuste', 'ajusteDados', { recurso: 'analise' }),
      ];
    case 'prontidao':
      return [effect('prontidao', 'rerrolar', { custo: pdCost(COSTS.prontidao) })];
    case 'esquiva':
      return [effect('esquiva', 'defesaLivre', { pericia: 'acrobacia' })];
    case 'companheiro':
      return [effect('companheiro', 'companheiro', { dado: 6, teste: 'ataqueCorpo' })];
    case 'curandeiro':
      return [
        effect('curandeiro', 'testeAcao', {
          custo: pdCost(COSTS.curandeiro),
          pericia: 'medicina',
          dt: 7,
          resultado: 'curarPV',
        }),
      ];
    case 'sorrateiro':
      return [
        effect('sorrateiro', 'dadoExtra', {
          dado: 8,
          pericias: [...SNEAK_SKILLS],
          custo: pdCost(COSTS.sorrateiro),
        }),
      ];
    default:
      return [];
  }
}

/**
 * Efeitos de uma habilidade: os da lista, ou, se a lista estiver vazia, os equivalentes à
 * automação antiga.
 * @param {{efeitos?: object[], automacao?: string}} system `item.system`.
 */
export function itemEffects(system) {
  const own = normalizeEffects(system?.efeitos);
  return own.length ? own : legacyEffects(system?.automacao ?? '');
}

/**
 * Tipos de efeito que cada tipo de equipamento aceita (a habilidade aceita todos). A lista cresce
 * a cada versão da série 0.21.x; um efeito de tipo fora da lista do item é ignorado (pode ter
 * vindo de uma macro ou de uma importação) e o editor não o oferece.
 */
export const ITEM_EFFECT_TYPES = Object.freeze({
  // Efeitos dos ataques com a arma
  arma: Object.freeze(['dadoExtra', 'bonusAtaque', 'passoAtaque', 'criticoAmpliado']),
  // Dado extra enquanto vestida (a penalidade nas perícias é um campo da armadura, não um efeito)
  armadura: Object.freeze(['dadoExtra']),
  // Escudo (subtipo da armadura): dado extra e redução do escudo, enquanto empunhado
  escudo: Object.freeze(['dadoExtra', 'reducaoEscudo']),
  // Item geral: dado extra e ferramenta (passivos, na mochila); cura, passo no alvo e ação com
  // aviso (ao usar)
  item: Object.freeze([
    'dadoExtra',
    'curar',
    'passoAlvo',
    'ferramenta',
    'acaoNota',
    'concederDado',
    'municao',
  ]),
  // Efeito da aba Condição (lista `system.efeitos` do ator): por enquanto, só passos
  efeito: Object.freeze(['passo', 'modificador', 'danoEmocionalExtra', 'reducaoMaximo']),
});

/**
 * Tipos de efeito que um item aceita: na habilidade, todos menos os de equipamento
 * (`EQUIPMENT_ONLY_TYPES`); num equipamento, a lista de `ITEM_EFFECT_TYPES`; num tipo
 * desconhecido, nenhum.
 * @param {string} itemType `arma`, `armadura`, `escudo`, `item` ou `habilidade` (veja
 *   `effectItemType`).
 * @returns {string[]}
 */
export function itemEffectTypes(itemType) {
  if (itemType === 'habilidade') {
    return Object.keys(EFFECT_TYPES).filter(
      (tipo) => !EQUIPMENT_ONLY_TYPES.includes(tipo) && !CONDITION_ONLY_TYPES.includes(tipo),
    );
  }
  return [...(ITEM_EFFECT_TYPES[itemType] ?? [])];
}

/**
 * Tipo do item para os efeitos: o próprio tipo, menos o escudo (subtipo da armadura), que tem os
 * seus tipos de efeito (`escudo`).
 * @param {{type: string, system?: object}} item
 */
export function effectItemType(item) {
  if (item?.type === 'armadura' && item.system?.subtipo === 'escudo') return 'escudo';
  return item?.type;
}

/**
 * O item está em uso, de modo que os seus efeitos valem agora?
 * - habilidade: sempre;
 * - arma: só no ataque com ela (`weaponId` igual ao id dela);
 * - armadura: só vestida; escudo: só empunhado;
 * - item geral: sempre (basta estar na ficha, «na mochila»).
 * @param {{id: string, type: string, system: object}} item
 * @param {{weaponId?: string|null}} [context] Arma do ataque que está sendo feito, se houver.
 */
export function itemInUse(item, { weaponId = null } = {}) {
  switch (item?.type) {
    case 'habilidade':
    case 'item':
      return true;
    case 'arma':
      return Boolean(weaponId) && item.id === weaponId;
    case 'armadura':
      return item.system?.subtipo === 'escudo'
        ? Boolean(item.system?.empunhada)
        : Boolean(item.system?.vestida);
    default:
      return false;
  }
}

/**
 * Efeitos de um item, já filtrados pelos tipos que ele aceita. Na habilidade, com a lista vazia,
 * os equivalentes à automação antiga (`itemEffects`).
 * @param {{type: string, system: object}} item
 */
export function ownEffects(item) {
  if (item?.type === 'habilidade') return itemEffects(item.system);
  const allowed = itemEffectTypes(effectItemType(item));
  return normalizeEffects(item?.system?.efeitos).filter((e) => allowed.includes(e.tipo));
}

/**
 * Efeitos de um ator: os das habilidades e os dos equipamentos em uso (`itemInUse`), cada um com
 * o item de onde veio (`itemId`, `itemName`, `itemType`).
 * @param {Iterable<{id: string, name: string, type: string, system: object}>} items
 * @param {{weaponId?: string|null}} [context] Arma do ataque que está sendo feito, se houver.
 * @returns {{itemId: string, itemName: string, itemType: string, id: string, tipo: string,
 *   params: object}[]}
 */
export function collectEffects(items, context = {}) {
  const list = [];
  for (const item of items ?? []) {
    if (!itemInUse(item, context)) continue;
    for (const entry of ownEffects(item)) {
      list.push({ itemId: item.id, itemName: item.name, itemType: effectItemType(item), ...entry });
    }
  }
  return list;
}

/** Efeitos de um tipo (e, se quiser, de um item só). */
export function effectsOfType(entries, tipo, itemId = null) {
  return entries.filter((e) => e.tipo === tipo && (itemId === null || e.itemId === itemId));
}

/** Chave de um efeito no ator (para os limites de uso): item + efeito. */
export function effectKey(entry) {
  return `${entry.itemId}-${entry.id}`;
}
