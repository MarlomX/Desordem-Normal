/**
 * Ataque com arma, uso de item, limite por rodada e dados bônus do grupo.
 * Parte de `ability-effects.js` (v0.28.7). Lógica pura, sem Foundry.
 */
import { DIE_SIDES, USE_EFFECT_TYPES, normalizeEffect } from './catalog.js';
import { effectsOfType, ownEffects } from './legacy.js';
import { addCostBags, costBag, emptyCostBag } from './roll-dialog.js';

// ---------- Ataque com arma ----------

/**
 * O personagem tem proficiência marcial? Pela caixa da ficha ou por um efeito
 * `proficienciaMarcial` (de uma habilidade).
 * @param {{proficienciaMarcial?: boolean}} system `actor.system`.
 * @param {object[]} entries Efeitos do ator (`collectEffects`).
 */
export function hasMartialProficiency(system, entries) {
  return (
    Boolean(system?.proficienciaMarcial) || entries.some((e) => e.tipo === 'proficienciaMarcial')
  );
}

/**
 * O que os efeitos da arma fazem num ataque: bônus fixo, passos no dado da perícia e o valor
 * mínimo do crítico. `entries` já vem de `collectEffects(..., {weaponId})`, então só a arma do
 * ataque traz efeitos de arma. Cada efeito vira uma linha (`lines`) para a janela pré-teste e para
 * o cartão; `applies` diz se entra neste ataque, e `optional` marca o passo que depende da caixa
 * «quem ainda não me atacou».
 * @param {object[]} entries Efeitos do ator no ataque.
 * @param {{firstAttack?: boolean, notAttacked?: boolean}} [state] `firstAttack`: esta arma
 *   ainda não atacou nesta cena (`firstWeaponAttack`); `notAttacked`: o jogador marcou que o alvo ainda não o atacou.
 * @returns {{modifier: number, steps: number, critMin: number|null, lines: {key: string,
 *   kind: string, itemName: string, value: number, quando: string|null, applies: boolean,
 *   optional: boolean}[]}}
 */
export function weaponAttackEffects(entries, { firstAttack = false, notAttacked = false } = {}) {
  let modifier = 0;
  let steps = 0;
  let critMin = null;
  const lines = [];
  for (const entry of entries) {
    if (entry.itemType !== 'arma') continue;
    const { params } = entry;
    const base = { key: entry.id, itemName: entry.itemName ?? '', quando: null, optional: false };
    if (entry.tipo === 'bonusAtaque') {
      modifier += params.valor;
      lines.push({ ...base, kind: 'bonus', value: params.valor, applies: true });
    } else if (entry.tipo === 'passoAtaque') {
      const applies =
        params.quando === 'sempre' ||
        (params.quando === 'primeiroCena' && firstAttack) ||
        (params.quando === 'naoAtacou' && notAttacked);
      if (applies) steps += params.passos;
      lines.push({
        ...base,
        kind: 'passo',
        value: params.passos,
        quando: params.quando,
        applies,
        optional: params.quando === 'naoAtacou',
      });
    } else if (entry.tipo === 'criticoAmpliado') {
      critMin = critMin === null ? params.minimo : Math.min(critMin, params.minimo);
      lines.push({ ...base, kind: 'critico', value: params.minimo, applies: true });
    }
  }
  return { modifier, steps, critMin, lines };
}

// ---------- Uso de item geral ----------

/**
 * O que um uso do item faz, a partir dos efeitos dele (`ownEffects`): curas a rolar, passos a
 * entregar, notas para o cartão e o custo somado das notas (`acaoNota` pode custar PD ou PV).
 * @param {object[]} effects Efeitos do item, já limpos e filtrados.
 * @returns {{heals: {formula: string, recurso: string}[], steps: {atributo: string,
 *   passos: number}[], dice: number[], notes: string[], cost: object, hasUse: boolean}} `dice`:
 *   dados que entram na reserva de dados bônus de quem usou; `hasUse`: o item tem algum efeito de
 *   uso (o botão Usar aparece mesmo sem limite de usos).
 */
export function itemUsePlan(effects) {
  const heals = [];
  const dice = [];
  const steps = [];
  const notes = [];
  const bags = [];
  for (const effect of effects ?? []) {
    const { params } = effect;
    if (effect.tipo === 'curar' && params.formula) {
      heals.push({ formula: params.formula, recurso: params.recursoCura });
    } else if (effect.tipo === 'passoAlvo' && params.passos) {
      steps.push({ atributo: params.atributo, passos: params.passos });
    } else if (effect.tipo === 'concederDado') {
      dice.push(params.dado);
    } else if (effect.tipo === 'acaoNota') {
      if (params.texto) notes.push(params.texto);
      bags.push(costBag(params.custo));
    }
  }
  return {
    heals,
    steps,
    dice,
    notes,
    cost: bags.reduce(addCostBags, emptyCostBag()),
    hasUse: (effects ?? []).some((e) => USE_EFFECT_TYPES.includes(e.tipo)),
  };
}

