/**
 * Lesões e traumas como efeitos da aba Condição (v0.22.2) e os outros efeitos prontos do
 * compêndio «Efeitos básicos» (v0.22.3: condições de combate e falha crítica). Lógica pura, sem
 * dependência do Foundry.
 *
 * As tabelas (`LESIONS` em injury.js, `TRAUMAS` em emotional.js) continuam sendo a fonte da
 * mecânica. Quando uma lesão ou um trauma que fica na ficha sai na tabela, o sistema cria um
 * efeito com:
 * - `chave` = `lesao:<chave>` ou `trauma:<chave>` (identifica o efeito pronto: «já tem, role de
 *   novo» e o texto traduzido vêm dela);
 * - nome e descrição vazios: a ficha mostra o texto traduzido pela chave enquanto ninguém editar
 *   (veja `effectText`); um texto escrito na janela do efeito passa a valer no lugar;
 * - duração `permanente` (a contusão: `cena`);
 * - os efeitos do catálogo montados da tabela (`tableEffectEntries`).
 */
import { LESIONS } from './injury.js';
import { TRAUMAS } from './emotional.js';
import { DISASTERS } from './critical-failure.js';
import { normalizeEffect } from './ability-effects.js';
import { normalizeSheetEffects } from './effects.js';

/** Tipos de tabela e o prefixo das chaves dos efeitos que elas criam. */
export const TABLE_KINDS = Object.freeze({ lesao: LESIONS, trauma: TRAUMAS });

/** Passo simples para os efeitos prontos (`pericias` = dado de qualquer perícia). */
const step = (params) => ({ tipo: 'passo', params: { passos: -1, teste: 'qualquer', ...params } });

/**
 * Condições de combate do compêndio «Efeitos básicos» (v0.22.3), com chave `cond:<chave>`. Só as
 * que mudam os testes da própria pessoa têm passos; as outras (que afetam ações ou quem ataca)
 * são só descrição, para o mestre resolver. Duração: até remover.
 */
export const COMBAT_CONDITIONS = Object.freeze([
  // −1 passo nos testes de Físico (ataques contra quem está caído: descrição)
  { key: 'caido', efeitos: [step({ alvo: 'atributo', atributo: 'fisico' })] },
  // −1 passo no dado da perícia nos ataques
  { key: 'agarrado', efeitos: [step({ alvo: 'pericias', teste: 'ataque' })] },
  // −1 passo no dado da perícia no próximo teste (a pessoa remove depois de usar)
  { key: 'desequilibrado', efeitos: [step({ alvo: 'pericias' })] },
  { key: 'atordoado', efeitos: [] },
  { key: 'imovel', efeitos: [] },
  { key: 'sobrecarregado', efeitos: [] },
  { key: 'coberturaLeve', efeitos: [] },
  { key: 'coberturaTotal', efeitos: [] },
  { key: 'ocultacaoLeve', efeitos: [] },
  { key: 'ocultacaoTotal', efeitos: [] },
]);

/** Efeitos de falha crítica que ficam na ficha (−1 passo num atributo até o fim da cena). */
export const DISASTER_EFFECTS = Object.freeze(DISASTERS.filter((entry) => entry.kind === 'step'));

/**
 * Todos os efeitos prontos, pelo prefixo da chave: a lista de entradas, onde ficam os textos no
 * idioma (`<base>.<chave>.Nome` / `.Descricao`) e a duração da cópia.
 */
const PRESETS = Object.freeze({
  lesao: { list: LESIONS, base: 'DESORDEM.Lesoes' },
  trauma: { list: TRAUMAS, base: 'DESORDEM.Traumas' },
  cond: { list: COMBAT_CONDITIONS, base: 'DESORDEM.Condicoes' },
  falha: { list: DISASTER_EFFECTS, base: 'DESORDEM.FalhaCritica' },
});

/** Chave do efeito da contusão (lesão temporária, até o fim da cena). */
export const CONTUSION_KEY = 'lesao:contusao';

/**
 * A entrada da tabela vira um efeito na ficha? As lesões permanentes e a contusão, e os traumas
 * persistentes. As outras (morte, adrenalina, pânico, estupor...) mudam outras partes da ficha.
 */
