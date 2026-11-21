/**
 * Efeitos de habilidade: lógica pura (sem Foundry) do catálogo de efeitos.
 *
 * Uma habilidade é um texto mais uma lista de efeitos. Cada efeito tem um `id`, um `tipo`
 * escolhido num catálogo fechado (`EFFECT_TYPES`) e os parâmetros desse tipo (`params`). O tipo
 * já diz onde o efeito aparece (janela pré-teste, cartão do teste, ficha, gatilho); os parâmetros
 * só trazem números, perícias e custos. Não há código livre.
 *
 * Itens antigos (até a 0.19.x) não têm efeitos, só o campo `automacao`: `itemEffects` monta os
 * efeitos equivalentes na hora (`legacyEffects`), com os mesmos números de antes.
 */

/** Dados que um efeito pode usar. */
export const DIE_SIDES = Object.freeze([4, 6, 8, 10, 12]);

/** Momentos em que um efeito `ganharRecurso` dispara. */
export const TRIGGERS = Object.freeze([
  'falha', // um teste com DT falhou
  'perdeOposto', // perdeu um teste oposto
  'defender', // fez o teste de Defender-se
  'inicioCena', // a Nova cena começou
  'inicioCombate', // um combate começou
  'acao', // botão na ficha (gasta a ação do personagem)
]);

/** Tipos de teste que filtram um efeito (`qualquer` vale em todos). */
export const TEST_KINDS = Object.freeze(['qualquer', 'ataqueCorpo', 'ataqueDistancia', 'defesa']);

/** Atributos de um `passoCena` (vazio = o jogador escolhe na hora). */
export const ATTRIBUTE_CHOICES = Object.freeze(['', 'fisico', 'mente', 'emocao']);

/** O que um efeito pode gastar. */
export const COST_KINDS = Object.freeze(['nenhum', 'pd', 'pv', 'recurso']);

/** Grupo de um dado extra na janela pré-teste: «Habilidades» ou «Ações». */
export const OPTION_GROUPS = Object.freeze(['habilidade', 'acao']);

/** Limite de uso: sem limite, ou uma vez por rodada (só em combate; fora dele, sem limite). */
export const LIMITS = Object.freeze(['nenhum', 'rodadaCombate']);

/** Resultados de um `testeAcao` que passou. */
export const ACTION_RESULTS = Object.freeze(['curarPV', 'concederDados']);

/** Condições de um `passoCondicional`. */
export const CONDITIONS = Object.freeze(['pvMetade', 'pdMetade']);

/**
 * Quando vale um `passoAtaque`: em todo ataque, no primeiro ataque da cena (automático, pelo
 * marcador `cena.armasAtacaram`, por arma) ou no primeiro ataque contra quem ainda não atacou o personagem (caixa
 * que o jogador marca na janela pré-teste).
 */
export const ATTACK_STEP_WHEN = Object.freeze(['sempre', 'primeiroCena', 'naoAtacou']);

/** Atributos de um `passoCondicional` (`todos` = o dado de qualquer atributo). */
export const STEP_ATTRIBUTE_CHOICES = Object.freeze(['todos', 'fisico', 'mente', 'emocao']);

// ---------- Números das habilidades antigas (também são os padrões) ----------

export const IMPETO_MAX = 5;
export const ANALISE_MAX = 4;
export const ANALISE_GAIN = 2;

/** Custos das automações antigas. */
export const COSTS = Object.freeze({
  prontidao: 2,
  curandeiro: 2,
  sorrateiro: 3,
  impetoDado: 1,
  impetoPasso: 3,
  impetoAcao: 3,
});

/** Perícias do dado extra furtivo das automações antigas. */
export const SNEAK_SKILLS = Object.freeze(['crime', 'furtividade']);

// ---------- Campos dos parâmetros ----------

