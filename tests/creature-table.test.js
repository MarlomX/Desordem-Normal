import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_ROWS,
  TABLE_DEFAULT_DIE,
  findRow,
  maxHideSides,
  newRow,
  newTable,
  normalizeRow,
  normalizeTable,
  normalizeTableDie,
  normalizeTables,
  parseRange,
  rangeLabel,
  rowToSearchState,
  scaledTier,
  tableWarnings,
  updateRow,
} from '../scripts/rolls/creature-table.js';

const row = (id, faixa, extra = {}) => normalizeRow({ id, faixa, ...extra });
const table = (linhas, dado = 10) => normalizeTable({ id: 't', nome: 'T', dado, linhas });

test('faixa de resultado: número, intervalo e inválidos', () => {
  assert.deepEqual(parseRange('3'), { de: 3, ate: 3 });
  assert.deepEqual(parseRange(' 3 - 4 '), { de: 3, ate: 4 });
  assert.deepEqual(parseRange('3–4'), { de: 3, ate: 4 });
  assert.equal(parseRange(''), null);
  assert.equal(parseRange('0'), null);
  assert.equal(parseRange('4-3'), null);
  assert.equal(parseRange('3,4'), null);
  assert.equal(parseRange('abc'), null);
  assert.equal(rangeLabel({ de: 2, ate: 2 }), '2');
  assert.equal(rangeLabel({ de: 2, ate: 5 }), '2-5');
});

test('dado da tabela: padrão d10 e limites', () => {
  assert.equal(normalizeTableDie(6), 6);
  assert.equal(normalizeTableDie('20'), 20);
  assert.equal(normalizeTableDie(''), TABLE_DEFAULT_DIE);
  assert.equal(normalizeTableDie(1), TABLE_DEFAULT_DIE);
  assert.equal(normalizeTableDie(101), TABLE_DEFAULT_DIE);
  assert.equal(normalizeTableDie(2.5), TABLE_DEFAULT_DIE);
});

test('linha limpa: valores desconhecidos viram os padrões', () => {
  const clean = normalizeRow({ id: 'a', faixa: '1-2', alvo: 'x', procura: 'y', texto: 'oi' });
  assert.equal(clean.alvo, 'todos');
  assert.equal(clean.procura, 'nenhuma');
  assert.equal(clean.de, 1);
  assert.equal(clean.ate, 2);
  assert.deepEqual(clean.escalonada, { d12: '', d10: '', d8: '' });
  // Faixa inválida é mantida como texto, para o mestre corrigir
  const bad = normalizeRow({ id: 'b', faixa: '9-1' });
  assert.equal(bad.de, null);
  assert.equal(bad.faixa, '9-1');
});

test('configuração mal formada vira lista vazia; limite de linhas', () => {
  assert.deepEqual(normalizeTables(null), { tabelas: [] });
  assert.deepEqual(normalizeTables({ tabelas: 'x' }), { tabelas: [] });
  const many = Array.from({ length: MAX_ROWS + 5 }, (_, i) => ({ id: String(i), faixa: '1' }));
  assert.equal(normalizeTable({ linhas: many }).linhas.length, MAX_ROWS);
});

test('tabela nova vem vazia e linha nova continua da última', () => {
  const empty = newTable('t1', 'Bosque');
  assert.equal(empty.dado, 10);
  assert.deepEqual(empty.linhas, []);
  assert.equal(newRow('r1', empty).faixa, '1');
  const filled = table([row('a', '1-3')]);
  assert.equal(newRow('r2', filled).faixa, '4');
  // Não passa do dado
  assert.equal(newRow('r3', table([row('a', '1-10')])).faixa, '10');
});

test('editar um campo da linha não altera a tabela original', () => {
  const original = table([row('a', '1')]);
  const edited = updateRow(original, 'a', 'faixa', '1-3');
  assert.equal(edited.linhas[0].ate, 3);
  assert.equal(original.linhas[0].ate, 1);
  assert.equal(updateRow(original, 'a', 'escalonada.d10', 'd10').linhas[0].escalonada.d10, 'd10');
  // Campo desconhecido não muda nada
  assert.deepEqual(updateRow(original, 'a', 'id', 'zzz'), original);
  assert.deepEqual(updateRow(original, 'a', 'escalonada.d20', 'x'), original);
});

