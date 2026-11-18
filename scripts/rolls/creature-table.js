/**
 * Tabelas de ações das criaturas (cena de furtividade): lógica pura, sem Foundry.
 *
 * As tabelas são do mestre: o sistema não traz nenhuma linha pronta (o conteúdo das missões não é
 * distribuído). Cada mundo guarda várias tabelas com nome; cada tabela tem um dado (padrão d10) e
 * linhas com uma faixa de resultado (`3` ou `3-4`), um texto livre, o alvo e a procura.
 *
 * Escolher uma linha (clicando nela ou pelo «Sortear») só PREENCHE a janela de procura: o mestre
 * ainda confere e aperta «Procurar».
 */
import { HIDE_DIE_SIDES, cleanHideDice, parseSearchInput, pickSearchTargets } from './stealth.js';

/** Alvos possíveis de uma linha. */
export const ROW_TARGETS = Object.freeze(['todos', 'sorteado', 'nenhum']);

/**
 * Tipos de procura de uma linha:
 * - 'nenhuma': só texto (o mestre resolve à mão; pode sortear um alvo pela janela);
 * - 'fixa': uma fórmula (`2d6`, `d10`, `3 5`);
 * - 'manual': o mestre digita os valores na hora;
 * - 'escalonada': a fórmula depende do maior dado de esconderijo do alvo (d12, d10, d8 ou menor).
 */
export const ROW_SEARCHES = Object.freeze(['nenhuma', 'fixa', 'manual', 'escalonada']);

/** Faixas da procura escalonada, do maior dado para o menor. */
export const SCALED_TIERS = Object.freeze(['d12', 'd10', 'd8']);

/** Dado padrão de uma tabela nova e limites aceitos. */
export const TABLE_DEFAULT_DIE = 10;
export const TABLE_MIN_DIE = 2;
export const TABLE_MAX_DIE = 100;

/** Limites técnicos (evitam números absurdos no editor). */
export const MAX_TABLES = 30;
export const MAX_ROWS = 100;
export const MAX_TEXT = 500;
export const MAX_NAME = 80;

const text = (value, max) => String(value ?? '').slice(0, max);

