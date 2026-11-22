/**
 * Aba Notas (v0.23.2): campos de texto longo com o editor rico do Foundry (ProseMirror), no
 * personagem (descrição, história, anotações) e na criatura (estratégia, descrição).
 * Lógica pura, sem dependência do Foundry: quem monta a ficha passa as funções de tradução e de
 * enriquecimento (`TextEditor.enrichHTML`).
 */

/**
 * Campos de notas do personagem, na ordem da aba. `label` e `hint` são chaves de idioma; `icon`,
 * a classe do Font Awesome do título.
 */
export const CHARACTER_NOTES = Object.freeze([
  {
    key: 'descricao',
    icon: 'fa-user-pen',
    label: 'DESORDEM.Notas.Descricao',
    hint: 'DESORDEM.Notas.DescricaoDica',
  },
  {
    key: 'historia',
    icon: 'fa-book-open',
    label: 'DESORDEM.Notas.Historia',
    hint: 'DESORDEM.Notas.HistoriaDica',
  },
  {
    key: 'anotacoes',
    icon: 'fa-note-sticky',
    label: 'DESORDEM.Notas.Anotacoes',
    hint: 'DESORDEM.Notas.AnotacoesDica',
  },
]);

/** Campos de notas da criatura (os mesmos de antes da v0.23.2, agora com o editor rico). */
export const CREATURE_NOTES = Object.freeze([
  {
    key: 'estrategia',
    icon: 'fa-chess',
    label: 'DESORDEM.Criatura.Estrategia',
    hint: 'DESORDEM.Criatura.DicaEstrategia',
  },
  { key: 'descricao', icon: 'fa-eye', label: 'DESORDEM.Criatura.Descricao' },
]);

/**
 * Linhas da aba Notas, prontas para o template.
 * @param {{key: string, icon: string, label: string, hint?: string}[]} defs `CHARACTER_NOTES` ou
 *   `CREATURE_NOTES`.
 * @param {object} system Dados do ator (`actor.system`).
 * @param {object} opts
 * @param {(key: string) => string} opts.t Traduz uma chave de idioma.
 * @param {(html: string) => Promise<string>|string} opts.enrich Enriquece o HTML para leitura
 *   (links `@UUID`, rolagens); no Foundry, `TextEditor.enrichHTML`.
 * @param {Record<string, object>} [opts.fields] Campos do modelo (`system.schema.fields`), para o
 *   helper `formInput` montar o editor.
 * @returns {Promise<{key: string, icon: string, label: string, hint: string, value: string,
 *   enriched: string, empty: boolean, field?: object}[]>} `value`: o HTML gravado (o editor edita
 *   este); `enriched`: o HTML de leitura; `empty`: o campo não tem texto.
 */
export async function buildNoteRows(defs, system, { t, enrich, fields = {} }) {
  return Promise.all(
    defs.map(async ({ key, icon, label, hint }) => {
      const value = typeof system?.[key] === 'string' ? system[key] : '';
      return {
        key,
        icon,
        label: t(label),
        hint: hint ? t(hint) : '',
        value,
        enriched: value ? await enrich(value) : '',
        empty: isBlankHtml(value),
        field: fields[key],
      };
    }),
  );
}

/** O HTML não tem texto visível (vazio, só espaços ou só marcação como `<p></p>`)? */
export function isBlankHtml(html) {
  const text = String(html ?? '')
    .replace(/<(img|hr|iframe|video|audio)\b/gi, 'x')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ');
  return text.trim() === '';
}

/** O texto já é HTML? (Começa por uma marcação; texto simples antigo não começa.) */
export function looksLikeHtml(text) {
  return /^\s*</.test(String(text ?? ''));
}

/** Troca os caracteres especiais do HTML por entidades. */
export function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Texto simples (de um `textarea`, como as notas da criatura até a v0.23.1) em HTML, para o
 * editor rico: linhas em branco separam parágrafos, e cada quebra de linha vira `<br>`.
 * @param {string} text
 * @returns {string} Vazio para texto vazio.
 */
export function plainTextToHtml(text) {
  const normalized = String(text ?? '').replace(/\r\n?/g, '\n');
  return normalized
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}
