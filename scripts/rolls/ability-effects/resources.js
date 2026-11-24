/**
 * Recursos das habilidades (ímpeto e outros) e os custos dos efeitos.
 * Parte de `ability-effects.js` (v0.28.7). Lógica pura, sem Foundry.
 */
import { normalizeCost } from './catalog.js';
import { effectsOfType } from './legacy.js';

// ---------- Recursos ----------

/**
 * Recursos definidos pelos efeitos `recurso` (o primeiro de cada chave vale).
 * @returns {Object<string, {chave: string, nome: string, maximo: number, esvazia: boolean,
 *   itemName: string}>}
 */
export function resourceDefs(entries) {
  const defs = {};
  for (const entry of effectsOfType(entries, 'recurso')) {
    const { chave, nome, maximo, esvazia } = entry.params;
    if (!chave || defs[chave]) continue;
    defs[chave] = {
      chave,
      nome: nome || entry.itemName,
      maximo,
      esvazia,
      itemName: entry.itemName,
    };
  }
  return defs;
}

/** Valor atual de um recurso (0 se o ator não tem o recurso; nunca acima do máximo). */
export function resourceValue(values, defs, chave) {
  const def = defs[chave];
  if (!def) return 0;
  const n = Math.trunc(Number(values?.[chave]) || 0);
  return Math.min(def.maximo, Math.max(0, n));
}

/** Novo valor de um recurso depois de somar (ou tirar) `amount`, sem sair de 0..máximo. */
export function addResource(values, defs, chave, amount) {
  const def = defs[chave];
  if (!def) return 0;
  return Math.min(def.maximo, Math.max(0, resourceValue(values, defs, chave) + amount));
}

/**
 * O que os efeitos `ganharRecurso` de um gatilho mudam nos recursos.
 * @param {object[]} entries Efeitos do ator.
 * @param {Object<string, number>} values Valores atuais (`recursosHab`).
 * @param {string} trigger Um de `TRIGGERS`.
 * @param {string|null} [itemId] Só os efeitos deste item (o botão «ação» de uma habilidade).
 * @returns {Object<string, number>} Só os recursos que mudaram, com o valor novo.
 */
export function triggerChanges(entries, values, trigger, itemId = null) {
  const defs = resourceDefs(entries);
  const next = { ...values };
  for (const entry of effectsOfType(entries, 'ganharRecurso', itemId)) {
    const { recurso, quantidade, gatilho } = entry.params;
    if (gatilho !== trigger || !defs[recurso]) continue;
    next[recurso] = addResource(next, defs, recurso, quantidade);
  }
  const changes = {};
  for (const chave of Object.keys(defs)) {
    const value = resourceValue(next, defs, chave);
    if (value !== resourceValue(values, defs, chave)) changes[chave] = value;
  }
  return changes;
}

/**
 * Recursos na Nova cena: os que esvaziam voltam a 0; depois, os ganhos de início de cena.
 * @returns {Object<string, number>} Valor novo de cada recurso definido.
 */
export function sceneResources(entries, values) {
  const defs = resourceDefs(entries);
  const next = {};
  for (const [chave, def] of Object.entries(defs)) {
    next[chave] = def.esvazia ? 0 : resourceValue(values, defs, chave);
  }
  for (const entry of effectsOfType(entries, 'ganharRecurso')) {
    const { recurso, quantidade, gatilho } = entry.params;
    if (gatilho !== 'inicioCena' || !defs[recurso]) continue;
    next[recurso] = addResource(next, defs, recurso, quantidade);
  }
  return next;
}

// ---------- Custos ----------

/**
 * O ator pode pagar este custo?
 * @param {{tipo: string, valor: number, recurso: string}} cost
 * @param {{pd: number, pv: number, recursos: Object<string, number>}} wallet Valores atuais.
 */
export function canPay(cost, wallet) {
  const { tipo, valor, recurso } = normalizeCost(cost);
  if (tipo === 'nenhum' || valor === 0) return true;
  if (tipo === 'pd') return wallet.pd >= valor;
  if (tipo === 'pv') return wallet.pv >= valor;
  return (wallet.recursos?.[recurso] ?? 0) >= valor;
}

/**
 * Gravação que paga um custo (caminhos `system.*` do ator). Sem conferir se dá: chame `canPay`.
 * @returns {Object<string, number>}
 */
export function payUpdates(cost, wallet) {
  const { tipo, valor, recurso } = normalizeCost(cost);
  if (tipo === 'nenhum' || valor === 0) return {};
  if (tipo === 'pd') return { 'system.pd.value': Math.max(0, wallet.pd - valor) };
  if (tipo === 'pv') return { 'system.pv.value': Math.max(0, wallet.pv - valor) };
  const current = wallet.recursos?.[recurso] ?? 0;
  return { [`system.recursosHab.${recurso}`]: Math.max(0, current - valor) };
}
