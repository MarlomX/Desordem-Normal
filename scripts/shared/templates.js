/**
 * Desenho de templates Handlebars (v0.28.2). Antes cada arquivo tinha a sua cópia deste atalho.
 */

/**
 * HTML de um template com os dados (o Foundry carrega o arquivo na primeira vez e guarda).
 * @param {string} path Caminho do template (ex.: `systems/desordem-normal/templates/chat/teste.hbs`).
 * @param {object} data Dados do template.
 * @returns {Promise<string>}
 */
export const renderTemplate = (path, data) =>
  foundry.applications.handlebars.renderTemplate(path, data);
