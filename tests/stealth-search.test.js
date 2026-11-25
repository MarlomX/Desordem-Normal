// Furtividade: campo e fórmula da procura.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applySearchToDice,
  createSearchFlag,
  parseSearchInput,
  pendingSearchTargets,
  pickSearchTargets,
  resolveSearchTarget,
  searchCandidates,
  searchFormula,
  searchResultKind,
  searchValues,
} from '../scripts/rolls/stealth.js';

test('campo da procura: dados, valores e misturas', () => {
  assert.deepEqual(parseSearchInput('2d6'), {
    valid: true,
    dice: [{ count: 2, sides: 6 }],
    values: [],
  });
  assert.deepEqual(parseSearchInput('d10'), {
    valid: true,
    dice: [{ count: 1, sides: 10 }],
    values: [],
  });
  assert.deepEqual(parseSearchInput('3 5'), { valid: true, dice: [], values: [3, 5] });
  assert.deepEqual(parseSearchInput(' 2D6 + 4, 1d8;7 '), {
    valid: true,
    dice: [
      { count: 2, sides: 6 },
      { count: 1, sides: 8 },
    ],
    values: [4, 7],
  });
});

test('campo da procura: vazio, texto e limites invalidam tudo', () => {
  assert.equal(parseSearchInput('').reason, 'vazio');
  assert.equal(parseSearchInput('   ').reason, 'vazio');
  assert.equal(parseSearchInput('2d6 abc').reason, 'termo');
  assert.equal(parseSearchInput('0').reason, 'termo');
  assert.equal(parseSearchInput('21').reason, 'termo');
  assert.equal(parseSearchInput('2d1').reason, 'termo');
  assert.equal(parseSearchInput('2d100').reason, 'termo');
  assert.equal(parseSearchInput('11d6').reason, 'termo');
  assert.equal(parseSearchInput('0d6').reason, 'termo');
  assert.equal(parseSearchInput('2d6-1').reason, 'termo');
  assert.equal(parseSearchInput('1 2 3 4 5 6 7 8 9 10 11 12 13').reason, 'muitos');
});

test('fórmula para o motor de dados', () => {
  assert.equal(
    searchFormula([
      { count: 2, sides: 6 },
      { count: 1, sides: 10 },
    ]),
    '2d6 + 1d10',
  );
  assert.equal(searchFormula([]), '');
});

test('valores procurados: rolados com lados, digitados sem lados', () => {
  assert.deepEqual(searchValues([{ lados: 6, valor: 3 }], [5]), [
    { lados: 6, valor: 3 },
    { lados: 0, valor: 5 },
  ]);
});

test('procurar descarta TODOS os dados de valor igual, sem somar', () => {
  const dice = [
    { lados: 6, valor: 3 },
    { lados: 8, valor: 3 },
    { lados: 8, valor: 5 },
    { lados: 10, valor: 8 },
  ];
  const result = applySearchToDice(dice, [3, 5]);
  assert.deepEqual(result.list, [{ lados: 10, valor: 8 }]);
  assert.equal(result.lost, 3);
  // 3 + 5 = 8 não conta: os valores não são somados
  assert.equal(applySearchToDice(dice, [8]).lost, 1);
  // Nada igual: nada muda
  assert.deepEqual(applySearchToDice(dice, [1, 2]), { list: dice, lost: 0 });
  // A lista original não muda
  assert.equal(dice.length, 4);
});

test('tipo de resultado de cada alvo', () => {
  assert.equal(searchResultKind(0, 3), 'nada');
  assert.equal(searchResultKind(1, 2), 'perdeu');
  assert.equal(searchResultKind(2, 0), 'encontrado');
});

test('só quem está escondido pode ser alvo', () => {
  const list = [
    { id: 'a', name: 'A', status: 'escondido' },
    { id: 'b', name: 'B', status: 'encontrado' },
    { id: 'c', name: 'C', status: 'aguardando' },
    { id: 'd', name: 'D', status: 'escondido' },
  ];
  assert.deepEqual(
    searchCandidates(list).map((entry) => entry.id),
    ['a', 'd'],
  );
});

test('alvos: todos, um sorteado ou um escolhido', () => {
  const candidates = [
    { id: 'a', name: 'A' },
    { id: 'b', name: 'B' },
    { id: 'c', name: 'C' },
  ];
  assert.equal(pickSearchTargets(candidates, { mode: 'todos' }).length, 3);
  assert.deepEqual(
    pickSearchTargets(candidates, { mode: 'sorteado' }, () => 0),
    [candidates[0]],
  );
  assert.deepEqual(
    pickSearchTargets(candidates, { mode: 'sorteado' }, () => 0.99),
    [candidates[2]],
  );
  // Mesmo um gerador que devolvesse 1 não passa do fim da lista
  assert.deepEqual(
    pickSearchTargets(candidates, { mode: 'sorteado' }, () => 1),
    [candidates[2]],
  );
  assert.deepEqual(pickSearchTargets(candidates, { mode: 'escolhido', chosenId: 'b' }), [
    candidates[1],
  ]);
  assert.deepEqual(pickSearchTargets(candidates, { mode: 'escolhido', chosenId: 'x' }), []);
  assert.deepEqual(pickSearchTargets([], { mode: 'todos' }), []);
  assert.deepEqual(pickSearchTargets(candidates, { mode: 'outro' }), []);
});

test('cartão da procura: cada alvo resolve uma única vez', () => {
  const flag = createSearchFlag({
    values: [{ lados: 6, valor: 3, extra: 'x' }],
    targets: [
      { id: 'a', name: 'Ana' },
      { id: 'b', name: 'Bia' },
    ],
  });
  assert.deepEqual(flag.valores, [{ lados: 6, valor: 3 }]);
  assert.deepEqual(pendingSearchTargets(flag), ['a', 'b']);

  const once = resolveSearchTarget(flag, 'a', { perdeu: 1, restam: 2, resultado: 'perdeu' });
  assert.deepEqual(pendingSearchTargets(once), ['b']);
  assert.equal(once.alvos[0].resultado, 'perdeu');
  // Segunda vez no mesmo alvo: nada muda
  const twice = resolveSearchTarget(once, 'a', { perdeu: 9, restam: 0, resultado: 'encontrado' });
  assert.deepEqual(twice.alvos[0], once.alvos[0]);
  // O registro original não muda
  assert.deepEqual(pendingSearchTargets(flag), ['a', 'b']);
  assert.deepEqual(pendingSearchTargets(undefined), []);
});