// Cada campo sabe o seu padrão, como limpar um valor qualquer (texto vindo de formulário, valor
// ausente, número fora da faixa; um valor inválido vira o padrão) e que controle o editor usa
// (`kind`): int, bool, text, resource (chave de recurso), skill (uma perícia), choice, die,
// skills (lista de perícias) e cost.
const intField = (initial, min, max) => ({
  kind: 'int',
  min,
  max,
  initial,
  clean(value) {
    // Texto vazio não vira 0 (Number('') === 0): fica o padrão
    if (value === '' || value === null || value === undefined) return initial;
    const n = Math.trunc(Number(value));
    if (!Number.isFinite(n)) return initial;
    return Math.min(max, Math.max(min, n));
  },
});
const boolField = (initial) => ({
  kind: 'bool',
  initial,
  clean: (value) => (typeof value === 'boolean' ? value : value === 'true' ? true : initial),
});
const textField = (initial = '', kind = 'text') => ({
  kind,
  initial,
  clean: (value) => (typeof value === 'string' ? value.trim().slice(0, 200) : initial),
});
const choiceField = (choices, initial) => ({
  kind: 'choice',
  choices,
  initial,
  clean: (value) => (choices.includes(value) ? value : initial),
});
const dieField = (initial) => ({
  kind: 'die',
  choices: DIE_SIDES,
  initial,
  clean: (value) => {
    const n = Number(value);
    return DIE_SIDES.includes(n) ? n : initial;
  },
});
const listField = () => ({
  kind: 'skills',
  initial: [],
  clean: (value) =>
    Array.isArray(value)
      ? [...new Set(value.filter((v) => typeof v === 'string' && v).map((v) => v.trim()))]
      : [],
});
const costField = () => ({
  kind: 'cost',
  initial: { tipo: 'nenhum', valor: 0, recurso: '' },
  clean: (value) => normalizeCost(value),
});

/** Custo de um efeito: tipo (nenhum, PD, PV, recurso), quanto e, se for recurso, qual. */
export function normalizeCost(raw) {
  const tipo = COST_KINDS.includes(raw?.tipo) ? raw.tipo : 'nenhum';
  if (tipo === 'nenhum') return { tipo, valor: 0, recurso: '' };
  return {
    tipo,
    valor: intField(0, 0, 20).clean(raw?.valor),
    recurso: tipo === 'recurso' ? textField().clean(raw?.recurso) : '',
  };
}

/** Catálogo: os campos de cada tipo de efeito. */
export const EFFECT_TYPES = Object.freeze({
  // Barra ou contador próprio (o valor atual fica no ator, em `recursosHab[chave]`)
  recurso: {
    chave: textField(),
    nome: textField(),
    maximo: intField(5, 1, 20),
    esvazia: boolField(true),
  },
  // Ganha N num recurso quando o gatilho acontece
  ganharRecurso: {
    recurso: textField('', 'resource'),
    quantidade: intField(1, 1, 20),
    gatilho: choiceField(TRIGGERS, 'acao'),
    // Texto do botão na ficha (só no gatilho «ação»; vazio = automático)
    rotulo: textField(),
  },
  // Dado extra marcado na janela pré-teste (perícias vazias = todas)
  dadoExtra: {
    dado: dieField(6),
    pericias: listField(),
    teste: choiceField(TEST_KINDS, 'qualquer'),
    custo: costField(),
    grupo: choiceField(OPTION_GROUPS, 'habilidade'),
    marcado: boolField(false),
  },
  // Depois de rolar: cada ponto do recurso muda um dado em ±1
  ajusteDados: { recurso: textField('', 'resource') },
  // Depois de rolar: rola de novo um dado que não tirou 1 (de qualquer teste)
  rerrolar: { custo: costField(), limite: choiceField(LIMITS, 'rodadaCombate') },
  // Botão na ficha: aumento de passo num atributo até o fim da cena (vazio = escolher)
  passoCena: {
    custo: costField(),
    atributo: choiceField(ATTRIBUTE_CHOICES, ''),
    passos: intField(1, 1, 3),
    rotulo: textField(),
  },
  // Botão na ficha: gasta o custo e avisa no chat (a mesa resolve o resto)
  acaoNota: { custo: costField(), texto: textField(), rotulo: textField() },
  // Botão na ficha: teste com DT; se passar, cura ou dá dados bônus
  testeAcao: {
    custo: costField(),
    pericia: textField('medicina', 'skill'),
    dt: intField(7, 1, 99),
    resultado: choiceField(ACTION_RESULTS, 'curarPV'),
    dado: dieField(6),
    margem: intField(3, 1, 10),
    umaVezPorAlvo: boolField(true),
    rotulo: textField(),
  },
  // Dado de um companheiro; um 1 nele o tira da cena
  companheiro: { dado: dieField(6), teste: choiceField(TEST_KINDS, 'ataqueCorpo') },
  // Defesa como ação livre (sem o d6 do Defender-se)
  defesaLivre: {
    pericia: textField('acrobacia', 'skill'),
    limite: choiceField(LIMITS, 'rodadaCombate'),
    rotulo: textField(),
  },
  // Aumento de passo no dado do atributo enquanto a condição valer (vira um efeito da aba Condição)
  passoCondicional: {
    condicao: choiceField(CONDITIONS, 'pvMetade'),
    passos: intField(1, 1, 3),
    atributo: choiceField(STEP_ATTRIBUTE_CHOICES, 'todos'),
  },
  // Torna-se o alvo de um ataque contra um aliado
  interceptar: { custo: costField(), limite: choiceField(LIMITS, 'rodadaCombate') },
  // Habilidade: pode usar armas (e, na 0.21.2, armaduras) marciais. Sem parâmetros.
  proficienciaMarcial: {},
  // Arma: +N fixo no total dos ataques com ela
  bonusAtaque: { valor: intField(1, 1, 5) },
  // Arma: aumento de passo no dado da perícia do ataque, conforme `quando`
  passoAtaque: {
    passos: intField(1, 1, 3),
    quando: choiceField(ATTACK_STEP_WHEN, 'sempre'),
  },
  // Arma: sucesso crítico com dois dados iguais de valor `minimo` ou mais (o normal é 6)
  criticoAmpliado: { minimo: intField(5, 2, 5) },
  // Escudo: perdeu um oposto de ataque com soma `somaMinima` ou mais → o dano cai pela rolagem
  // baixa (gravado na 0.21.3; o cálculo entra na janela Resolver dano)
  reducaoEscudo: { somaMinima: intField(7, 1, 30) },
  // Habilidade: +N pontos na armadura vestida (o gasto fica em `system.armaduraExtraGasta`)
  armaduraExtra: { pontos: intField(1, 1, 3) },
});

