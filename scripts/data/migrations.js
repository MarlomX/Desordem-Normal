/**
 * Migrações de dados salvos: funções puras, sem dependência do Foundry.
 * Cada função recebe os dados "crus" do ator (como estão no banco), ajusta e devolve o mesmo objeto.
 * Todas podem rodar várias vezes sem estragar nada (idempotentes).
 */
import { isLegacyEffect, migrateLegacyEffect } from '../rolls/effects.js';
import { legacyMaxLoss, legacyTableEffects } from '../rolls/condition-tables.js';
import { looksLikeHtml, plainTextToHtml } from '../sheets/notes.js';

/**
 * Até a v0.14.4 a perícia `metalurgia` era uma perícia comum. Nas regras 1.1 ela virou uma área
 * do Ofício, então o dado vai de `pericias.metalurgia` para `oficios.metalurgia`.
 * Se a área nova já tiver valor, o valor novo vence e o antigo é só descartado.
 * @param {object} source Dados do ator (`system`), possivelmente de uma versão antiga.
 */
export function migrateCraftSkill(source) {
  const old = source?.pericias;
  if (!old || !Object.hasOwn(old, 'metalurgia')) return source;

  const value = old.metalurgia;
  delete old.metalurgia;

  source.oficios ??= {};
  if (source.oficios.metalurgia === undefined && value !== undefined) {
    source.oficios.metalurgia = value;
  }
  return source;
}

/**
 * Até a v0.19.x o ímpeto e a análise tinham campos fixos (`recursos.impeto`, `recursos.analise`).
 * Desde a v0.20.0 o valor de cada recurso das habilidades fica no mapa `recursosHab`, pela chave
 * do recurso. Só copia se o mapa ainda não existe (o campo antigo fica onde está, sem uso).
 * @param {object} source Dados do ator (`system`), possivelmente de uma versão antiga.
 */
export function migrateAbilityResources(source) {
  const old = source?.recursos;
  if (!source || source.recursosHab !== undefined || !old || typeof old !== 'object') {
    return source;
  }
  const count = (value) => (Number.isInteger(value) && value > 0 ? value : 0);
  source.recursosHab = { impeto: count(old.impeto), analise: count(old.analise) };
  return source;
}

/**
 * Até a v0.21.x os efeitos da aba Condição (`efeitos`, no personagem e na criatura) tinham o
 * formato fixo `{nome, descricao, atributo, passos, fimDeCena, origem}`. Desde a v0.22.0 eles são
 * modulares (`{id, nome, descricao, chave, origem, duracao, efeitos}`, veja rolls/effects.js).
 * Só os efeitos no formato antigo mudam: os já convertidos (com a lista `efeitos`) ficam como
 * estão. Isso importa porque o Foundry também passa por aqui as mudanças de uma gravação, que já
 * vêm no formato novo.
 *
 * O id dos convertidos é a posição (`ef0`, `ef1`...): como a migração só é gravada na próxima
 * gravação do ator, ela pode rodar a cada carregamento, e o id precisa sair igual todas as vezes.
 * @param {object} source Dados do ator (`system`), possivelmente de uma versão antiga.
 */
export function migrateConditionEffects(source) {
  if (!Array.isArray(source?.efeitos) || !source.efeitos.some(isLegacyEffect)) return source;
  source.efeitos = source.efeitos.map((effect, i) =>
    isLegacyEffect(effect) ? migrateLegacyEffect(effect, `ef${i}`) : effect,
  );
  return source;
}

/**
 * Até a v0.22.1 o personagem tinha as listas `lesoes` e `traumas` (chaves das tabelas), a caixa
 * `estado.contusao`, e o PV/PD máximo gravado já com as perdas das lesões e traumas. Desde a
 * v0.22.2:
 * - cada lesão, trauma e a contusão viram um efeito da aba Condição (`legacyTableEffects`, com
 *   ids fixos `les0`, `tra0`, `contusao0`: rodar de novo não duplica);
 * - a base do PV/PD (`pv.base`, `pd.base`) = máximo antigo + o que as lesões e traumas tinham
 *   tirado (2 por Laceração Profunda, 2 por Chaga da Alma), para o máximo calculado sair igual;
 * - os campos antigos saem.
 * Só roda nos dados completos de antes (que têm as listas antigas): as mudanças de uma gravação
 * não as têm. A base também não muda se já existir.
 * @param {object} source Dados do personagem (`system`).
 */
