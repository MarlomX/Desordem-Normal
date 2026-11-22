/**
 * Conta nos campos numéricos da ficha: escrever `-2` num campo que tem 10 grava 8, `+3` soma,
 * `=5` ou `5` definem o valor. Lógica pura, sem dependência do Foundry (só lê o DOM que recebe).
 *
 * Regras (v0.23.0):
 * - `N` e `=N` definem o valor; só não deixam ficar abaixo do mínimo (sem teto, como antes).
 * - `+N` e `-N` fazem a conta sobre o valor gravado e ficam entre o mínimo e o máximo do campo,
 *   como os botões −/+ das barras.
 * - Qualquer outro texto (vazio, letras, `10-2`, decimais) não muda nada: fica o valor gravado.
 *
 * Na marcação, um campo com conta tem `data-relativo`; `data-relativo-min` (padrão 0) e
 * `data-relativo-max` (opcional) dão os limites da conta relativa.
 */

/**
 * Um sinal opcional (`=`, `+`, `-` ou o sinal de menos tipográfico `−`) seguido de um inteiro.
 * Espaços antes, depois e entre o sinal e o número são aceitos.
 */
const INPUT_PATTERN = /^\s*([=+\-−]?)\s*(\d+)\s*$/;

/**
 * Lê o texto de um campo.
 * @param {*} raw Texto digitado (ou um número, se já vier convertido).
 * @returns {{mode: 'set'|'add', amount: number}|null} `set` define o valor; `add` soma `amount`
 *   (negativo para subtrair). `null` quando o texto não é um formato aceito.
 */
export function parseNumberInput(raw) {
  // Um número que já chegou convertido (por exemplo, de um campo `type="number"`) é absoluto
  if (typeof raw === 'number') {
    return Number.isInteger(raw) ? { mode: 'set', amount: raw } : null;
  }
  const match = INPUT_PATTERN.exec(String(raw ?? ''));
  if (!match) return null;
  const [, sign, digits] = match;
  const amount = Number(digits);
  if (sign === '+') return { mode: 'add', amount };
  if (sign === '-' || sign === '−') return { mode: 'add', amount: -amount };
  return { mode: 'set', amount };
}

/**
 * Novo valor de um campo depois de escrever `raw` nele.
 * @param {*} raw Texto digitado.
 * @param {number} current Valor gravado antes da edição.
 * @param {{min?: number, max?: number}} [limits] `min` (padrão 0) vale sempre; `max` só limita a
 *   conta relativa (`+N`/`-N`). Sem `max`, a conta não tem teto.
 * @returns {number}
 */
export function applyRelativeInput(raw, current, { min = 0, max } = {}) {
  const base = Number(current) || 0;
  const parsed = parseNumberInput(raw);
  if (!parsed) return base;
  if (parsed.mode === 'set') return Math.max(min, parsed.amount);
  const top = Number.isFinite(max) ? max : Infinity;
  const next = base + parsed.amount;
  // Somar para no máximo; se o valor já estava acima dele (definido à mão), somar não o mexe
  if (parsed.amount > 0) return Math.max(base, Math.min(next, top));
  // Subtrair para no mínimo (e funciona normalmente mesmo acima do máximo)
  return Math.max(min, next);
}

/**
 * Limites de um campo a partir dos atributos `data-relativo-min` e `data-relativo-max`.
 * Valores vazios ou inválidos são ignorados (mínimo 0, sem máximo).
 * @param {{relativoMin?: string, relativoMax?: string}} dataset `element.dataset` do campo.
 * @returns {{min: number, max?: number}}
 */
export function limitsFromDataset(dataset = {}) {
  const toNumber = (text) => (text === undefined || text === '' ? NaN : Number(text));
  const min = toNumber(dataset.relativoMin);
  const max = toNumber(dataset.relativoMax);
  return {
    min: Number.isFinite(min) ? min : 0,
    ...(Number.isFinite(max) ? { max } : {}),
  };
}

/** Lê um caminho com pontos (`system.pv.value`) num objeto; `undefined` se faltar algo. */
export function readPath(object, path) {
  return String(path)
    .split('.')
    .reduce((value, key) => (value == null ? undefined : value[key]), object);
}

/**
 * Troca, nos dados do formulário, o texto de cada campo com conta pelo valor final, e escreve esse
 * valor de volta no campo (para o texto `+3` não ficar na tela se nada mudar e a ficha não
 * redesenhar). Chamada em `_processFormData` das fichas, antes do envio.
 * @param {HTMLFormElement|HTMLElement} form Formulário da ficha.
 * @param {Record<string, *>} values `formData.object`, com as chaves planas (`system.pv.value`).
 *   É alterado no lugar.
 * @param {object} source Dados gravados do documento (`document._source`), para o valor atual.
 */
export function resolveRelativeFields(form, values, source) {
  for (const input of form.querySelectorAll('[data-relativo][name]')) {
    const { name } = input;
    // Campos desabilitados não entram no formulário: não há o que trocar
    if (!(name in values)) continue;
    const value = applyRelativeInput(
      values[name],
      readPath(source, name),
      limitsFromDataset(input.dataset),
    );
    values[name] = value;
    input.value = String(value);
  }
  return values;
}
