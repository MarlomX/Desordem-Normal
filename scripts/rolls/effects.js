/**
 * Efeitos da aba Condição: a lista `system.efeitos` do personagem e da criatura. Lógica pura, sem
 * dependência do Foundry.
 *
 * Desde a v0.22.0 cada efeito tem o formato modular, igual ao das habilidades e equipamentos:
 *   { id, nome, descricao, chave, origem, duracao, efeitos }
 * - `efeitos`: lista do catálogo (`{id, tipo, params}`, veja ability-effects.js), só com os tipos
 *   que a aba Condição aceita (`itemEffectTypes('efeito')`; por enquanto, `passo`).
 * - `duracao`: `cena` (sai na Nova cena), `permanente` ou `manual` (os dois ficam até alguém
 *   remover; `permanente` é o das lesões e traumas, a partir da v0.22.2).
 * - `chave`: de onde o efeito pronto veio (compêndio ou tabela; vazio por enquanto).
 * - `origem`: quem criou o efeito: `hab:<item>:<efeito>` (passo condicional de uma habilidade),
 *   `item` (item com `passoAlvo`, como um tônico), `falha` (efeito de falha crítica) ou vazio (à
 *   mão, na ficha).
 *
 * Até a v0.21.x o efeito tinha um formato fixo: `{nome, descricao, atributo, passos, fimDeCena,
 * origem}`. `migrateLegacyEffect` converte esse formato (o atributo e os passos viram um efeito
 * `passo`; `fimDeCena` vira a duração `cena`).
 *
 * Desde a v0.22.1 a ficha edita cada efeito numa janela própria (sheets/condition-effect-app.js),
 * com o mesmo editor dos itens. As funções da «ponte» da v0.22.0 (`bridgeEntry`, `isBridgeable`,
 * `effectView` e os campos `atributo`/`passos` de `updateEffect`) continuam para quem lê um efeito
 * simples (testes, macros), mas a ficha não as usa mais.
 */
import { ATRIBUTOS } from '../config.js';
import { itemEffectTypes, normalizeEffect, normalizeEffects } from './ability-effects.js';

/** Limite de passos de um efeito (para cima ou para baixo). */
export const EFFECT_MAX_STEPS = 3;

/** Valor do atributo de um efeito que vale para o dado de qualquer atributo. */
export const ALL_ATTRIBUTES = 'todos';

/** Durações de um efeito da aba Condição. */
export const DURATIONS = Object.freeze(['cena', 'permanente', 'manual']);

/** Tipo de item dos efeitos da aba Condição, para o catálogo (`itemEffectTypes`). */
export const CONDITION_ITEM_TYPE = 'efeito';

/** Id do `passo` que a ponte da ficha cria (único dentro do efeito, que é o que importa). */
const BRIDGE_STEP_ID = 'p0';

/** O valor, se for texto; qualquer outra coisa vira texto vazio (o banco aceita de tudo). */
const text = (value) => (typeof value === 'string' ? value : '');

/** Limita um número de passos a −3..+3 (inválido vira 0). */
function clampEffectSteps(value) {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return 0;
  return Math.min(EFFECT_MAX_STEPS, Math.max(-EFFECT_MAX_STEPS, n));
}

/** Atributo aceito num passo de atributo: um dos atributos do jogo ou `todos` (senão, vazio). */
const validAttribute = (key) => (ATRIBUTOS.includes(key) || key === ALL_ATTRIBUTES ? key : '');

/**
 * Efeito vazio, feito à mão na ficha: sem passos e sem fim automático.
 * @param {string} [id] Id do efeito (no Foundry, `foundry.utils.randomID()`).
 */
export function newEffect(id = '') {
  return {
    id,
    nome: '',
    descricao: '',
    chave: '',
    origem: '',
    duracao: 'manual',
    efeitos: [],
  };
}

/**
 * Um `passo` simples: passos no dado de um atributo (ou de todos), em qualquer teste.
 * @param {string} atributo `fisico`, `mente`, `emocao` ou `todos`.
 * @param {number} passos −3 a +3.
 * @param {string} [id]
 */
export function attributeStep(atributo, passos, id = BRIDGE_STEP_ID) {
  return normalizeEffect({
    id,
    tipo: 'passo',
    params: { alvo: 'atributo', atributo, passos: clampEffectSteps(passos), teste: 'qualquer' },
  });
}

