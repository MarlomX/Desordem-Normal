import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SKILL_SORT,
  SKILL_SORT_MODES,
  normalizeSkillSort,
  skillRowOrder,
} from '../scripts/sheets/context.js';

/** Rótulos na ordem em que ficam depois de ordenar (a partir das posições devolvidas). */
const ordenados = (rows, mode) => {
  const order = skillRowOrder(rows, mode);
  return rows
    .map((row, i) => ({ row, pos: order[i] }))
    .sort((a, b) => a.pos - b.pos)
    .map((x) => x.row.label);
};

test('os modos são nome e dado, e o padrão é nome', () => {
  assert.deepEqual([...SKILL_SORT_MODES], ['nome', 'dado']);
  assert.equal(DEFAULT_SKILL_SORT, 'nome');
  assert.equal(normalizeSkillSort('dado'), 'dado');
  for (const ruim of ['', 'x', null, undefined, 3]) assert.equal(normalizeSkillSort(ruim), 'nome');
});

test('modo nome: A a Z em português, sem os acentos bagunçarem a ordem', () => {
  const rows = [
    'Persuasão',
    'Ofício',
    'Intuição',
    'Inspecionar',
    'Atletismo',
    'Enganação',
    'Acrobacia',
    'Ética',
    'Estudo',
  ].map((label) => ({ label }));
  assert.deepEqual(ordenados(rows, 'nome'), [
    'Acrobacia',
    'Atletismo',
    'Enganação',
    'Estudo',
    'Ética',
    'Inspecionar',
    'Intuição',
    'Ofício',
    'Persuasão',
  ]);
});

test('modo nome ignora maiúsculas e minúsculas e o dado', () => {
  const rows = [
    { label: 'zebra', die: 12 },
    { label: 'Abelha', die: 4 },
    { label: 'ave', die: 8 },
  ];
  assert.deepEqual(ordenados(rows, 'nome'), ['Abelha', 'ave', 'zebra']);
  assert.deepEqual(ordenados(rows, 'qualquer coisa'), ['Abelha', 'ave', 'zebra']);
});

test('modo dado: d12 até d4; empate pelo dado do atributo (maior primeiro) e depois pelo nome', () => {
  const rows = [
    { label: 'Luta', die: 8, attrDie: 10 },
    { label: 'Crime', die: 4, attrDie: 8 },
    { label: 'Atletismo', die: 8, attrDie: 10 },
    { label: 'Medicina', die: 8, attrDie: 6 },
    { label: 'Vigor', die: 12, attrDie: 6 },
    { label: 'Ação', die: 8, attrDie: 10 },
  ];
  assert.deepEqual(ordenados(rows, 'dado'), [
    'Vigor', // d12
    'Ação', // d8, atributo d10, nome A→Z (Ação < Atletismo < Luta)
    'Atletismo',
    'Luta',
    'Medicina', // d8, atributo d6
    'Crime', // d4
  ]);
});

test('empates totais mantêm a ordem original (ordenação estável)', () => {
  const rows = [
    { label: 'Igual', die: 6, attrDie: 6 },
    { label: 'Igual', die: 6, attrDie: 6 },
    { label: 'Igual', die: 6, attrDie: 6 },
  ];
  assert.deepEqual(skillRowOrder(rows, 'dado'), [0, 1, 2]);
  assert.deepEqual(skillRowOrder(rows, 'nome'), [0, 1, 2]);
});

test('devolve a posição de cada linha na lista original, sem alterar a lista', () => {
  const rows = [{ label: 'C' }, { label: 'A' }, { label: 'B' }];
  const copia = structuredClone(rows);
  assert.deepEqual(skillRowOrder(rows, 'nome'), [2, 0, 1]);
  assert.deepEqual(rows, copia);
  assert.deepEqual(skillRowOrder([], 'nome'), []);
});

test('dado ausente ou inválido conta como 0 no modo dado', () => {
  const rows = [{ label: 'Sem dado' }, { label: 'Com d4', die: 4, attrDie: Number('x') }];
  assert.deepEqual(ordenados(rows, 'dado'), ['Com d4', 'Sem dado']);
});