export function storesEffect(entry) {
  return entry?.kind === 'permanent' || entry?.kind === 'temporary';
}

/**
 * Efeitos do catálogo de uma entrada da tabela:
 * - `mods` (por perícia) e `attrMods` (por atributo) → `modificador`;
 * - `extraDamage` → `danoEmocionalExtra`;
 * - `pvMaxLoss` / `pdMaxLoss` → `reducaoMaximo`;
 * - a contusão (lesão temporária) → `passo` −1 no dado de Físico.
 * Os ids são `m0`, `m1`... (únicos dentro do efeito).
 */
export function tableEffectEntries(entry) {
  const raw = [];
  for (const [pericia, mod] of Object.entries(entry.mods ?? {})) {
    raw.push({ tipo: 'modificador', params: { sobre: 'pericia', pericia, mod } });
  }
  for (const [atributo, mod] of Object.entries(entry.attrMods ?? {})) {
    raw.push({ tipo: 'modificador', params: { sobre: 'atributo', atributo, mod } });
  }
  if (entry.extraDamage) {
    raw.push({ tipo: 'danoEmocionalExtra', params: { extra: entry.extraDamage } });
  }
  if (entry.pvMaxLoss) {
    raw.push({ tipo: 'reducaoMaximo', params: { recursoMax: 'pv', reducao: entry.pvMaxLoss } });
  }
  if (entry.pdMaxLoss) {
    raw.push({ tipo: 'reducaoMaximo', params: { recursoMax: 'pd', reducao: entry.pdMaxLoss } });
  }
  if (entry.kind === 'temporary') {
    raw.push({
      tipo: 'passo',
      params: { alvo: 'atributo', atributo: 'fisico', passos: -1, teste: 'qualquer' },
    });
  }
  return raw.map((e, i) => normalizeEffect({ ...e, id: `m${i}` }));
}

/**
 * Efeito da aba Condição de uma lesão, de um trauma ou de outro efeito pronto (condição de combate,
 * falha crítica), com o texto vazio (traduzido pela chave).
 * @param {'lesao'|'trauma'|'cond'|'falha'} kind Tabela ou grupo do efeito pronto.
 * @param {object} entry Entrada da tabela (ou de `COMBAT_CONDITIONS`, `DISASTER_EFFECTS`).
 * @param {string} [id] Id do efeito (no Foundry, `foundry.utils.randomID()`).
 */
export function tableEffect(kind, entry, id = '') {
  return {
    id,
    nome: '',
    descricao: '',
    chave: `${kind}:${entry.key}`,
    // A origem marca só o que as tabelas criaram (as cópias do compêndio são efeitos comuns)
    origem: TABLE_KINDS[kind] ? kind : '',
    duracao: presetDuration(kind, entry),
    efeitos: presetEntries(kind, entry),
  };
}

/**
 * Efeito pronto de uma chave (`lesao:<chave>`, `trauma:<chave>`, `cond:<chave>`,
 * `falha:<chave>`), ou `null` se a chave não for de um efeito pronto (um uuid, uma chave escrita
 * à mão...).
 * @returns {{kind: string, entry: object, base: string}|null} `base`: onde ficam os textos.
 */
export function presetOf(chave) {
  const [kind, key] = String(chave ?? '').split(':');
  const preset = PRESETS[kind];
  const entry = preset?.list.find((e) => e.key === key);
  return entry ? { kind, entry, base: preset.base } : null;
}

/** Só as lesões e os traumas das tabelas (o «já tem, role de novo» e a etiqueta de origem). */
export function tableEntryOf(chave) {
  const found = presetOf(chave);
  return found && TABLE_KINDS[found.kind] ? found : null;
}

/** Efeitos do catálogo de um efeito pronto (as tabelas montam os seus da mecânica delas). */
export function presetEntries(kind, entry) {
  if (TABLE_KINDS[kind]) return tableEffectEntries(entry);
  const raw =
    kind === 'falha' ? [step({ alvo: 'atributo', atributo: entry.attr })] : (entry.efeitos ?? []);
  return raw.map((e, i) => normalizeEffect({ ...e, id: `m${i}` }));
}