/**
 * Efeito com passos no dado de um atributo: o que habilidades, itens e falhas críticas criam.
 * Sem atributo válido, o efeito fica só com o nome e a descrição.
 * @param {object} data
 * @param {string} [data.id]
 * @param {string} data.nome
 * @param {string} [data.descricao]
 * @param {string} data.atributo `fisico`, `mente`, `emocao` ou `todos`.
 * @param {number} data.passos −3 a +3.
 * @param {string} [data.duracao='cena']
 * @param {string} [data.origem='']
 */
export function newStepEffect({
  id = '',
  nome,
  descricao = '',
  atributo,
  passos,
  duracao = 'cena',
  origem = '',
}) {
  const attr = validAttribute(atributo);
  return {
    ...newEffect(id),
    nome: text(nome),
    descricao: text(descricao),
    origem,
    duracao: DURATIONS.includes(duracao) ? duracao : 'manual',
    efeitos: attr ? [attributeStep(attr, passos)] : [],
  };
}

// ---------- Formato antigo e limpeza ----------

/**
 * O efeito está no formato antigo (até a v0.21.x)? Ele não tem a lista `efeitos` e tem algum dos
 * campos fixos (`atributo`, `passos`, `fimDeCena`).
 */
export function isLegacyEffect(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw.efeitos)) return false;
  return 'atributo' in raw || 'passos' in raw || 'fimDeCena' in raw;
}

/**
 * Converte um efeito do formato antigo: o atributo e os passos viram um `passo` (sem atributo,
 * nenhum), e «até o fim da cena» vira a duração `cena` (senão, `manual`).
 * @param {object} raw Efeito antigo.
 * @param {string} [id] Id para o efeito (o antigo não tinha).
 */
export function migrateLegacyEffect(raw, id = '') {
  const fimDeCena = raw.fimDeCena === true || raw.fimDeCena === 'true';
  return newStepEffect({
    id: text(raw.id) || id,
    nome: raw.nome,
    descricao: raw.descricao,
    atributo: raw.atributo,
    passos: raw.passos,
    duracao: fimDeCena ? 'cena' : 'manual',
    origem: text(raw.origem),
  });
}

/**
 * Limpa um efeito da aba Condição: campos de texto, duração conhecida e só os efeitos do catálogo
 * que a aba aceita. Um efeito antigo é convertido antes.
 * @param {object} raw
 * @param {string} [fallbackId] Id usado se o efeito não tiver um.
 */
export function normalizeSheetEffect(raw, fallbackId = '') {
  const source = isLegacyEffect(raw) ? migrateLegacyEffect(raw, fallbackId) : (raw ?? {});
  const allowed = itemEffectTypes(CONDITION_ITEM_TYPE);
  return {
    id: text(source.id) || fallbackId,
    nome: text(source.nome),
    descricao: text(source.descricao),
    chave: text(source.chave),
    origem: text(source.origem),
    duracao: DURATIONS.includes(source.duracao) ? source.duracao : 'manual',
    efeitos: normalizeEffects(source.efeitos).filter((e) => allowed.includes(e.tipo)),
  };
}

/** Limpa uma lista de efeitos da aba Condição (sem id: `ef0`, `ef1`...). */
export function normalizeSheetEffects(list) {
  if (!Array.isArray(list)) return [];
  return list.map((raw, i) => normalizeSheetEffect(raw, `ef${i}`));
}

// ---------- Edição na ficha ----------

/**
 * Acrescenta um efeito novo ao fim da lista (devolve uma lista nova).
 * @param {object[]} effects
 * @param {string} [id] Id do efeito novo.
 */
export function addEffect(effects, id = '') {
  return [...normalizeSheetEffects(effects), newEffect(id)];
}

/** Remove o efeito do índice indicado (devolve uma lista nova). */
export function removeEffect(effects, index) {
  return normalizeSheetEffects(effects).filter((_, i) => i !== index);
}

/** O `passo` pode ser editado pela linha simples da ficha (atributo, em qualquer teste)? */
const isSimpleStep = (entry) =>
  entry.tipo === 'passo' && entry.params.alvo === 'atributo' && entry.params.teste === 'qualquer';

/**
 * Posição do `passo` que a linha simples da ficha mostra e edita, ou −1. Só existe quando o
 * efeito não tem nada além dele (um efeito com mais coisas é editado no editor da v0.22.1).
 */