/**
 * Efeito de munição de um item para uma arma: os parâmetros do `municao` do mesmo alcance da arma,
 * sem olhar as unidades. `null` se o item não é munição dessa arma.
 * @param {{type: string, system: object}} item
 * @param {{tipo: string}} weapon `weapon.system`.
 * @returns {{alcance: string, passos: number, dano: number}|null}
 */
export function ammoEffectOf(item, weapon) {
  if (item?.type !== 'item') return null;
  const ammo = ownEffects(item).find(
    (e) => e.tipo === 'municao' && e.params.alcance === weapon?.tipo,
  );
  return ammo ? ammo.params : null;
}

/**
 * Munições que valem num ataque com a arma (efeito `municao` de itens gerais na ficha, do mesmo
 * alcance da arma, com unidade ou uso sobrando). Na ordem dos itens; a janela marca a primeira.
 * @param {{id: string, name: string, type: string, system: object}[]} items Itens do ator.
 * @param {{tipo: string}} weapon `weapon.system` (alcance: corpo ou distancia).
 * @returns {{id: string, name: string, passos: number, dano: number, remaining: number|null}[]}
 *   `remaining`: unidades que sobram (null se o item não é consumível).
 */
export function ammoOptions(items, weapon) {
  const options = [];
  for (const item of items ?? []) {
    const ammo = ammoEffectOf(item, weapon);
    if (!ammo) continue;
    const { consumivel, quantidade = 0 } = item.system;
    if (consumivel && quantidade <= 0) continue;
    options.push({
      id: item.id,
      name: item.name,
      passos: ammo.passos,
      dano: ammo.dano,
      remaining: consumivel ? quantidade : null,
    });
  }
  return options;
}

/**
 * O ator tem a ferramenta (efeito `ferramenta` de um item na ficha)?
 * @param {object[]} entries Efeitos do ator.
 * @param {string} tool Ex.: `medicina`.
 */
export function hasTool(entries, tool) {
  return entries.some((e) => e.tipo === 'ferramenta' && e.params?.ferramenta === tool);
}

/**
 * Pontos de «Armadura extra» do personagem: a soma dos efeitos `armaduraExtra` das habilidades.
 * @param {object[]} entries Efeitos do ator.
 */
export function armorExtraPoints(entries) {
  return entries
    .filter((e) => e.tipo === 'armaduraExtra')
    .reduce((sum, e) => sum + (e.params?.pontos ?? 0), 0);
}

/**
 * É o primeiro ataque desta arma na cena? Lê a lista `cena.armasAtacaram` do personagem. Sem a
 * lista (criaturas, que não têm o marcador), nunca é automático.
 * @param {{armasAtacaram?: string[]}|undefined} cena `actor.system.cena`.
 * @param {string|null} weaponId
 */
export function firstWeaponAttack(cena, weaponId) {
  if (!weaponId || !Array.isArray(cena?.armasAtacaram)) return false;
  return !cena.armasAtacaram.includes(weaponId);
}

/**
 * Lista nova de armas que já atacaram na cena, com `weaponId` (ou `null` se ela já estava lá ou se
 * o ator não tem o marcador).
 * @param {{armasAtacaram?: string[]}|undefined} cena
 * @param {string} weaponId
 * @returns {string[]|null}
 */
export function markWeaponAttack(cena, weaponId) {
  if (!weaponId || !Array.isArray(cena?.armasAtacaram)) return null;
  if (cena.armasAtacaram.includes(weaponId)) return null;
  return [...cena.armasAtacaram, weaponId];
}

/** Tipo de teste de um ataque com a arma (filtro dos dados extras). */
export function weaponTestKind(weaponSystem) {
  return weaponSystem?.tipo === 'corpo' ? 'ataqueCorpo' : 'ataqueDistancia';
}

/** A condição de um `passoCondicional` vale neste estado de PV e PD? */
export function conditionHolds(condicao, { pv, pvMax, pd, pdMax }) {
  return condicao === 'pdMetade' ? halfOrLess(pd, pdMax) : halfOrLess(pv, pvMax);
}

/** Marca de origem de um efeito da aba Condição criado por um `passoCondicional`. */
export function conditionalOrigin(entry) {
  return `hab:${entry.itemId}:${entry.id}`;
}

/** O efeito da aba Condição veio de uma habilidade (tem a marca de origem)? */
export const fromAbility = (sheetEffect) => String(sheetEffect?.origem ?? '').startsWith('hab:');

/**
 * Efeitos da aba Condição depois de conferir os `passoCondicional` do ator: cada um cuja condição
 * vale tem o seu efeito (nome da habilidade, passos no dado do atributo); os que deixaram de
 * valer, ou cuja habilidade sumiu, saem. Um efeito que já existe fica como está (a pessoa pode
 * tê-lo editado). Os efeitos feitos à mão nunca mudam.
 * @param {object[]} sheetEffects `system.efeitos` do ator.
 * @param {object[]} entries Efeitos das habilidades do ator.
 * @param {{pv: number, pvMax: number, pd: number, pdMax: number}} state
 * @returns {object[]|null} Lista nova, ou null se nada muda.
 */
