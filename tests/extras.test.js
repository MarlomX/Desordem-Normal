import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_EXTRAS,
  MAX_EXTRA_NAME,
  addExtra,
  canAddExtra,
  extraKey,
  findExtra,
  parseExtraKey,
  removeExtra,
  updateExtra,
} from '../scripts/rolls/extras.js';
import { buildExtraRows } from '../scripts/sheets/context.js';

const lista = () => [
  { id: 'a1', nome: 'Couraçaria', dado: 8 },
  { id: 'b2', nome: '', dado: 4 },
];

test('extraKey e parseExtraKey são inversas e rejeitam chaves que não são de áreas extras', () => {
  assert.equal(extraKey('oficio', 'k3'), 'oficio:k3');
  assert.deepEqual(parseExtraKey('aptidao:k3'), { group: 'aptidao', id: 'k3' });
  for (const ruim of ['folclore', 'luta', 'oficio:', ':x', 'pericia:x', '', null, undefined, 7]) {
    assert.equal(parseExtraKey(ruim), null, String(ruim));
  }
  assert.equal(parseExtraKey('toString:x'), null);
});

test('findExtra acha a área no grupo certo e devolve null se não existir', () => {
  const system = {
    aptidoesExtras: [{ id: 'x', nome: 'Heráldica', dado: 6 }],
    oficiosExtras: lista(),
  };
  assert.deepEqual(findExtra(system, 'aptidao:x'), {
    group: 'aptidao',
    extra: { id: 'x', nome: 'Heráldica', dado: 6 },
  });
  assert.equal(findExtra(system, 'oficio:x'), null);
  assert.equal(findExtra(system, 'oficio:a1').extra.dado, 8);
  assert.equal(findExtra({}, 'oficio:a1'), null);
  assert.equal(findExtra(system, 'luta'), null);
});

test('addExtra acrescenta ao fim em d4, limpa o nome e não altera a lista original', () => {
  const original = lista();
  const nova = addExtra(original, { id: 'c3', nome: '  Cervejaria  ' });
  assert.equal(original.length, 2);
  assert.deepEqual(nova[2], { id: 'c3', nome: 'Cervejaria', dado: 4, atributo: '' });
  assert.deepEqual(addExtra([], { id: 'z' }), [{ id: 'z', nome: '', dado: 4, atributo: '' }]);
  assert.notEqual(nova[0], original[0]);
});

test('addExtra recusa id vazio, id repetido e lista cheia', () => {
  assert.throws(() => addExtra(lista(), { id: '' }), RangeError);
  assert.throws(() => addExtra(lista(), { id: 'a1' }), RangeError);
  const cheia = Array.from({ length: MAX_EXTRAS }, (_, i) => ({ id: `i${i}`, nome: '', dado: 4 }));
  assert.equal(canAddExtra(cheia), false);
  assert.equal(canAddExtra(cheia.slice(1)), true);
  assert.throws(() => addExtra(cheia, { id: 'novo' }), RangeError);
});

test('removeExtra tira só a área do id e ignora id inexistente', () => {
  assert.deepEqual(
    removeExtra(lista(), 'a1').map((e) => e.id),
    ['b2'],
  );
  assert.equal(removeExtra(lista(), 'nada').length, 2);
});

test('updateExtra muda nome e dado, limita o nome e ignora dados e campos inválidos', () => {
  const original = lista();
  const [a, b] = updateExtra(original, 'a1', { nome: ' Vidraria ', dado: '10' });
  assert.deepEqual(a, { id: 'a1', nome: 'Vidraria', dado: 10 });
  assert.deepEqual(b, original[1]);
  assert.equal(original[0].nome, 'Couraçaria');

  assert.equal(updateExtra(original, 'a1', { dado: 7 })[0].dado, 8);
  assert.equal(updateExtra(original, 'a1', { dado: 'x' })[0].dado, 8);
  assert.equal(updateExtra(original, 'a1', { id: 'outro', peso: 3 })[0].id, 'a1');
  assert.equal(
    updateExtra(original, 'a1', { nome: 'x'.repeat(100) })[0].nome.length,
    MAX_EXTRA_NAME,
  );
  assert.equal(updateExtra(original, 'a1', { nome: null })[0].nome, '');
});

test('buildExtraRows monta linhas com chave de teste, nome digitado e texto padrão', () => {
  const linhas = buildExtraRows(lista(), 'oficio', { emptyLabel: 'Ofício sem nome' });
  assert.deepEqual(
    linhas.map((l) => [l.key, l.id, l.index, l.label, l.nome, l.group]),
    [
      ['oficio:a1', 'a1', 0, 'Couraçaria', 'Couraçaria', 'oficio'],
      ['oficio:b2', 'b2', 1, 'Ofício sem nome', '', 'oficio'],
    ],
  );
  assert.equal(linhas[0].die, 8);
  assert.equal(linhas[0].trained, true);
  assert.equal(linhas[1].trained, false);
  assert.equal(linhas[0].options.find((o) => o.selected).value, 8);
  assert.equal(linhas[0].search, 'coura\u00e7aria'.normalize('NFD').replace(/\p{M}/gu, ''));
  assert.deepEqual(buildExtraRows([], 'aptidao', { emptyLabel: 'x' }), []);
});

test('updateExtra aceita atributo válido ou vazio e ignora o resto', () => {
  const original = lista();
  assert.equal(updateExtra(original, 'a1', { atributo: 'fisico' })[0].atributo, 'fisico');
  const com = updateExtra(original, 'a1', { atributo: 'emocao' });
  assert.equal(updateExtra(com, 'a1', { atributo: '' })[0].atributo, '');
  assert.equal(updateExtra(com, 'a1', { atributo: 'forca' })[0].atributo, 'emocao');
  assert.equal(updateExtra(com, 'a1', { atributo: null })[0].atributo, 'emocao');
});