export function bridgeEntry(effect) {
  const list = effect?.efeitos ?? [];
  return list.length === 1 && isSimpleStep(list[0]) ? 0 : -1;
}

/** A linha simples da ficha consegue mostrar este efeito inteiro (nenhum passo, ou um simples)? */
export function isBridgeable(effect) {
  const list = effect?.efeitos ?? [];
  return list.length === 0 || bridgeEntry(effect) === 0;
}

/**
 * Atributo e passos que a linha simples da ficha mostra: os do `passo` simples, ou nenhum.
 * @returns {{atributo: string, passos: number}}
 */
export function effectView(effect) {
  const index = bridgeEntry(effect);
  if (index === -1) return { atributo: '', passos: 0 };
  const { atributo, passos } = effect.efeitos[index].params;
  return { atributo, passos };
}

/**
 * Altera campos de um efeito pela linha da ficha. `nome` e `descricao` são texto; `fimDeCena`
 * liga a duração `cena` (desligado volta a `manual`; uma duração `permanente` não muda). Em
 * efeitos que a linha simples mostra (`isBridgeable`), `atributo` e `passos` gravam o `passo`
 * simples: atributo vazio o tira; um atributo novo o cria (com 0 passos). Campos desconhecidos e
 * a origem são ignorados.
 */
export function updateEffect(effects, index, changes) {
  return normalizeSheetEffects(effects).map((effect, i) => {
    if (i !== index) return effect;
    const next = { ...effect, efeitos: [...effect.efeitos] };
    if ('nome' in changes) next.nome = String(changes.nome ?? '');
    if ('descricao' in changes) next.descricao = String(changes.descricao ?? '');
    if ('duracao' in changes && DURATIONS.includes(changes.duracao)) {
      next.duracao = changes.duracao;
    }
    if ('fimDeCena' in changes) {
      const on = changes.fimDeCena === true || changes.fimDeCena === 'true';
      if (on) next.duracao = 'cena';
      else if (next.duracao === 'cena') next.duracao = 'manual';
    }
    if (!isBridgeable(effect)) return next;

    const current = effectView(effect);
    if ('atributo' in changes) {
      const attr = validAttribute(String(changes.atributo ?? ''));
      next.efeitos = attr ? [attributeStep(attr, current.passos)] : [];
    }
    if ('passos' in changes && next.efeitos.length) {
      const steps = Math.trunc(Number(changes.passos));
      const passos = Number.isFinite(steps) ? steps : current.passos;
      next.efeitos = [attributeStep(next.efeitos[0].params.atributo, passos)];
    }
    return next;
  });
}

/**
 * Garante que cada efeito tem um id próprio e único, para a janela de edição achar o efeito mesmo
 * se a lista mudar de ordem. Efeitos sem id gravado (os antigos, até a primeira gravação) ou com
 * id repetido ganham um novo.
 * @param {object[]} effects `system.efeitos` como está no banco.
 * @param {() => string} makeId Gera um id novo (no Foundry, `foundry.utils.randomID`).
 * @returns {{list: object[], changed: boolean}} Lista limpa e se algum id mudou (precisa gravar).
 */
export function withEffectIds(effects, makeId) {
  const raw = Array.isArray(effects) ? effects : [];
  const seen = new Set();
  let changed = false;
  const list = normalizeSheetEffects(raw).map((effect, i) => {
    const stored = text(raw[i]?.id);
    if (stored && !seen.has(stored)) {
      seen.add(stored);
      return effect;
    }
    changed = true;
    let id = makeId();
    while (seen.has(id)) id = makeId();
    seen.add(id);
    return { ...effect, id };
  });
  return { list, changed };
}

/** Posição do efeito com este id na lista (−1 se não houver). */
export function findEffectIndex(effects, id) {
  return normalizeSheetEffects(effects).findIndex((effect) => effect.id === id);
}

/**
 * Troca a lista do catálogo (`efeitos`) de um efeito da aba Condição, por exemplo depois de uma
 * mudança no editor. Os tipos que a aba não aceita são descartados (devolve uma lista nova).
 * @param {object[]} effects `system.efeitos`.
 * @param {number} index Posição do efeito.
 * @param {object[]} entries Lista nova do catálogo (`{id, tipo, params}`).
 */
