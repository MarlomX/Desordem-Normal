/**
 * Redesenho das fichas abertas (v0.28.2). Perseguição, furtividade e desafios mudam um pedaço da
 * ficha (o cartão de cada um); só esse pedaço é redesenhado.
 */

/**
 * Redesenha as partes `parts` de toda janela aberta que tenha a primeira delas entre as suas
 * partes (`PARTS`): na prática, as fichas de personagem.
 * @param {string[]} parts Partes a redesenhar (ex.: ['furtividade', 'condicao']).
 */
export function refreshOpenSheets(parts) {
  for (const app of foundry.applications.instances.values()) {
    if (app.rendered && app.constructor.PARTS?.[parts[0]]) app.render({ parts });
  }
}