export function migrateConditionTables(source) {
  if (!source || !(Array.isArray(source.lesoes) || Array.isArray(source.traumas))) return source;
  const old = {
    lesoes: Array.isArray(source.lesoes) ? source.lesoes : [],
    traumas: Array.isArray(source.traumas) ? source.traumas : [],
    contusao: source.estado?.contusao === true,
  };
  const loss = legacyMaxLoss(old);
  for (const key of ['pv', 'pd']) {
    const resource = source[key];
    if (resource && typeof resource === 'object' && resource.base === undefined) {
      const max = Number(resource.max);
      if (Number.isFinite(max)) resource.base = Math.max(0, Math.trunc(max)) + loss[key];
    }
  }
  const efeitos = Array.isArray(source.efeitos) ? source.efeitos : [];
  const ids = new Set(efeitos.map((effect) => effect?.id).filter(Boolean));
  source.efeitos = [...efeitos, ...legacyTableEffects(old, ids)];
  delete source.lesoes;
  delete source.traumas;
  if (source.estado && typeof source.estado === 'object') delete source.estado.contusao;
  return source;
}

/**
 * Criatura (e outros tipos de ameaça): até a v0.22.1 o PV máximo era gravado direto; desde a
 * v0.22.2 há a base (o máximo sem efeitos). A base nasce igual ao máximo, nos dados completos
 * (com valor e máximo); mudanças de uma gravação com só o máximo também viram a base.
 * @param {object} source Dados da criatura (`system`).
 */
export function migrateThreatBase(source) {
  const pv = source?.pv;
  if (!pv || typeof pv !== 'object' || pv.base !== undefined) return source;
  const max = Number(pv.max);
  if (Number.isFinite(max)) pv.base = Math.max(0, Math.trunc(max));
  return source;
}

/** Notas da criatura que viraram editor rico (HTML) na v0.23.2. */
const THREAT_NOTE_KEYS = ['estrategia', 'descricao'];

/**
 * Criatura (e outros tipos de ameaça): até a v0.23.1 a estratégia e a descrição eram texto
 * simples (`textarea`); desde a v0.23.2 são HTML (editor rico). O texto antigo vira parágrafos,
 * para as quebras de linha não sumirem. Texto que já começa por marcação não muda (a migração
 * roda a cada carga e não pode converter duas vezes).
 * @param {object} source Dados da criatura (`system`).
 */
export function migrateThreatNotes(source) {
  if (!source || typeof source !== 'object') return source;
  for (const key of THREAT_NOTE_KEYS) {
    const text = source[key];
    if (typeof text === 'string' && text.trim() && !looksLikeHtml(text)) {
      source[key] = plainTextToHtml(text);
    }
  }
  return source;
}

// ---------- Itens (equipamentos) ----------

/**
 * Até a v0.20.x a arma tinha `natural` (verdadeiro ou falso) e `maos` (1 ou 2). Desde a v0.21.0
 * ela tem `categoria` (natural, simples ou marcial) e `empunhadura` (uma ou duas mãos).
 * - Arma natural vira categoria `natural`; qualquer outra vira `simples` (categoria desconhecida
 *   = simples; marcial só se a pessoa escolher).
 * - `maos: 2` vira empunhadura `duas`; o resto, `uma`.
 *
 * Só preenche o campo novo se ele ainda não existe E o campo antigo está nos dados. Isso importa
 * porque o Foundry também pode passar por aqui só as mudanças de uma gravação (ex.:
 * `{empunhada: true}`): sem o campo antigo, nada muda e a categoria já gravada não é tocada.
 * Os campos antigos ficam no banco, sem uso (o modelo os descarta ao ler).
 * @param {object} source Dados da arma (`system`), possivelmente de uma versão antiga.
 */
export function migrateWeaponSource(source) {
  if (!source || typeof source !== 'object') return source;
  if (source.categoria === undefined && 'natural' in source) {
    source.categoria = source.natural === true ? 'natural' : 'simples';
  }
  migrateGrip(source);
  return source;
}

/**
 * Item geral: `maos` (1 ou 2) vira `empunhadura` (uma ou duas), pela mesma regra da arma.
 * @param {object} source Dados do item (`system`).
 */
export function migrateGearSource(source) {
  if (!source || typeof source !== 'object') return source;
  migrateGrip(source);
  return source;
}

/** `maos` → `empunhadura`, só se a empunhadura ainda não existe e `maos` está nos dados. */
function migrateGrip(source) {
  if (source.empunhadura === undefined && 'maos' in source) {
    source.empunhadura = Number(source.maos) === 2 ? 'duas' : 'uma';
  }
}