export function replaceEffectEntries(effects, index, entries) {
  const allowed = itemEffectTypes(CONDITION_ITEM_TYPE);
  return normalizeSheetEffects(effects).map((effect, i) =>
    i === index
      ? { ...effect, efeitos: normalizeEffects(entries).filter((e) => allowed.includes(e.tipo)) }
      : effect,
  );
}

/**
 * Efeito da aba Condição copiado de um Item do tipo `efeito` (do mundo ou de um compêndio). A cópia
 * não fica ligada ao item: mudar o item depois não muda a ficha. A `chave` diz de onde veio: a do
 * próprio item, se tiver (as lesões e traumas prontos terão, na 0.22.2), senão o endereço (uuid)
 * dele. A origem fica vazia: para a ficha, é um efeito comum.
 * @param {{name: string, system: object}} itemData Dados do item (`item.toObject()`).
 * @param {{id?: string, uuid?: string}} [options] Id do efeito novo e endereço do item.
 */
export function effectFromItem(itemData, { id = '', uuid = '' } = {}) {
  const system = itemData?.system ?? {};
  return normalizeSheetEffect(
    {
      id,
      nome: itemData?.name,
      descricao: system.descricao,
      chave: text(system.chave) || uuid,
      origem: '',
      duracao: system.duracao,
      efeitos: system.efeitos,
    },
    id,
  );
}

// ---------- Fim de cena ----------

/** O efeito acaba na Nova cena? */
export const endsAtScene = (effect) => normalizeSheetEffect(effect).duracao === 'cena';

/** Efeitos que continuam depois da Nova cena (os de duração `cena` saem). */
export function keepAfterScene(effects) {
  return normalizeSheetEffects(effects).filter((effect) => effect.duracao !== 'cena');
}

// ---------- Passos nos testes ----------

/**
 * O `passo` vale neste tipo de teste? `qualquer` vale em todos; `ataque`, nos dois tipos de
 * ataque; os outros, só no próprio tipo.
 * @param {string} kind `teste` do passo.
 * @param {string} testKind Tipo do teste feito (`qualquer`, `ataqueCorpo`, `ataqueDistancia`,
 *   `defesa`).
 */
export function stepTestMatches(kind, testKind = 'qualquer') {
  if (kind === 'qualquer' || kind === testKind) return true;
  return kind === 'ataque' && (testKind === 'ataqueCorpo' || testKind === 'ataqueDistancia');
}

/** Todos os `passo` dos efeitos (já limpos). */
function stepEntries(effects) {
  return normalizeSheetEffects(effects).flatMap((effect) =>
    effect.efeitos.filter((entry) => entry.tipo === 'passo' && entry.params.passos !== 0),
  );
}

/**
 * Aumentos e reduções de passo que os efeitos dão num teste: no dado do atributo (o do teste, ou
 * `todos`), no dado da perícia (qualquer perícia, ou só a do teste), conforme o tipo do teste.
 * @param {object[]} effects `system.efeitos`.
 * @param {{attrKey: string, skillKey?: string, testKind?: string}} test
 * @returns {{target: 'attribute'|'skill', steps: number}[]}
 */
export function conditionStepMods(effects, { attrKey, skillKey = '', testKind = 'qualquer' }) {
  const mods = [];
  for (const { params } of stepEntries(effects)) {
    if (!stepTestMatches(params.teste, testKind)) continue;
    if (params.alvo === 'atributo') {
      if (params.atributo === attrKey || params.atributo === ALL_ATTRIBUTES) {
        mods.push({ target: 'attribute', steps: params.passos });
      }
    } else if (params.alvo === 'pericias' || (skillKey && params.pericia === skillKey)) {
      mods.push({ target: 'skill', steps: params.passos });
    }
  }
  return mods;
}

/** Passos que os efeitos dão ao dado do atributo em qualquer teste (só o atributo). */
export function effectStepMods(effects, attrKey) {
  return conditionStepMods(effects, { attrKey }).filter((mod) => mod.target === 'attribute');
}

/**
 * De onde vêm os passos dos efeitos no dado de um atributo, nos testes em geral (o que a ficha
 * mostra): um registro por `passo`, com o nome do efeito. Os que valem só em ataques ou defesas
 * não entram. Serve para a dica da ficha e para ver passos que se anulam (v0.23.1).
 * @param {object[]} effects `system.efeitos`.
 * @param {string} attrKey Atributo.
 * @returns {{name: string, steps: number}[]}
 */