/** Duração da cópia de um efeito pronto: lesões e traumas permanentes, condições até remover. */
export function presetDuration(kind, entry) {
  if (kind === 'cond') return 'manual';
  if (kind === 'falha') return 'cena';
  return entry.kind === 'temporary' ? 'cena' : 'permanente';
}

/**
 * Tira o nome e a descrição da cópia de um efeito pronto (Item de efeito com chave conhecida),
 * para a ficha mostrar o texto traduzido pela chave, como nas lesões e traumas das tabelas.
 */
export function clearPresetText(effect) {
  return presetOf(effect?.chave) ? { ...effect, nome: '', descricao: '' } : effect;
}

/**
 * Chaves (das tabelas) das lesões ou dos traumas que a ficha tem, repetidas se houver mais de um
 * (Laceração Profunda, Chaga da Alma). É o «owned» de `pickLesion` / `pickTrauma`.
 * @param {object[]} effects `system.efeitos`.
 * @param {'lesao'|'trauma'} kind
 */
export function ownedTableKeys(effects, kind) {
  return normalizeSheetEffects(effects)
    .map((effect) => tableEntryOf(effect.chave))
    .filter((found) => found?.kind === kind)
    .map((found) => found.entry.key);
}

/** A ficha tem a contusão (o efeito dela)? */
export function hasContusion(effects) {
  return normalizeSheetEffects(effects).some((effect) => effect.chave === CONTUSION_KEY);
}

/**
 * Nome e descrição para mostrar: os do efeito ou, vazios, os traduzidos pela chave (lesões e
 * traumas das tabelas e as cópias dos efeitos prontos do compêndio).
 * @param {{nome: string, descricao: string, chave: string}} effect
 * @param {(key: string) => string} t Tradução.
 * @returns {{nome: string, descricao: string, kind: string}} `kind` é a tabela (`lesao`,
 *   `trauma`) ou vazio (condições, falha crítica e os feitos à mão).
 */
export function effectText(effect, t) {
  const found = presetOf(effect?.chave);
  if (!found) return { nome: effect?.nome ?? '', descricao: effect?.descricao ?? '', kind: '' };
  return {
    nome: effect.nome || t(`${found.base}.${found.entry.key}.Nome`),
    descricao: effect.descricao || t(`${found.base}.${found.entry.key}.Descricao`),
    // Etiqueta de origem só para as lesões e os traumas (as condições são «Efeito»)
    kind: TABLE_KINDS[found.kind] ? found.kind : '',
  };
}

/**
 * Lesões e traumas do formato antigo (até a v0.21.x: listas de chaves) e a caixa da contusão
 * convertidos em efeitos. Os ids são fixos (`les0`, `tra0`, `contusao0`), para a conversão sair
 * igual a cada vez que roda antes de ser gravada; um id que a lista já tem não é acrescentado de
 * novo.
 * @param {{lesoes?: string[], traumas?: string[], contusao?: boolean}} old
 * @param {Set<string>} existingIds Ids que a lista de efeitos já tem.
 * @returns {object[]} Efeitos a acrescentar.
 */
export function legacyTableEffects({ lesoes = [], traumas = [], contusao = false }, existingIds) {
  const added = [];
  const push = (kind, key, id) => {
    const entry = TABLE_KINDS[kind].find((e) => e.key === key);
    if (entry && storesEffect(entry) && !existingIds.has(id)) {
      added.push(tableEffect(kind, entry, id));
    }
  };
  lesoes.forEach((key, i) => push('lesao', key, `les${i}`));
  traumas.forEach((key, i) => push('trauma', key, `tra${i}`));
  if (contusao) push('lesao', 'contusao', 'contusao0');
  return added;
}

/**
 * Quanto o máximo de PV e de PD baixou com as lesões e traumas antigos (que mudavam o máximo
 * gravado): é o que a base precisa somar de volta na migração.
 */
export function legacyMaxLoss({ lesoes = [], traumas = [] }) {
  const sum = (list, table, field) =>
    list.reduce((total, key) => total + (table.find((e) => e.key === key)?.[field] ?? 0), 0);
  return {
    pv: sum(lesoes, LESIONS, 'pvMaxLoss'),
    pd: sum(traumas, TRAUMAS, 'pdMaxLoss'),
  };
}
