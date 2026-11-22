/**
 * Migrações de dados salvos: funções puras, sem dependência do Foundry.
 * Cada função recebe os dados "crus" do ator (como estão no banco), ajusta e devolve o mesmo objeto.
 * Todas podem rodar várias vezes sem estragar nada (idempotentes).
 */
import { isLegacyEffect, migrateLegacyEffect } from '../rolls/effects.js';

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