export function attributeStepSources(effects, attrKey) {
  const sources = [];
  for (const effect of normalizeSheetEffects(effects)) {
    for (const { tipo, params } of effect.efeitos) {
      if (tipo !== 'passo' || params.passos === 0 || params.alvo !== 'atributo') continue;
      if (!stepTestMatches(params.teste, 'qualquer')) continue;
      if (params.atributo === attrKey || params.atributo === ALL_ATTRIBUTES) {
        sources.push({ name: effect.nome, steps: params.passos });
      }
    }
  }
  return sources;
}

/**
 * Saldo de passos dos efeitos no dado de um atributo, nos testes em geral (o que a ficha mostra;
 * os que valem só em ataques ou defesas não entram).
 */
export function attributeStepNet(effects, attrKey) {
  return attributeStepSources(effects, attrKey).reduce((sum, source) => sum + source.steps, 0);
}

// ---------- Modificadores, dano emocional e máximo (v0.22.2) ----------

/** Todos os efeitos do catálogo de um tipo, de todos os efeitos da lista (já limpos). */
function entriesOfType(effects, tipo) {
  return normalizeSheetEffects(effects).flatMap((effect) =>
    effect.efeitos.filter((entry) => entry.tipo === tipo),
  );
}

/**
 * Modificador fixo que os efeitos dão ao total de um teste: os de testes com o atributo do teste
 * (ou com qualquer atributo) e os da perícia do teste. É o que as lesões e os traumas fazem
 * (Sem Olho −1 em Percepção, Degradação Cognitiva −1 em Mente...).
 * @param {object[]} effects `system.efeitos`.
 * @param {{attrKey?: string, skillKey?: string}} test
 */
export function conditionModifier(effects, { attrKey = '', skillKey = '' } = {}) {
  return entriesOfType(effects, 'modificador').reduce((sum, { params }) => {
    const applies =
      params.sobre === 'atributo'
        ? params.atributo === ALL_ATTRIBUTES || (attrKey && params.atributo === attrKey)
        : Boolean(skillKey) && params.pericia === skillKey;
    return applies ? sum + params.mod : sum;
  }, 0);
}

/** Quanto cada dano emocional aumenta (soma dos `danoEmocionalExtra`, como o estresse). */
export function emotionalExtra(effects) {
  return entriesOfType(effects, 'danoEmocionalExtra').reduce((sum, e) => sum + e.params.extra, 0);
}

/**
 * Quanto o máximo de um recurso diminui (soma das `reducaoMaximo` dele).
 * @param {object[]} effects
 * @param {'pv'|'pd'} resource
 */
export function maxReduction(effects, resource) {
  return entriesOfType(effects, 'reducaoMaximo')
    .filter((entry) => entry.params.recursoMax === resource)
    .reduce((sum, entry) => sum + entry.params.reducao, 0);
}

/**
 * Máximo de um recurso com os efeitos: base − reduções (nunca abaixo de 0). A ficha guarda só a
 * base (`pv.base`, `pd.base`); o máximo é calculado sempre que o ator é preparado.
 */
export function effectiveMax(base, effects, resource) {
  const value = Number.isFinite(Number(base)) ? Math.trunc(Number(base)) : 0;
  return Math.max(0, value - maxReduction(effects, resource));
}

/**
 * Base que corresponde a um máximo escolhido (alguém mudou o máximo direto, por exemplo por uma
 * macro): o máximo mais as reduções atuais, para o máximo calculado sair igual ao escolhido.
 */
export function baseForMax(max, effects, resource) {
  const value = Number.isFinite(Number(max)) ? Math.max(0, Math.trunc(Number(max))) : 0;
  return value + maxReduction(effects, resource);
}

// ---------- Efeitos que outros sistemas criam ----------

/**
 * Efeito da aba Condição que um item entrega (efeito `passoAlvo`, como um tônico): passos no
 * atributo até o fim da cena, com o nome do item. Cada uso é um efeito à parte (eles somam; o dado
 * para em d12).
 * @param {{id?: string, nome: string, descricao?: string, atributo: string, passos: number}} data
 */
export function itemStepEffect({ id = '', nome, descricao = '', atributo, passos }) {
  return newStepEffect({
    id,
    nome,
    descricao,
    // Um item não dá passos «em todos os atributos»: só num deles
    atributo: ATRIBUTOS.includes(atributo) ? atributo : '',
    passos,
    duracao: 'cena',
    origem: 'item',
  });
}
