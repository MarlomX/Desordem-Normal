/**
 * Quadro de teoria da fechadura (lógica pura, sem Foundry). Um rascunho compartilhado pelos
 * participantes de um desafio de destrancar, para pensar na senha:
 *   - cada tentativa enviada entra sozinha como uma linha («tentativa»), com os números travados;
 *   - «Nova linha» cria uma linha de teoria («manual»), com os números editáveis (serve também
 *     para anotar tentativas feitas de boca na mesa);
 *   - em cada dado, as marcas ▲ (cima), ▼ (baixo) e = (igual) ligam e desligam livremente. O
 *     significado é do jogador: é só anotação, nada é conferido com a senha.
 * O quadro fica na fechadura (`fechadura.quadro`), no máximo `MAX_BOARD_ROWS` linhas (ao passar,
 * a linha mais antiga sai).
 */

/** Quantas linhas o quadro guarda. */
export const MAX_BOARD_ROWS = 30;

/** Marcas de cada dado. */
export const BOARD_MARKS = Object.freeze(['cima', 'baixo', 'igual']);

/** Origens das linhas. */
export const BOARD_ORIGINS = Object.freeze(['tentativa', 'manual']);

const emptyMarks = () => ({ cima: false, baixo: false, igual: false });

/** Valor de um dado na linha: inteiro de 1 até as faces, ou `null` (vazio). */
function cellValue(raw, sides) {
  const value = typeof raw === 'number' ? raw : Number.NaN;
  return Number.isInteger(value) && value >= 1 && value <= sides ? value : null;
}

/** Uma linha limpa, do tamanho da fechadura (dados a mais saem; a menos ficam vazios). */
function normalizeRow(row, lados) {
  const id = typeof row?.id === 'string' ? row.id.trim() : '';
  if (!id) return null;
  return {
    id,
    origem: BOARD_ORIGINS.includes(row.origem) ? row.origem : 'manual',
    valores: lados.map((sides, i) => cellValue(row.valores?.[i], sides)),
    marcas: lados.map((_, i) => {
      const marks = row.marcas?.[i] ?? {};
      return {
        cima: marks.cima === true,
        baixo: marks.baixo === true,
        igual: marks.igual === true,
      };
    }),
  };
}

/** O quadro limpo (sem ids repetidos, no máximo `MAX_BOARD_ROWS` linhas, as mais novas). */
export function normalizeBoard(raw, lados) {
  const seen = new Set();
  const rows = [];
  for (const entry of Array.isArray(raw) ? raw : []) {
    const row = normalizeRow(entry, lados);
    if (!row || seen.has(row.id)) continue;
    seen.add(row.id);
    rows.push(row);
  }
  return rows.slice(-MAX_BOARD_ROWS);
}

/** Acrescenta uma linha (a mais antiga sai se o quadro estiver cheio). */
function appendRow(lock, row) {
  return { ...lock, quadro: [...(lock.quadro ?? []), row].slice(-MAX_BOARD_ROWS) };
}

/** Uma tentativa enviada vira linha do quadro (números travados). */
export function addAttemptRow(lock, id, values) {
  return appendRow(lock, {
    id,
    origem: 'tentativa',
    valores: lock.lados.map((sides, i) => cellValue(values?.[i], sides)),
    marcas: lock.lados.map(emptyMarks),
  });
}

/** Nova linha de teoria (números vazios, editáveis). */
export function addManualRow(lock, id) {
  return appendRow(lock, {
    id,
    origem: 'manual',
    valores: lock.lados.map(() => null),
    marcas: lock.lados.map(emptyMarks),
  });
}

/** Troca uma linha pelo id (`change` devolve a linha nova, ou `null` para não mudar nada). */
function changeRow(lock, rowId, change) {
  const rows = lock.quadro ?? [];
  const index = rows.findIndex((row) => row.id === rowId);
  if (index < 0) return null;
  const next = change(rows[index]);
  if (!next) return null;
  const quadro = [...rows];
  quadro[index] = next;
  return { ...lock, quadro };
}

/**
 * Digita o número de um dado numa linha de teoria (texto vazio = apaga). As linhas que vieram de
 * tentativas não mudam. `null` se nada mudou.
 */
export function setBoardValue(lock, rowId, index, raw) {
  return changeRow(lock, rowId, (row) => {
    if (row.origem !== 'manual' || !Number.isInteger(index) || index < 0) return null;
    if (index >= lock.lados.length) return null;
    const text = String(raw ?? '').trim();
    let value = null;
    if (text !== '') {
      if (!/^\d+$/.test(text)) return null;
      value = cellValue(Number(text), lock.lados[index]);
      if (value === null) return null;
    }
    if (row.valores[index] === value) return null;
    const valores = [...row.valores];
    valores[index] = value;
    return { ...row, valores };
  });
}

/** Liga ou desliga uma marca (▲, ▼ ou =) de um dado. `null` se a linha ou a marca não existe. */
export function toggleBoardMark(lock, rowId, index, mark) {
  if (!BOARD_MARKS.includes(mark)) return null;
  return changeRow(lock, rowId, (row) => {
    if (!Number.isInteger(index) || index < 0 || index >= row.marcas.length) return null;
    const marcas = [...row.marcas];
    marcas[index] = { ...marcas[index], [mark]: !marcas[index][mark] };
    return { ...row, marcas };
  });
}

/** Apaga uma linha. `null` se ela não existe. */
export function removeBoardRow(lock, rowId) {
  const rows = lock.quadro ?? [];
  if (!rows.some((row) => row.id === rowId)) return null;
  return { ...lock, quadro: rows.filter((row) => row.id !== rowId) };
}

/** Apaga o quadro inteiro. */
export const clearBoard = (lock) => ({ ...lock, quadro: [] });

/**
 * O que a janela do quadro mostra: as linhas numeradas («Tentativa 2», «Teoria 1») e cada dado com
 * o número, as faces e as marcas.
 */
export function boardView(lock) {
  let attempts = 0;
  let theories = 0;
  return (lock.quadro ?? []).map((row) => {
    const tentativa = row.origem === 'tentativa';
    if (tentativa) attempts += 1;
    else theories += 1;
    return {
      id: row.id,
      tentativa,
      numero: tentativa ? attempts : theories,
      dados: row.valores.map((valor, i) => ({
        index: i,
        valor,
        lados: lock.lados[i],
        editavel: !tentativa,
        ...row.marcas[i],
      })),
    };
  });
}