/** Inteiro de um valor (vazio, texto ou fracionário viram `null`). */
function integer(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

/** Dado de uma tabela entre os limites (o que não vale vira o padrão). */
export function normalizeTableDie(value) {
  const die = integer(value);
  if (die === null || die < TABLE_MIN_DIE || die > TABLE_MAX_DIE) return TABLE_DEFAULT_DIE;
  return die;
}

/**
 * Lê a faixa de resultado digitada: `3`, `3-4` ou `3–4` (com espaços).
 * @returns {{de: number, ate: number}|null} `null` se não vale.
 */
export function parseRange(raw) {
  const match = /^\s*(\d+)\s*(?:[-–]\s*(\d+))?\s*$/.exec(String(raw ?? ''));
  if (!match) return null;
  const de = Number(match[1]);
  const ate = match[2] === undefined ? de : Number(match[2]);
  if (de < 1 || ate < de) return null;
  return { de, ate };
}

/** Texto da faixa para mostrar (`3` ou `3-4`). */
export function rangeLabel({ de, ate }) {
  return de === ate ? String(de) : `${de}-${ate}`;
}

/** Linha limpa (campos conhecidos, tamanhos limitados). Uma faixa inválida fica `null`. */
export function normalizeRow(raw = {}) {
  const range = parseRange(raw.faixa ?? (raw.de !== undefined ? `${raw.de}-${raw.ate}` : ''));
  return {
    id: text(raw.id, 32),
    faixa: range ? rangeLabel(range) : text(raw.faixa, 20),
    de: range?.de ?? null,
    ate: range?.ate ?? null,
    texto: text(raw.texto, MAX_TEXT),
    alvo: ROW_TARGETS.includes(raw.alvo) ? raw.alvo : 'todos',
    procura: ROW_SEARCHES.includes(raw.procura) ? raw.procura : 'nenhuma',
    formula: text(raw.formula, 60),
    escalonada: Object.fromEntries(
      SCALED_TIERS.map((tier) => [tier, text(raw.escalonada?.[tier], 60)]),
    ),
  };
}

/** Tabela limpa. */
export function normalizeTable(raw = {}) {
  return {
    id: text(raw.id, 32),
    nome: text(raw.nome, MAX_NAME),
    dado: normalizeTableDie(raw.dado),
    linhas: (Array.isArray(raw.linhas) ? raw.linhas : []).slice(0, MAX_ROWS).map(normalizeRow),
  };
}

/** Todas as tabelas guardadas, limpas (configuração mal formada vira lista vazia). */
export function normalizeTables(data) {
  const list = Array.isArray(data?.tabelas) ? data.tabelas : [];
  return { tabelas: list.slice(0, MAX_TABLES).map(normalizeTable) };
}

/** Tabela nova, vazia (o sistema não traz linhas prontas). */
export function newTable(id, nome) {
  return normalizeTable({ id, nome, dado: TABLE_DEFAULT_DIE, linhas: [] });
}

/** Linha nova: começa na faixa seguinte à última linha. */
export function newRow(id, table) {
  const last = Math.max(0, ...table.linhas.map((row) => row.ate ?? 0));
  const next = Math.min(last + 1, table.dado);
  return normalizeRow({ id, faixa: String(next), alvo: 'todos', procura: 'nenhuma' });
}

/**
 * Muda um campo de uma linha e devolve a tabela nova (nunca altera a recebida). Campos aceitos:
 * faixa, texto, alvo, procura, formula e escalonada.d12/d10/d8.
 */
export function updateRow(table, rowId, field, value) {
  return normalizeTable({
    ...table,
    linhas: table.linhas.map((row) => {
      if (row.id !== rowId) return row;
      if (field.startsWith('escalonada.')) {
        const tier = field.slice('escalonada.'.length);
        if (!SCALED_TIERS.includes(tier)) return row;
        return { ...row, escalonada: { ...row.escalonada, [tier]: value } };
      }
      if (!['faixa', 'texto', 'alvo', 'procura', 'formula'].includes(field)) return row;
      return { ...row, [field]: value };
    }),
  });
}

/** A linha cuja faixa contém o resultado, ou `null`. */
export function findRow(table, value) {
  const n = integer(value);
  if (n === null) return null;
  return table.linhas.find((row) => row.de !== null && row.de <= n && n <= row.ate) ?? null;
}

/**
 * Avisos do editor (não impedem salvar):
 * - 'faixa': faixa inválida; 'foraDoDado': passa do dado da tabela; 'sobreposta': repete números
 *   de outra linha; 'formula': fórmula vazia ou inválida (procura fixa ou escalonada);
 *   'semResultado': números do dado sem nenhuma linha.
 * @returns {{rowId: string|null, kind: string, detail?: string}[]}
 */
export function tableWarnings(table) {
  const warnings = [];
  const owner = new Map();
  for (const row of table.linhas) {
    if (row.de === null) {
      warnings.push({ rowId: row.id, kind: 'faixa' });
      continue;
    }
    if (row.ate > table.dado) warnings.push({ rowId: row.id, kind: 'foraDoDado' });
    for (let n = row.de; n <= Math.min(row.ate, table.dado); n++) {
      if (owner.has(n) && owner.get(n) !== row.id) {
        warnings.push({ rowId: row.id, kind: 'sobreposta', detail: String(n) });
        break;
      }
      owner.set(n, row.id);
    }
    const formulas =
      row.procura === 'fixa'
        ? [row.formula]
        : row.procura === 'escalonada'
          ? SCALED_TIERS.map((tier) => row.escalonada[tier])
          : [];
    if (formulas.some((formula) => !parseSearchInput(formula).valid)) {
      warnings.push({ rowId: row.id, kind: 'formula' });
    }
  }
  if (table.linhas.length) {
    const missing = [];
    for (let n = 1; n <= table.dado; n++) if (!owner.has(n)) missing.push(n);
    if (missing.length) {
      warnings.push({ rowId: null, kind: 'semResultado', detail: missing.join(', ') });
    }
  }
  return warnings;
}

/** Maior dado de esconderijo de um participante (só os lados, nunca os valores); 0 sem dados. */
export function maxHideSides(dice) {
  const list = cleanHideDice(dice);
  return list.length ? Math.max(...list.map((die) => die.lados)) : 0;
}

/** Faixa da procura escalonada pelo maior dado do alvo: d12 (d12 ou mais), d10, ou d8 (o resto). */
export function scaledTier(maxSides) {
  if (maxSides >= 12) return 'd12';
  if (maxSides >= 10) return 'd10';
  return 'd8';
}

/** Os lados aceitos num dado de esconderijo (reexportados para a janela). */
export { HIDE_DIE_SIDES };

/**
 * O que escolher uma linha coloca na janela de procura.
 * @param {object} row Linha escolhida.
 * @param {{id: string, name: string, maxSides: number}[]} candidates Escondidos agora.
 * @param {() => number} [random]
 * @returns {{text: string, mode: 'todos'|'sorteado'|'escolhido', chosenId: string,
 *   drawn: {id: string, name: string, tier: string}|null}} `drawn`: o alvo sorteado já na escolha
 *   (só na procura escalonada, que precisa saber o maior dado dele).
 */
export function rowToSearchState(row, candidates, random = Math.random) {
  const mode = row.alvo === 'sorteado' ? 'sorteado' : 'todos';
  if (row.procura === 'escalonada') {
    const [target] = pickSearchTargets(candidates, { mode: 'sorteado' }, random);
    if (!target) return { text: '', mode: 'sorteado', chosenId: '', drawn: null };
    const tier = scaledTier(target.maxSides);
    return {
      text: row.escalonada[tier] ?? '',
      mode: 'escolhido',
      chosenId: target.id,
      drawn: { id: target.id, name: target.name, tier },
    };
  }
  return {
    text: row.procura === 'fixa' ? row.formula : '',
    mode,
    chosenId: '',
    drawn: null,
  };
}