export function syncConditionalEffects(sheetEffects, entries, state) {
  const wanted = new Map(
    effectsOfType(entries, 'passoCondicional')
      .filter((entry) => conditionHolds(entry.params.condicao, state))
      .map((entry) => [conditionalOrigin(entry), entry]),
  );
  const kept = (sheetEffects ?? []).filter(
    (effect) => !fromAbility(effect) || wanted.has(effect.origem),
  );
  const present = new Set(kept.map((effect) => effect.origem));
  const added = [...wanted]
    .filter(([origem]) => !present.has(origem))
    // Formato da aba Condição (effects.js): um `passo` no dado do atributo, sem fim automático
    // (sai quando a condição deixa de valer). O id é a própria origem, que é única por habilidade.
    .map(([origem, entry]) => ({
      id: origem,
      nome: entry.itemName ?? '',
      descricao: '',
      chave: '',
      origem,
      duracao: 'manual',
      efeitos: [
        normalizeEffect({
          id: 'p0',
          tipo: 'passo',
          params: {
            alvo: 'atributo',
            atributo: entry.params.atributo || 'todos',
            passos: entry.params.passos,
            teste: 'qualquer',
          },
        }),
      ],
    }));
  if (!added.length && kept.length === (sheetEffects ?? []).length) return null;
  return [...kept, ...added];
}

/**
 * Efeitos `passoCondicional` cuja condição mudou entre dois estados (para avisar no chat que a
 * habilidade ativou ou desativou).
 * @param {object[]} entries Efeitos do ator.
 * @param {{pv: number, pvMax: number, pd: number, pdMax: number}} before
 * @param {{pv: number, pvMax: number, pd: number, pdMax: number}} after
 * @returns {{entry: object, active: boolean}[]} `active`: a condição passou a valer.
 */
export function conditionFlips(entries, before, after) {
  return effectsOfType(entries, 'passoCondicional')
    .map((entry) => ({
      entry,
      was: conditionHolds(entry.params.condicao, before),
      now: conditionHolds(entry.params.condicao, after),
    }))
    .filter(({ was, now }) => was !== now)
    .map(({ entry, now }) => ({ entry, active: now }));
}

/**
 * Os `count` maiores dados da reserva de dados bônus (os que a janela usa primeiro).
 * @param {number[]} reserve `system.dadosBonus`.
 */
export function pickBonusDice(reserve, count) {
  const valid = (Array.isArray(reserve) ? reserve : []).filter((die) => DIE_SIDES.includes(die));
  const n = Math.max(0, Math.min(Math.trunc(Number(count) || 0), valid.length));
  return [...valid].sort((a, b) => b - a).slice(0, n);
}

/** Reserva depois de gastar os dados usados (tira um de cada, na ordem da reserva). */
export function spendBonusDice(reserve, used) {
  const left = [...(Array.isArray(reserve) ? reserve : [])];
  for (const die of used) {
    const index = left.indexOf(die);
    if (index >= 0) left.splice(index, 1);
  }
  return left;
}

// ---------- Limite por rodada ----------

/**
 * O efeito ainda pode ser usado nesta rodada? Fora de combate (`now` nulo), sem limite.
 * @param {{combate: string, rodada: number}|undefined} lastUse Último uso guardado no ator.
 * @param {{combate: string, rodada: number}|null} now Combate e rodada atuais.
 */
export function roundLimitOk(lastUse, now) {
  if (!now) return true;
  return !(lastUse && lastUse.combate === now.combate && lastUse.rodada === now.rodada);
}

/** Condição de um `passoCondicional`: valor atual na metade do máximo ou menos. */
export function halfOrLess(value, max) {
  return max > 0 && value * 2 <= max;
}

// ---------- Dados bônus (efeito `testeAcao` que dá dados ao grupo) ----------

/**
 * Quantos dados um teste bem-sucedido dá: 1, mais 1 a cada `margem` pontos acima da DT (com
 * margem 3: resultado 10 contra DT 7 dá 2; 13 dá 3). Teste que não passou: 0.
 */
export function bonusDiceGranted(total, dt, margem) {
  if (!Number.isFinite(total) || total < dt) return 0;
  return 1 + Math.floor((total - dt) / Math.max(1, margem));
}

/**
 * Reserva de dados bônus agrupada por tamanho, em ordem: [6, 6, 8] → [{die: 6, count: 2},
 * {die: 8, count: 1}]. Valores que não são dados válidos são ignorados.
 */
export function groupBonusDice(dice) {
  const counts = new Map();
  for (const die of Array.isArray(dice) ? dice : []) {
    if (DIE_SIDES.includes(die)) counts.set(die, (counts.get(die) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([die, count]) => ({ die, count }));
}
