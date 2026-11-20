/**
 * Migrações de dados salvos: funções puras, sem dependência do Foundry.
 * Cada função recebe os dados "crus" do ator (como estão no banco), ajusta e devolve o mesmo objeto.
 * Todas podem rodar várias vezes sem estragar nada (idempotentes).
 */

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
