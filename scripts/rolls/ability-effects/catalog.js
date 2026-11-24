/**
 * Catálogo de efeitos de habilidade: tipos, momentos, campos dos parâmetros e a
 * normalização de um efeito.
 * Parte de `ability-effects.js` (v0.28.7). Lógica pura, sem Foundry.
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

/** Recursos que um efeito `curar` recupera. */
export const HEAL_RESOURCES = Object.freeze(['pv', 'pd']);

/** Atributos de um `passoAlvo` (um só, sem «todos»). */
export const TARGET_ATTRIBUTES = Object.freeze(['fisico', 'mente', 'emocao']);

/** Armas em que uma munição vale (efeito `municao`): por enquanto, qualquer arma à distância. */
export const AMMO_RANGES = Object.freeze(['distancia']);

/** Ferramentas (efeito `ferramenta`): só a maleta de medicamentos, por enquanto. */
export const TOOLS = Object.freeze(['medicina']);

/** Atributos de um `passoCondicional` (`todos` = o dado de qualquer atributo). */
export const STEP_ATTRIBUTE_CHOICES = Object.freeze(['todos', 'fisico', 'mente', 'emocao']);

/**
 * Onde um `passo` (efeito da aba Condição) muda o dado: o dado do atributo, o dado de qualquer
 * perícia ou o dado de uma perícia só (`pericia`).
 */
export const STEP_TARGETS = Object.freeze(['atributo', 'pericias', 'pericia']);

/** Sobre o que um `modificador` vale: os testes com um atributo ou os de uma perícia. */
export const MODIFIER_TARGETS = Object.freeze(['atributo', 'pericia']);

/** Recursos cujo máximo uma `reducaoMaximo` reduz. */
export const MAX_RESOURCES = Object.freeze(['pv', 'pd']);

/**
 * Testes em que um `passo` vale: os de `TEST_KINDS` e `ataque` (qualquer ataque, corpo a corpo ou
 * à distância; ex.: agarrado).
 */
export const CONDITION_TEST_KINDS = Object.freeze([
  'qualquer',
  'ataque',
  'ataqueCorpo',
  'ataqueDistancia',
  'defesa',
]);

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
  // Item geral, ao usar: rola a fórmula e põe no chat o botão «Aplicar cura» (PV ou PD)
  curar: { formula: textField('2d4'), recursoCura: choiceField(HEAL_RESOURCES, 'pv') },
  // Item geral, ao usar: botão «Receber efeito»; quem clica ganha um passo no atributo, na aba
  // Condição, até o fim da cena (usos repetidos somam; o dado para em d12)
  passoAlvo: { atributo: choiceField(TARGET_ATTRIBUTES, 'fisico'), passos: intField(1, -3, 3) },
  // Item geral, passivo (na ficha): ferramenta de uma tarefa (só a maleta dos primeiros socorros)
  ferramenta: { ferramenta: choiceField(TOOLS, 'medicina') },
  // Item geral, ao usar: um dado na reserva de dados bônus de quem usou (vale em um teste)
  concederDado: { dado: dieField(10) },
  // Item geral, munição (ex.: aljava): nos ataques com armas do alcance, caixa na janela pré-teste;
  // marcada, dá passos no ataque, soma no dano e gasta uma unidade
  municao: {
    alcance: choiceField(AMMO_RANGES, 'distancia'),
    passos: intField(1, 0, 3),
    dano: intField(1, 0, 10),
  },
  // Efeito da aba Condição: passos no dado do atributo, de qualquer perícia ou de uma perícia só,
  // nos testes do tipo `teste` (o padrão −1 é o de uma condição comum, como caído)
  passo: {
    alvo: choiceField(STEP_TARGETS, 'atributo'),
    atributo: choiceField(STEP_ATTRIBUTE_CHOICES, 'todos'),
    pericia: textField('', 'skill'),
    passos: intField(-1, -3, 3),
    teste: choiceField(CONDITION_TEST_KINDS, 'qualquer'),
  },
  // Efeito da aba Condição (v0.22.2): modificador fixo somado ao total dos testes com um atributo
  // ou de uma perícia (as lesões e traumas: Sem Olho −1 em Percepção, Degradação −1 em Mente...)
  modificador: {
    sobre: choiceField(MODIFIER_TARGETS, 'pericia'),
    atributo: choiceField(STEP_ATTRIBUTE_CHOICES, 'todos'),
    pericia: textField('', 'skill'),
    mod: intField(-1, -5, 5),
  },
  // Efeito da aba Condição: cada dano emocional sofrido aumenta nesse valor (estresse
  // pós-traumático); vários se somam
  danoEmocionalExtra: {
    extra: intField(1, 1, 10),
  },
  // Efeito da aba Condição: o PV ou o PD máximo fica menor enquanto o efeito estiver na ficha
  // (máximo = base − reduções; Laceração Profunda, Chaga da Alma)
  reducaoMaximo: {
    recursoMax: choiceField(MAX_RESOURCES, 'pv'),
    reducao: intField(2, 1, 20),
  },
});

/** Tipos que só os efeitos da aba Condição aceitam (habilidades e equipamentos não os oferecem). */
export const CONDITION_ONLY_TYPES = Object.freeze([
  'passo',
  'modificador',
  'danoEmocionalExtra',
  'reducaoMaximo',
]);

/** Tipos que só uma arma aceita (a habilidade não os oferece). */
export const WEAPON_ONLY_TYPES = Object.freeze(['bonusAtaque', 'passoAtaque', 'criticoAmpliado']);

/**
 * Tipos que só um equipamento aceita: os de arma, o de escudo e os do item geral (a habilidade não
 * os oferece; ela já tem os seus jeitos de curar).
 */
export const EQUIPMENT_ONLY_TYPES = Object.freeze([
  ...WEAPON_ONLY_TYPES,
  'reducaoEscudo',
  'curar',
  'passoAlvo',
  'ferramenta',
  'concederDado',
  'municao',
]);

/** Efeitos do item geral que agem ao apertar Usar (os outros são passivos). */
export const USE_EFFECT_TYPES = Object.freeze(['curar', 'passoAlvo', 'acaoNota', 'concederDado']);

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