test('encontrar a linha pelo resultado do dado', () => {
  const t = table([row('a', '1'), row('b', '2-4'), row('c', '10')]);
  assert.equal(findRow(t, 1).id, 'a');
  assert.equal(findRow(t, 3).id, 'b');
  assert.equal(findRow(t, '10').id, 'c');
  assert.equal(findRow(t, 5), null);
  assert.equal(findRow(t, ''), null);
});

test('avisos do editor', () => {
  const t = table([
    row('a', '1-3', { procura: 'fixa', formula: '2d6' }),
    row('b', '3', { procura: 'fixa', formula: 'abc' }),
    row('c', 'x'),
    row('d', '9-12', { procura: 'escalonada', escalonada: { d12: 'd12', d10: '2d8', d8: '' } }),
  ]);
  const kinds = tableWarnings(t).map((warning) => `${warning.rowId}:${warning.kind}`);
  assert.ok(kinds.includes('b:sobreposta'));
  assert.ok(kinds.includes('b:formula'));
  assert.ok(kinds.includes('c:faixa'));
  assert.ok(kinds.includes('d:foraDoDado'));
  assert.ok(kinds.includes('d:formula'));
  const missing = tableWarnings(t).find((warning) => warning.kind === 'semResultado');
  assert.equal(missing.detail, '4, 5, 6, 7, 8');
  // Tabela vazia ou completa: sem aviso de resultados faltando
  assert.deepEqual(tableWarnings(table([])), []);
  assert.deepEqual(tableWarnings(table([row('a', '1-10')])), []);
});

test('maior dado de esconderijo e faixa da procura escalonada', () => {
  assert.equal(
    maxHideSides([
      { lados: 6, valor: 2 },
      { lados: 10, valor: 1 },
    ]),
    10,
  );
  assert.equal(maxHideSides([]), 0);
  assert.equal(scaledTier(20), 'd12');
  assert.equal(scaledTier(12), 'd12');
  assert.equal(scaledTier(10), 'd10');
  assert.equal(scaledTier(8), 'd8');
  assert.equal(scaledTier(4), 'd8');
});

test('escolher uma linha só preenche a janela de procura', () => {
  const candidates = [
    { id: 'a', name: 'Ana', maxSides: 8 },
    { id: 'b', name: 'Bia', maxSides: 12 },
  ];
  const fixed = rowToSearchState(
    row('r', '4', { procura: 'fixa', formula: '2d6', alvo: 'todos' }),
    candidates,
  );
  assert.deepEqual(fixed, { text: '2d6', mode: 'todos', chosenId: '', drawn: null });

  const manual = rowToSearchState(row('r', '1', { procura: 'manual', alvo: 'todos' }), candidates);
  assert.equal(manual.text, '');

  const single = rowToSearchState(
    row('r', '9', { procura: 'fixa', formula: 'd10', alvo: 'sorteado' }),
    candidates,
  );
  assert.equal(single.mode, 'sorteado');

  const scaled = row('r', '8', {
    procura: 'escalonada',
    escalonada: { d12: 'd12', d10: '2d10', d8: '3d8' },
  });
  // O sorteio escolhe a Bia (maior dado d12): vai a fórmula do d12, com ela como alvo
  assert.deepEqual(
    rowToSearchState(scaled, candidates, () => 0.9),
    {
      text: 'd12',
      mode: 'escolhido',
      chosenId: 'b',
      drawn: { id: 'b', name: 'Bia', tier: 'd12' },
    },
  );
  assert.equal(rowToSearchState(scaled, candidates, () => 0).text, '3d8');
  assert.equal(rowToSearchState(scaled, [], () => 0).drawn, null);
});
