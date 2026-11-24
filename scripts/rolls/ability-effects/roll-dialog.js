/**
 * Somas de custos (`costBag`) e opções da janela pré-teste: os dados extras dos efeitos do ator
 * e o companheiro animal.
 * Parte de `ability-effects.js` (v0.28.7). Lógica pura, sem Foundry.
 */
import { normalizeCost } from './catalog.js';
import { effectsOfType } from './legacy.js';

// ---------- Janela pré-teste ----------

/**
 * Custo agregado («saco» de custos): PD, PV e cada recurso pela chave. É a forma em que a janela
 * pré-teste soma o que as opções marcadas gastam.
 * @typedef {{pd: number, pv: number, recursos: Object<string, number>}} CostBag
 */

/** Saco vazio (nada a pagar). */
export function emptyCostBag() {
  return { pd: 0, pv: 0, recursos: {} };
}

/** Custo de um efeito no formato de saco. */
export function costBag(cost) {
  const { tipo, valor, recurso } = normalizeCost(cost);
  const bag = emptyCostBag();
  if (tipo === 'pd') bag.pd = valor;
  else if (tipo === 'pv') bag.pv = valor;
  else if (tipo === 'recurso' && valor > 0) bag.recursos[recurso] = valor;
  return bag;
}

/** Soma de dois sacos de custo. */
export function addCostBags(a, b) {
  const recursos = { ...a.recursos };
  for (const [key, value] of Object.entries(b.recursos)) {
    recursos[key] = (recursos[key] ?? 0) + value;
  }
  return { pd: a.pd + b.pd, pv: a.pv + b.pv, recursos };
}

/**
 * Gravação que paga um saco de custos (caminhos `system.*` do ator). Sem conferir se dá: chame
 * `costShortfall` antes.
 * @param {CostBag} bag
 * @param {{pd: number, pv: number, recursos: Object<string, number>}} wallet Valores atuais.
 * @returns {Object<string, number>}
 */
export function bagUpdates(bag, wallet) {
  const updates = {};
  if (bag.pd) updates['system.pd.value'] = Math.max(0, (wallet.pd ?? 0) - bag.pd);
  if (bag.pv) updates['system.pv.value'] = Math.max(0, (wallet.pv ?? 0) - bag.pv);
  for (const [key, value] of Object.entries(bag.recursos)) {
    if (value)
      updates[`system.recursosHab.${key}`] = Math.max(0, (wallet.recursos?.[key] ?? 0) - value);
  }
  return updates;
}

/**
 * O que falta para pagar um saco: 'pd', 'pv' e as chaves dos recursos insuficientes, nesta
 * ordem. Vazio = dá para pagar.
 * @param {CostBag} bag
 * @param {{pd: number, pv: number, recursos: Object<string, number>}} wallet
 */
export function costShortfall(bag, wallet) {
  const missing = [];
  if (bag.pd > (wallet.pd ?? 0)) missing.push('pd');
  if (bag.pv > (wallet.pv ?? 0)) missing.push('pv');
  for (const [key, value] of Object.entries(bag.recursos)) {
    if (value > (wallet.recursos?.[key] ?? 0)) missing.push(key);
  }
  return missing;
}

/**
 * Opção do companheiro animal na janela pré-teste (v0.27.0), ou `null` se ele não ajuda neste
 * teste. Só o primeiro efeito `companheiro` do ator conta (o «animal ferido» da ficha é um só).
 * Vale nos testes do tipo do efeito; «qualquer teste» vale em todos os testes de perícia. Vem
 * marcada por padrão; com o animal ferido, aparece apagada (`unavailable: 'ferido'`).
 * @param {object[]} entries Efeitos do ator.
 * @param {{testKind: string, hurt: boolean}} context
 */
export function companionOption(entries, { testKind, hurt }) {
  const entry = effectsOfType(entries, 'companheiro')[0];
  if (!entry) return null;
  const { dado, teste } = entry.params;
  if (teste !== 'qualquer' && teste !== testKind) return null;
  return {
    key: entry.id,
    die: dado,
    cost: emptyCostBag(),
    itemName: entry.itemName ?? '',
    group: 'habilidade',
    // Marcada por padrão, a não ser que o animal esteja ferido
    checked: !hurt,
    source: 'habilidade',
    // Marca a opção como o companheiro (a rolagem procura este dado para ver se deu 1)
    companion: true,
    ...(hurt ? { unavailable: 'ferido' } : {}),
  };
}

/** Dados-base de todo teste (atributo e perícia): os extras vêm depois deles em `result.dice`. */
const BASE_DICE = 2;

/**
 * O dado do companheiro animal deu 1 neste teste? Ele é achado pela posição que a rolagem guardou
 * (`companionDie.index`, entre os dados extras) e conferido pela origem e pelas faces, para uma
 * posição errada nunca ferir o animal por engano.
 * @param {{dice: {sides: number, value: number, source: string}[]}|null} result
 * @param {{index: number, sides: number}|null} companionDie `null` = o companheiro não entrou.
 */
export function companionHurt(result, companionDie) {
  if (!companionDie || !Array.isArray(result?.dice)) return false;
  const die = result.dice[BASE_DICE + companionDie.index];
  return Boolean(
    die && die.source === 'extra' && die.sides === companionDie.sides && die.value === 1,
  );
}

/**
 * Dados extras que a janela pré-teste oferece (efeitos `dadoExtra` e o companheiro animal), no
 * formato de `buildRollModel`. O custo vem como saco (PD, PV ou um recurso).
 * @param {object[]} entries Efeitos do ator.
 * @param {{skillKey: string, testKind?: string, hurtCompanion?: boolean, companion?: boolean}}
 *   context `testKind`: qualquer, ataqueCorpo, ataqueDistancia ou defesa. Um efeito de «qualquer
 *   teste» vale em todos. `hurtCompanion`: o animal está ferido nesta cena (opção apagada).
 *   `companion: false` tira o companheiro (testes de lesão e de trauma, que não são de perícia).
 * @returns {{key: string, die: number, cost: CostBag, itemName: string, group: string,
 *   checked: boolean, source: string, companion?: boolean, unavailable?: string}[]}
 */
export function dialogDiceOptions(
  entries,
  { skillKey, testKind = 'qualquer', hurtCompanion = false, companion = true },
) {
  const seen = new Set();
  const options = [];
  // Companheiro animal primeiro: é o primeiro dado de habilidade do teste
  const pet = companion ? companionOption(entries, { testKind, hurt: hurtCompanion }) : null;
  if (pet) {
    seen.add(pet.key);
    options.push(pet);
  }
  for (const entry of effectsOfType(entries, 'dadoExtra')) {
    const { dado, pericias, teste, custo, grupo, marcado } = entry.params;
    if (seen.has(entry.id)) continue;
    // O dado de uma arma só chega aqui no ataque com ela (`collectEffects`): vale sempre, sem os
    // filtros de perícia e de tipo de teste (o editor nem os mostra na arma)
    const fromWeapon = entry.itemType === 'arma';
    if (!fromWeapon && pericias.length && !pericias.includes(skillKey)) continue;
    if (!fromWeapon && teste !== 'qualquer' && teste !== testKind) continue;
    seen.add(entry.id);
    options.push({
      key: entry.id,
      die: dado,
      cost: costBag(custo),
      itemName: entry.itemName ?? '',
      group: grupo,
      checked: marcado,
      // De onde veio: 'habilidade' ou 'item' (arma, armadura ou item geral, grupo «Itens» da janela)
      source: entry.itemType && entry.itemType !== 'habilidade' ? 'item' : 'habilidade',
    });
  }
  return options;
}
