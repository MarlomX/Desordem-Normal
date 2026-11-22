/**
 * Conta nos campos numéricos da ficha: escrever `-2` num campo que tem 10 grava 8, `+3` soma,
 * `=5` ou `5` definem o valor, `7-3` define 4. Lógica pura, sem dependência do Foundry (só lê o
 * DOM que recebe).
 *
 * Regras (v0.23.0; contas com vários termos desde a v0.23.1):
 * - Começando por um número (`5`, `7-3`, `10+2-3`) ou por `=` (`=5`, `=7-3`), a conta define o
 *   valor; só não deixa ficar abaixo do mínimo (sem teto, como antes).
 * - Começando por `+` ou `-` (`+3`, `-2`, `+2-1`), a conta é feita sobre o valor gravado e fica
 *   entre o mínimo e o máximo do campo, como os botões −/+ das barras.
 * - Só inteiros ligados por `+` e `-` (o sinal de menos tipográfico `−` vale como `-`). Qualquer
 *   outro texto (vazio, letras, `*`, `/`, parênteses, decimais) não muda nada: fica o valor gravado.
 *
 * Na marcação, um campo com conta tem `data-relativo`; `data-relativo-min` (padrão 0) e
 * `data-relativo-max` (opcional) dão os limites da conta relativa.
 */

/** Sinais de menos aceitos: o do teclado e o tipográfico (U+2212). */
const MINUS = ['-', '−'];

/**
 * Texto aceito: um início opcional (`=`, `+`, `-` ou `−`) seguido de inteiros ligados por `+`,
 * `-` ou `−`. Espaços entre as partes são aceitos.
 * Grupo 1: o início; grupo 2: a conta (`7-3`, `2`, `10 + 2 - 3`).
 */
const INPUT_PATTERN = /^\s*([=+\-−]?)\s*(\d+(?:\s*[+\-−]\s*\d+)*)\s*$/;

/** Cada termo da conta com o seu sinal (`-3`, `+2`); o primeiro pode vir sem sinal. */
const TERM_PATTERN = /([+\-−]?)\s*(\d+)/g;

/**
 * Resultado de uma conta já conferida por `INPUT_PATTERN` (só inteiros, `+` e `-`).
 * @param {string} expression Ex.: `7-3`, `-2+5`, `10 + 2 - 3`.
 * @returns {number}
 */
export function sumTerms(expression) {
  let total = 0;
  for (const [, sign, digits] of String(expression).matchAll(TERM_PATTERN)) {
    total += MINUS.includes(sign) ? -Number(digits) : Number(digits);
  }
  return total;
}

/**
 * Lê o texto de um campo.
 * @param {*} raw Texto digitado (ou um número, se já vier convertido).
 * @returns {{mode: 'set'|'add', amount: number}|null} `set` define o valor como `amount` (o
 *   resultado da conta); `add` soma `amount` ao valor gravado (negativo para subtrair). `null`
 *   quando o texto não é um formato aceito.
 */
export function parseNumberInput(raw) {
  // Um número que já chegou convertido (por exemplo, de um campo `type="number"`) é absoluto
  if (typeof raw === 'number') {
    return Number.isInteger(raw) ? { mode: 'set', amount: raw } : null;
  }
  const match = INPUT_PATTERN.exec(String(raw ?? ''));
  if (!match) return null;
  const [, start, expression] = match;
  // `7-3` e `=7-3` definem; `+2-1` e `-3` somam ao gravado (o sinal do início vale para o 1º termo)
  if (start === '' || start === '=') return { mode: 'set', amount: sumTerms(expression) };
  return { mode: 'add', amount: sumTerms(`${start}${expression}`) };
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
  // Uma conta que se anula (`+1-1`) não mexe no valor
  if (parsed.amount === 0) return base;
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