/** Tipos que só uma arma aceita (a habilidade não os oferece). */
export const WEAPON_ONLY_TYPES = Object.freeze(['bonusAtaque', 'passoAtaque', 'criticoAmpliado']);

/** Tipos que só um equipamento aceita: os de arma e os de escudo (a habilidade não os oferece). */
export const EQUIPMENT_ONLY_TYPES = Object.freeze([...WEAPON_ONLY_TYPES, 'reducaoEscudo']);

/** Parâmetros padrão de um tipo (cópia nova). */
export function defaultParams(tipo) {
  const fields = EFFECT_TYPES[tipo];
  if (!fields) return null;
  return Object.fromEntries(
    Object.entries(fields).map(([key, field]) => [key, globalThis.structuredClone(field.initial)]),
  );
}

/**
 * Limpa um efeito: tipo conhecido, todos os parâmetros do tipo (valores inválidos viram o padrão,
 * parâmetros desconhecidos somem). Devolve `null` para um tipo que não está no catálogo.
 * @param {{id?: string, tipo?: string, params?: object}} raw
 * @param {string} [fallbackId] Id usado se o efeito não tiver um.
 */
export function normalizeEffect(raw, fallbackId = '') {
  const fields = EFFECT_TYPES[raw?.tipo];
  if (!fields) return null;
  const source = raw.params && typeof raw.params === 'object' ? raw.params : {};
  const params = Object.fromEntries(
    Object.entries(fields).map(([key, field]) => [key, field.clean(source[key])]),
  );
  const id = typeof raw.id === 'string' && raw.id ? raw.id : fallbackId;
  return { id, tipo: raw.tipo, params };
}

/** Limpa uma lista de efeitos (tipos desconhecidos somem; sem id, `e0`, `e1`...). */
export function normalizeEffects(list) {
  if (!Array.isArray(list)) return [];
  return list.map((raw, i) => normalizeEffect(raw, `e${i}`)).filter(Boolean);
}

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
  // Dado extra com o item na mochila (0.21.4: curar, passo no alvo, ferramenta, ação com aviso)
  item: Object.freeze(['dadoExtra']),
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
    return Object.keys(EFFECT_TYPES).filter((tipo) => !EQUIPMENT_ONLY_TYPES.includes(tipo));
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
 * Dados extras que a janela pré-teste oferece (efeitos `dadoExtra`), no formato de
 * `buildRollModel`. O custo vem como saco (PD, PV ou um recurso).
 * @param {object[]} entries Efeitos do ator.
 * @param {{skillKey: string, testKind?: string}} context `testKind`: qualquer, ataqueCorpo,
 *   ataqueDistancia ou defesa. Um efeito de «qualquer teste» vale em todos.
 * @returns {{key: string, die: number, cost: CostBag, itemName: string, group: string,
 *   checked: boolean, source: string}[]}
 */
export function dialogDiceOptions(entries, { skillKey, testKind = 'qualquer' }) {
  const seen = new Set();
  const options = [];
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
    .map(([origem, entry]) => ({
      nome: entry.itemName ?? '',
      descricao: '',
      atributo: entry.params.atributo || 'todos',
      passos: entry.params.passos,
      fimDeCena: false,
      origem,
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
