/**
 * Lesões e traumas como efeitos da aba Condição (v0.22.2). Lógica pura, sem dependência do
 * Foundry.
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
import { normalizeEffect } from './ability-effects.js';
import { normalizeSheetEffects } from './effects.js';

/** Tipos de tabela e o prefixo das chaves dos efeitos que elas criam. */
export const TABLE_KINDS = Object.freeze({ lesao: LESIONS, trauma: TRAUMAS });

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
 * Efeito da aba Condição de uma lesão ou de um trauma.
 * @param {'lesao'|'trauma'} kind Tabela.
 * @param {object} entry Entrada da tabela.
 * @param {string} [id] Id do efeito (no Foundry, `foundry.utils.randomID()`).
 */
export function tableEffect(kind, entry, id = '') {
  return {
    id,
    nome: '',
    descricao: '',
    chave: `${kind}:${entry.key}`,
    origem: kind,
    duracao: entry.kind === 'temporary' ? 'cena' : 'permanente',
    efeitos: tableEffectEntries(entry),
  };
}

/**
 * Tabela e entrada de uma chave `lesao:<chave>` / `trauma:<chave>` (ou `null` se a chave não for
 * de uma tabela, como as do compêndio ou um uuid).
 * @returns {{kind: string, entry: object}|null}
 */
export function tableEntryOf(chave) {
  const [kind, key] = String(chave ?? '').split(':');
  const entry = TABLE_KINDS[kind]?.find((e) => e.key === key);
  return entry ? { kind, entry } : null;
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
 * traumas inseridos pelas tabelas).
 * @param {{nome: string, descricao: string, chave: string}} effect
 * @param {(key: string) => string} t Tradução.
 * @returns {{nome: string, descricao: string, kind: string}} `kind` é a tabela (`lesao`,
 *   `trauma`) ou vazio.
 */
export function effectText(effect, t) {
  const found = tableEntryOf(effect?.chave);
  if (!found) return { nome: effect?.nome ?? '', descricao: effect?.descricao ?? '', kind: '' };
  const base = found.kind === 'lesao' ? 'DESORDEM.Lesoes' : 'DESORDEM.Traumas';
  return {
    nome: effect.nome || t(`${base}.${found.entry.key}.Nome`),
    descricao: effect.descricao || t(`${base}.${found.entry.key}.Descricao`),
    kind: found.kind,
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
