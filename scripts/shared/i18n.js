/**
 * Textos traduzidos (v0.28.2). Antes cada arquivo tinha a sua cópia deste atalho.
 */

/**
 * Texto da chave no idioma do jogador. Com `data`, troca os marcadores `{nome}` pelos valores
 * (`game.i18n.format`); sem, só traduz (`game.i18n.localize`).
 * @param {string} key Chave do idioma (ex.: 'DESORDEM.Ficha.Personagem').
 * @param {Object<string, *>} [data] Valores dos marcadores.
 * @returns {string}
 */
export const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
