// Pontos de interesse: subtipo, número no nome, perícias e blocos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  POINT_TYPE,
  DEFAULT_DT,
  MAX_BLOCKS,
  stripNumberPrefix,
  pointPageName,
  headingLevel,
  skillOptionGroups,
  skillKeyLabel,
  blockLabel,
  newBlock,
  newLine,
  normalizeBlocks,
  addBlock,
  removeBlock,
  moveBlock,
  addLine,
  removeLine,
  moveLine,
  removeSkill,
  applyBlockForm,
  isLineVisibleTo,
  buildEditBlocks,
  buildGmBoard,
  buildPlayerBoard,
  setLineRevealed,
  setLineUsers,
  setBlockRevealed,
  hideAll,
  hasRevealed,
  visibleLineIds,
  newLineIds,
  sameIds,
  groupChoices,
  findGroupKey,
  textSnippet,
  investigationRows,
  applyReveal,
  examineFindsNothing,
  compareNumbers,
  sortUpdates,
  nextChildNumber,
  childNumberFor,
  descendantIds,
  parentChoices,
  noteIconFor,
  noteUpdates,
  linkTypeOf,
  newLink,
  normalizeLinks,
  addLink,
  removeLink,
  setLinkRevealed,
  setLinkUsers,
  hideAllLinks,
  takeOne,
  applyLinkForm,
  isLinkVisibleTo,
  linkAudience,
  lineChoices,
  buildLinks,
  grantOwnership,
  visibleLinkIds,
} from '../scripts/journal/point.js';

// Tradução com o arquivo de idioma de verdade (como o game.i18n: chave sem texto volta a chave)
const pt = JSON.parse(readFileSync(new URL('../lang/pt-BR.json', import.meta.url), 'utf8'));
const lookup = (key) => {
  if (key in pt) return pt[key];
  const value = key.split('.').reduce((node, part) => node?.[part], pt);
  return typeof value === 'string' ? value : key;
};
const t = (key, data) =>
  data ? lookup(key).replace(/\{(\w+)\}/g, (_, name) => data[name] ?? '') : lookup(key);
const enrich = (text) => `<E>${text}</E>`;

/** Quadro de exemplo: o mesmo do prompt (Intuição 7 e 10, Percepção 10, Ocultismo oculto). */
function sampleBlocks() {
  return normalizeBlocks([
    {
      id: 'a',
      pericias: ['intuicao'],
      linhas: [
        { id: 'a1', dt: 7, texto: 'texto A', notaMestre: 'só mestre' },
        { id: 'a2', dt: 10, texto: 'texto B', condicao: 'depois de A' },
      ],
    },
    { id: 'b', pericias: ['percepcao'], linhas: [{ id: 'b1', dt: 10, texto: 'texto C' }] },
    { id: 'c', rotulo: 'Ocultismo', oculta: true, linhas: [{ id: 'c1', dt: 10, texto: 'D' }] },
  ]);
}

test('POINT_TYPE é o subtipo declarado no system.json', () => {
  const manifest = JSON.parse(readFileSync(new URL('../system.json', import.meta.url), 'utf8'));
  assert.equal(POINT_TYPE, 'pontoInteresse');
  assert.ok(manifest.documentTypes.JournalEntryPage[POINT_TYPE]);
});

test('pointPageName: põe o número na frente e nunca o repete', () => {
  assert.equal(pointPageName('Potes', '', '4.1'), '4.1 · Potes');
  assert.equal(pointPageName('4.1 · Potes', '4.1', '4.2'), '4.2 · Potes');
  // Página duplicada: o nome já vem com o número
  assert.equal(pointPageName('4.1 · Potes', '', '4.1'), '4.1 · Potes');
  // Número apagado: volta só o nome
  assert.equal(pointPageName('4.1 · Potes', '4.1', ''), 'Potes');
  // Nome que só tinha o número: mantém o que havia (o Foundry exige nome)
  assert.equal(pointPageName('', '', '3'), '');
  // Outro texto com «·» no meio não é cortado
  assert.equal(pointPageName('Sala · Norte', '', '2'), '2 · Sala · Norte');
});

test('stripNumberPrefix: só tira o prefixo do número informado', () => {
  assert.equal(stripNumberPrefix('4.1 · Potes', '4.1'), 'Potes');
  assert.equal(stripNumberPrefix('4.1 · Potes', '4'), '4.1 · Potes');
  assert.equal(stripNumberPrefix('Potes', ''), 'Potes');
});

test('headingLevel: subpontos descem no índice, até o nível 3', () => {
  assert.equal(headingLevel(''), 1);
  assert.equal(headingLevel('4'), 1);
  assert.equal(headingLevel('4.1'), 2);
  assert.equal(headingLevel('4.1.2'), 3);
  assert.equal(headingLevel('4.1.2.5'), 3);
});

test('skillKeyLabel: perícias, Aptidão e Ofício com área, chave desconhecida', () => {
  assert.equal(skillKeyLabel('percepcao', t), 'Percepção');
  assert.equal(skillKeyLabel('aptidao:guerra', t), 'Aptidão (Guerra)');
  assert.equal(skillKeyLabel('oficio', t), 'Ofício');
  assert.equal(skillKeyLabel('oficio:joalheria', t), 'Ofício (joalheria)');
  assert.equal(skillKeyLabel('xyz', t), 'xyz');
});

test('skillOptionGroups: três grupos, perícias em ordem alfabética', () => {
  const groups = skillOptionGroups(
    { skills: ['vigor', 'acrobacia'], aptitudes: ['guerra'], crafts: ['alquimia'] },
    t,
  );
  assert.deepEqual(
    groups.map((group) => group.options.map((option) => option.key)),
    [
      ['acrobacia', 'vigor'],
      ['aptidao', 'aptidao:guerra'],
      ['oficio', 'oficio:alquimia'],
    ],
  );
});

test('blockLabel: rótulo livre, «ou» entre perícias, sem perícia', () => {
  assert.equal(blockLabel({ pericias: ['percepcao'], rotulo: 'Olhar' }, t), 'Olhar');
  assert.equal(
    blockLabel({ pericias: ['aptidao:guerra', 'oficio'] }, t),
    'Aptidão (Guerra) ou Ofício',
  );
  assert.equal(blockLabel({ pericias: ['crime', 'luta', 'vigor'] }, t), 'Crime, Luta ou Vigor');
  assert.equal(blockLabel({ pericias: [] }, t), t('DESORDEM.Ponto.SemPericia'));
});

test('normalizeBlocks: ids, DT padrão e limites, perícias sem repetição', () => {
  const [block] = normalizeBlocks([
    { pericias: ['luta', 'luta', ''], linhas: [{ dt: 'x' }, { dt: 150 }, { dt: -3 }] },
  ]);
  assert.equal(block.id, 'b0');
  assert.deepEqual(block.pericias, ['luta']);
  assert.deepEqual(
    block.linhas.map((line) => [line.id, line.dt]),
    [
      ['b0l0', DEFAULT_DT],
      ['b0l1', 99],
      ['b0l2', 0],
    ],
  );
  assert.deepEqual(normalizeBlocks(null), []);
});

test('blocos: acrescentar, mover, remover (com limite)', () => {
  let blocks = sampleBlocks();
  blocks = addBlock(blocks, newBlock('d', 'd1'));
  assert.equal(blocks.at(-1).linhas[0].id, 'd1');
  blocks = moveBlock(blocks, 'd', -1);
  assert.deepEqual(
    blocks.map((block) => block.id),
    ['a', 'b', 'd', 'c'],
  );
  assert.equal(moveBlock(blocks, 'a', -1), blocks, 'o primeiro não sobe');
  blocks = removeBlock(blocks, 'd');
  assert.deepEqual(
    blocks.map((block) => block.id),
    ['a', 'b', 'c'],
  );
  const full = Array.from({ length: MAX_BLOCKS }, (_, i) => newBlock(`x${i}`, `x${i}l`));
  assert.equal(addBlock(full, newBlock('y', 'yl')).length, MAX_BLOCKS);
});

test('linhas: acrescentar, mover, remover; perícia removida', () => {
  let blocks = sampleBlocks();
  blocks = addLine(blocks, 'a', newLine('a3'));
  blocks = moveLine(blocks, 'a', 'a3', -1);
  assert.deepEqual(
    blocks[0].linhas.map((line) => line.id),
    ['a1', 'a3', 'a2'],
  );
  blocks = removeLine(blocks, 'a', 'a1');
  assert.deepEqual(
    blocks[0].linhas.map((line) => line.id),
    ['a3', 'a2'],
  );
  blocks = removeSkill(blocks, 'a', 'intuicao');
  assert.deepEqual(blocks[0].pericias, []);
});

test('applyBlockForm: grava pelos ids e não mexe na revelação', () => {
  const blocks = sampleBlocks();
  blocks[0].linhas[0].revelada = true;
  const result = applyBlockForm(blocks, {
    a: {
      rotulo: '  Sentir ',
      oculta: true,
      adicionar: 'percepcao',
      linhas: { a1: { dt: '8', texto: '<p>novo</p>', revelada: false }, zz: { dt: 3 } },
    },
    b: { adicionar: 'percepcao' },
    fantasma: { rotulo: 'não existe' },
  });
  assert.equal(result[0].rotulo, 'Sentir');
  assert.equal(result[0].oculta, true);
  assert.deepEqual(result[0].pericias, ['intuicao', 'percepcao']);
  assert.equal(result[0].linhas[0].dt, 8);
  assert.equal(result[0].linhas[0].texto, '<p>novo</p>');
  assert.equal(result[0].linhas[0].revelada, true);
  assert.deepEqual(result[1].pericias, ['percepcao'], 'perícia repetida não entra');
  assert.equal(result.length, 3);
  assert.equal(applyBlockForm(blocks, undefined), blocks);
});

test('isLineVisibleTo: revelada para todos ou para o usuário', () => {
  assert.equal(isLineVisibleTo({ revelada: true, reveladaPara: [] }, 'u1'), true);
  assert.equal(isLineVisibleTo({ revelada: false, reveladaPara: ['u1'] }, 'u1'), true);
  assert.equal(isLineVisibleTo({ revelada: false, reveladaPara: ['u2'] }, 'u1'), false);
});

test('buildEditBlocks: setas, cores e seletor sem as perícias já escolhidas', () => {
  const groups = skillOptionGroups(
    { skills: ['intuicao', 'percepcao'], aptitudes: [], crafts: [] },
    t,
  );
  const [first, , last] = buildEditBlocks(sampleBlocks(), { t, groups });
  assert.equal(first.first, true);
  assert.equal(last.last, true);
  assert.equal(last.cor, 2);
  assert.deepEqual(
    first.chips.map((chip) => chip.label),
    ['Intuição'],
  );
  assert.deepEqual(
    first.groups[0].options.map((option) => option.key),
    ['percepcao'],
  );
  assert.equal(first.linhas[0].first, true);
  assert.equal(first.linhas[1].last, true);
});

test('buildGmBoard: tudo, com DT, nota, condição e texto enriquecido', async () => {
  const board = await buildGmBoard(sampleBlocks(), { t, enrich });
  assert.equal(board.length, 3);
  assert.equal(board[0].label, 'Intuição');
  assert.equal(board[0].linhas[0].texto, '<E>texto A</E>');
  assert.equal(board[0].linhas[0].notaMestre, 'só mestre');
  assert.equal(board[0].linhas[1].condicao, 'depois de A');
  assert.equal(board[2].oculta, true);
});

test('buildPlayerBoard: nada revelado mostra só as perícias não ocultas', async () => {
  const board = await buildPlayerBoard(sampleBlocks(), { userId: 'u1', t, enrich });
  assert.deepEqual(board, [
    { label: 'Intuição', cor: 0, linhas: [] },
    { label: 'Percepção', cor: 1, linhas: [] },
  ]);
});

test('buildPlayerBoard: linha revelada mostra só o texto (sem DT nem nota)', async () => {
  const blocks = sampleBlocks();
  blocks[0].linhas[0].revelada = true;
  const board = await buildPlayerBoard(blocks, { userId: 'u1', t, enrich });
  assert.deepEqual(board[0].linhas, [{ id: 'a1', texto: '<E>texto A</E>', novo: false }]);
  const json = JSON.stringify(board);
  for (const secret of ['só mestre', 'depois de A', 'texto B', '"dt"', 'D</E>']) {
    assert.ok(!json.includes(secret), secret);
  }
});

test('buildPlayerBoard: bloco oculto aparece só para quem tem linha revelada', async () => {
  const blocks = sampleBlocks();
  blocks[2].linhas[0].reveladaPara = ['u2'];
  const forU1 = await buildPlayerBoard(blocks, { userId: 'u1', t, enrich });
  const forU2 = await buildPlayerBoard(blocks, { userId: 'u2', t, enrich });
  assert.equal(forU1.length, 2);
  assert.deepEqual(forU2[2], {
    label: 'Ocultismo',
    cor: 2,
    linhas: [{ id: 'c1', texto: '<E>D</E>', novo: false }],
  });
});

test('buildPlayerBoard: a mesma perícia em dois blocos vira um grupo só', async () => {
  const blocks = normalizeBlocks([
    { id: 'a', pericias: ['percepcao'], linhas: [{ id: 'a1', texto: '1', revelada: true }] },
    { id: 'b', pericias: ['intuicao'], linhas: [] },
    { id: 'c', pericias: ['percepcao'], linhas: [{ id: 'c1', texto: '2', revelada: true }] },
  ]);
  const board = await buildPlayerBoard(blocks, { userId: 'u1', t, enrich });
  assert.deepEqual(
    board.map((group) => [group.label, group.linhas.map((line) => line.id)]),
    [
      ['Percepção', ['a1', 'c1']],
      ['Intuição', []],
    ],
  );
});

test('setLineRevealed: revela para todos; esconder limpa também os jogadores', () => {
  let blocks = setLineUsers(sampleBlocks(), 'a', 'a1', ['u1', 'u1', 'u2']);
  assert.deepEqual(blocks[0].linhas[0].reveladaPara, ['u1', 'u2']);
  blocks = setLineRevealed(blocks, 'a', 'a1', true);
  assert.equal(blocks[0].linhas[0].revelada, true);
  assert.deepEqual(blocks[0].linhas[0].reveladaPara, ['u1', 'u2'], 'revelar não apaga a lista');
  blocks = setLineRevealed(blocks, 'a', 'a1', false);
  assert.equal(blocks[0].linhas[0].revelada, false);
  assert.deepEqual(blocks[0].linhas[0].reveladaPara, []);
  assert.equal(blocks[0].linhas[1].revelada, false, 'as outras linhas não mudam');
});

test('setBlockRevealed e hideAll', () => {
  let blocks = setBlockRevealed(sampleBlocks(), 'a', true);
  assert.deepEqual(
    blocks[0].linhas.map((line) => line.revelada),
    [true, true],
  );
  assert.equal(blocks[1].linhas[0].revelada, false);
  assert.equal(hasRevealed(blocks), true);
  blocks = setLineUsers(blocks, 'c', 'c1', ['u1']);
  blocks = hideAll(blocks);
  assert.equal(hasRevealed(blocks), false);
});

test('buildGmBoard: bloco todo revelado e nomes de quem vê a linha', async () => {
  let blocks = setBlockRevealed(sampleBlocks(), 'a', true);
  blocks = setLineUsers(blocks, 'b', 'b1', ['u1', 'u2']);
  const names = { u1: 'Ana', u2: 'Beto' };
  const board = await buildGmBoard(blocks, { t, enrich, userName: (id) => names[id] });
  assert.equal(board[0].todasReveladas, true);
  assert.equal(board[1].todasReveladas, false);
  assert.equal(board[1].linhas[0].reveladaPara, 2);
  assert.equal(board[1].linhas[0].reveladaParaNomes, 'Ana, Beto');
});

test('linhas novas: vê agora e ainda não tinha visto', async () => {
  let blocks = setLineRevealed(sampleBlocks(), 'a', 'a1', true);
  blocks = setLineUsers(blocks, 'b', 'b1', ['u1']);
  const visible = visibleLineIds(blocks, 'u1');
  assert.deepEqual(visible, ['a1', 'b1']);
  assert.deepEqual(visibleLineIds(blocks, 'u2'), ['a1']);
  assert.deepEqual(newLineIds(visible, ['a1', 'zz']), ['b1']);
  assert.deepEqual(newLineIds(visible, undefined), ['a1', 'b1']);
  const board = await buildPlayerBoard(blocks, { userId: 'u1', t, enrich, fresh: ['b1'] });
  assert.deepEqual(
    board.flatMap((group) => group.linhas.map((line) => [line.id, line.novo])),
    [
      ['a1', false],
      ['b1', true],
    ],
  );
});

test('sameIds: compara sem contar a ordem', () => {
  assert.equal(sameIds(['a', 'b'], ['b', 'a']), true);
  assert.equal(sameIds(['a'], ['a', 'b']), false);
  assert.equal(sameIds(undefined, []), true);
});

test('groupChoices e findGroupKey: grupos sem repetir e combinação pelo nome da perícia', () => {
  const blocks = normalizeBlocks([
    { id: 'a', pericias: ['percepcao'] },
    { id: 'b', pericias: ['intuicao', 'aptidao:guerra'] },
    { id: 'c', pericias: ['percepcao'] },
  ]);
  assert.deepEqual(
    groupChoices(blocks, t).map((group) => group.label),
    ['Percepção', 'Intuição ou Aptidão (Guerra)'],
  );
  assert.equal(findGroupKey(blocks, 'Percepção', t), 'percepção');
  assert.equal(findGroupKey(blocks, 'Aptidão (Guerra)', t), 'intuição ou aptidão (guerra)');
  assert.equal(findGroupKey(blocks, 'Luta', t), '');
  assert.equal(findGroupKey(blocks, '', t), '');
});

test('textSnippet: tira o HTML e corta textos longos', () => {
  assert.equal(
    textSnippet('<p>Um <strong>baú</strong></p><p>velho &amp; sujo</p>'),
    'Um baú velho & sujo',
  );
  assert.equal(textSnippet('abcdefghij', 5), 'abcd…');
});

test('investigationRows: DT até o valor, condição desmarcada, marcação manual', () => {
  const blocks = normalizeBlocks([
    {
      id: 'a',
      pericias: ['percepcao'],
      linhas: [
        { id: 'a1', dt: 6, texto: '<p>um</p>' },
        { id: 'a2', dt: 8, texto: 'dois', condicao: 'depois do baú' },
        { id: 'a3', dt: 12, texto: 'três' },
      ],
    },
    { id: 'b', pericias: ['intuicao'], linhas: [{ id: 'b1', dt: 4 }] },
    { id: 'c', pericias: ['percepcao'], linhas: [{ id: 'c1', dt: 10 }] },
  ]);
  const rows = investigationRows(blocks, { groupKey: 'percepção', value: 10, t });
  assert.deepEqual(
    rows.map((row) => [row.lineId, row.alcanca, row.marcada]),
    [
      ['a1', true, true],
      ['a2', true, false],
      ['a3', false, false],
      ['c1', true, true],
    ],
  );
  assert.equal(rows[0].resumo, 'um');
  const manual = investigationRows(blocks, {
    groupKey: 'percepção',
    value: 10,
    t,
    overrides: { a2: true, a1: false },
  });
  assert.deepEqual(
    manual.filter((row) => row.marcada).map((row) => row.lineId),
    ['a2', 'c1'],
  );
});

test('applyReveal: para todos ou acrescentando jogadores', () => {
  let blocks = setLineUsers(sampleBlocks(), 'a', 'a1', ['u1']);
  const all = applyReveal(blocks, ['a1', 'b1'], { all: true });
  assert.equal(all[0].linhas[0].revelada, true);
  assert.equal(all[1].linhas[0].revelada, true);
  assert.equal(all[0].linhas[1].revelada, false);
  blocks = applyReveal(blocks, ['a1'], { userIds: ['u2', 'u1'] });
  assert.deepEqual(blocks[0].linhas[0].reveladaPara, ['u1', 'u2']);
  assert.equal(blocks[0].linhas[0].revelada, false);
});

test('examineFindsNothing: só o que já era visto (ou nada) não é informação nova', () => {
  const blocks = setLineRevealed(sampleBlocks(), 'a', 'a1', true);
  assert.equal(examineFindsNothing(blocks, ['a1'], 'u1'), true);
  assert.equal(examineFindsNothing(blocks, [], 'u1'), true);
  assert.equal(examineFindsNothing(blocks, ['a1', 'a2'], 'u1'), false);
  const forU1 = setLineUsers(blocks, 'b', 'b1', ['u1']);
  assert.equal(examineFindsNothing(forU1, ['b1'], 'u1'), true);
  assert.equal(examineFindsNothing(forU1, ['b1'], 'u2'), false);
});

test('penalidade do Examinar: cena «investigacao» com o ator como alvo', async () => {
  const { createPenaltyFlag, penaltyScene, actorTargetScene, penaltyAllows } =
    await import('../scripts/rolls/chase.js');
  const flag = createPenaltyFlag({ tipo: 'pd', valor: 1, cena: 'investigacao', alvos: ['ator1'] });
  assert.equal(penaltyScene(flag), 'investigacao');
  assert.equal(actorTargetScene(flag), true);
  assert.equal(penaltyAllows(flag, 'ator1'), true);
  assert.equal(penaltyAllows(flag, 'ator2'), false);
  assert.equal(
    actorTargetScene(createPenaltyFlag({ tipo: 'pv', valor: 1, cena: 'furtividade' })),
    false,
  );
});

test('compareNumbers: ordem numérica e hierárquica', () => {
  const list = ['3.2', '10', '1.1', '3', '', '2', '3.1.1', '1', '3.1', '1.2', 'A'];
  assert.deepEqual([...list].sort(compareNumbers), [
    '1',
    '1.1',
    '1.2',
    '2',
    '3',
    '3.1',
    '3.1.1',
    '3.2',
    '10',
    'A',
    '',
  ]);
  assert.ok(compareNumbers('4.2', '4.10') < 0);
});

test('sortUpdates: páginas comuns primeiro, pontos pelo número, só o que muda', () => {
  const pages = [
    { id: 'p3', isPoint: true, numero: '3', sort: 100000 },
    { id: 'txt', isPoint: false, sort: 200000 },
    { id: 'p1', isPoint: true, numero: '1', sort: 300000 },
    { id: 'p11', isPoint: true, numero: '1.1', sort: 400000 },
  ];
  assert.deepEqual(sortUpdates(pages), [
    { _id: 'txt', sort: 100000 },
    { _id: 'p1', sort: 200000 },
    { _id: 'p11', sort: 300000 },
    { _id: 'p3', sort: 400000 },
  ]);
  const sorted = [
    { id: 'txt', isPoint: false, sort: 100000 },
    { id: 'p1', isPoint: true, numero: '1', sort: 200000 },
  ];
  assert.deepEqual(sortUpdates(sorted), []);
});

test('nextChildNumber e childNumberFor: numeração dos subpontos', () => {
  assert.equal(nextChildNumber('3', []), '3.1');
  assert.equal(nextChildNumber('3', ['3.1', '3.2', '3.2.1', '4.7']), '3.3');
  assert.equal(nextChildNumber('', ['1']), '');
  assert.equal(childNumberFor('5', '3.2'), '5.2');
  assert.equal(childNumberFor('5.1', '3.2.4'), '5.1.4');
  assert.equal(childNumberFor('5', ''), '5.1');
  assert.equal(childNumberFor('', '3.2'), '3.2');
});

test('descendantIds e parentChoices: sem ciclos', () => {
  const points = [
    { id: 'a', name: 'A', numero: '1' },
    { id: 'b', name: 'B', numero: '1.1', paiId: 'a' },
    { id: 'c', name: 'C', numero: '1.1.1', paiId: 'b' },
    { id: 'd', name: 'D', numero: '2' },
  ];
  assert.deepEqual(descendantIds(points, 'a').sort(), ['b', 'c']);
  assert.deepEqual(
    parentChoices(points, 'b').map((page) => page.id),
    ['a', 'd'],
  );
  // Ciclo gravado por engano não trava
  const loop = [
    { id: 'x', paiId: 'y' },
    { id: 'y', paiId: 'x' },
  ];
  assert.deepEqual(descendantIds(loop, 'x'), ['y']);
});

test('noteIconFor: imagem visível vira ícone; escondida ou ausente, a lupa', () => {
  const lupa = 'lupa.svg';
  assert.equal(noteIconFor({ imagem: 'cofre.webp', imagemVisivel: true }, lupa), 'cofre.webp');
  assert.equal(noteIconFor({ imagem: 'cofre.webp', imagemVisivel: false }, lupa), lupa);
  assert.equal(noteIconFor({ imagem: '', imagemVisivel: true }, lupa), lupa);
  assert.equal(noteIconFor(undefined, lupa), lupa);
});

test('noteUpdates: troca só o ícone e o texto que o sistema controla', () => {
  const notes = [
    { id: 'n1', src: 'velha.webp', text: '2 · Cofre' },
    { id: 'n2', src: 'icons/svg/book.svg', text: '' },
    { id: 'n3', src: 'escolhida-a-mao.webp', text: 'Meu texto' },
    { id: 'n4', src: 'nova.webp', text: '5 · Cofre' },
  ];
  const updates = noteUpdates(notes, {
    oldIcon: 'velha.webp',
    newIcon: 'nova.webp',
    oldName: '2 · Cofre',
    newName: '5 · Cofre',
    managed: ['lupa.svg', 'icons/svg/book.svg'],
  });
  assert.deepEqual(updates, [
    { _id: 'n1', 'texture.src': 'nova.webp', text: '5 · Cofre' },
    { _id: 'n2', 'texture.src': 'nova.webp', text: '5 · Cofre' },
  ]);
});

test('linkTypeOf: tipo pelo UUID, também em compêndios e páginas', () => {
  assert.equal(linkTypeOf('Item.abc'), 'Item');
  assert.equal(linkTypeOf('JournalEntry.x.JournalEntryPage.y'), 'JournalEntryPage');
  assert.equal(linkTypeOf('Compendium.desordem-normal.itens.Item.abc'), 'Item');
  assert.equal(linkTypeOf('Actor.a'), 'Actor');
  assert.equal(linkTypeOf('Scene.s'), '');
  assert.equal(linkTypeOf(''), '');
});

test('vínculos: acrescentar sem repetir, revelar, jogadores, esconder, quantidade', () => {
  let links = addLink([], newLink('v1', 'Item.pote'));
  links = addLink(links, newLink('v2', 'JournalEntry.docA'));
  assert.equal(addLink(links, newLink('v3', 'Item.pote')), links, 'mesmo documento não repete');
  assert.equal(addLink(links, newLink('v4', 'Scene.x')), links, 'tipo não aceito');
  links = setLinkUsers(links, 'v2', ['u1', 'u1']);
  assert.deepEqual(links[1].reveladoPara, ['u1']);
  links = setLinkRevealed(links, 'v1', true);
  assert.equal(links[0].revelado, true);
  links = hideAllLinks(links);
  assert.equal(links[0].revelado, false);
  assert.deepEqual(links[1].reveladoPara, []);
  links = takeOne(takeOne(links, 'v1'), 'v1');
  assert.equal(links[0].quantidade, 0, 'não passa de zero');
  links = removeLink(links, 'v1');
  assert.deepEqual(
    links.map((link) => link.id),
    ['v2'],
  );
});

test('normalizeLinks e applyLinkForm', () => {
  const links = normalizeLinks([
    { id: 'v1', uuid: 'Item.a', quantidade: '3', reveladoPara: ['u1', ''] },
    { uuid: 'Scene.x' },
    { uuid: 'Actor.b', quantidade: -5 },
  ]);
  // O segundo vínculo válido não tinha id: recebe um novo, sem repetir o «v1» do primeiro
  assert.deepEqual(
    links.map((link) => [link.id, link.tipo, link.quantidade]),
    [
      ['v1', 'Item', 3],
      ['v0', 'Actor', 0],
    ],
  );
  const edited = applyLinkForm(links, {
    v1: { rotulo: ' Bálsamo ', linhaId: 'a1', quantidade: 2 },
  });
  assert.equal(edited[0].rotulo, 'Bálsamo');
  assert.equal(edited[0].linhaId, 'a1');
  assert.equal(edited[0].quantidade, 2);
  assert.equal(applyLinkForm(links, null), links);
});

test('isLinkVisibleTo e linkAudience: pelo próprio olho ou pela linha amarrada', () => {
  let blocks = sampleBlocks();
  const link = { ...newLink('v1', 'JournalEntry.docA'), linhaId: 'a1' };
  assert.equal(isLinkVisibleTo(link, blocks, 'u1'), false);
  assert.deepEqual(linkAudience(link, blocks), { all: false, userIds: [] });
  blocks = setLineUsers(blocks, 'a', 'a1', ['u2']);
  assert.equal(isLinkVisibleTo(link, blocks, 'u2'), true);
  assert.equal(isLinkVisibleTo(link, blocks, 'u1'), false);
  assert.deepEqual(linkAudience({ ...link, reveladoPara: ['u3'] }, blocks), {
    all: false,
    userIds: ['u3', 'u2'],
  });
  blocks = setLineRevealed(blocks, 'a', 'a1', true);
  assert.equal(isLinkVisibleTo(link, blocks, 'u1'), true);
  assert.deepEqual(linkAudience(link, blocks), { all: true, userIds: [] });
});

test('buildLinks: mestre vê tudo; jogador só o que vê, com o item esgotado em cinza', () => {
  const blocks = sampleBlocks();
  const links = normalizeLinks([
    { id: 'v1', uuid: 'Item.pote', revelado: true, quantidade: 0 },
    { id: 'v2', uuid: 'JournalEntry.docA', rotulo: 'Documento A', linhaId: 'a2' },
    { id: 'v3', uuid: 'Actor.sumiu', reveladoPara: ['u1'] },
  ]);
  const names = { 'Item.pote': 'Pote de argila', 'JournalEntry.docA': 'Carta' };
  const resolve = (uuid) => (names[uuid] ? { name: names[uuid] } : null);
  const gm = buildLinks(links, { blocks, resolve, t });
  assert.equal(gm.length, 3);
  assert.equal(gm[0].label, 'Pote de argila');
  assert.equal(gm[0].esgotado, true);
  assert.equal(gm[1].label, 'Documento A');
  assert.equal(gm[1].linha, 'DT 10 · texto B');
  assert.equal(gm[2].missing, true);
  const player = buildLinks(links, { blocks, resolve, userId: 'u1' });
  assert.deepEqual(
    player.map((link) => [link.id, link.esgotado]),
    [
      ['v1', true],
      ['v3', false],
    ],
  );
  assert.ok(!('revelado' in player[0]), 'o jogador não recebe o estado de revelação');
});

test('lineChoices: perícia, DT e começo do texto', () => {
  const choices = lineChoices(sampleBlocks(), t);
  assert.equal(choices[0].id, 'a1');
  assert.equal(choices[0].label, 'Intuição · DT 7 · texto A');
});

test('grantOwnership: só sobe a permissão de quem recebeu', () => {
  assert.deepEqual(grantOwnership({ default: 0 }, { all: true, userIds: [] }, 2), { default: 2 });
  assert.equal(grantOwnership({ default: 3 }, { all: true, userIds: [] }, 2), null);
  assert.deepEqual(
    grantOwnership({ default: 0, u1: 1 }, { all: false, userIds: ['u1', 'u2'] }, 2),
    {
      default: 0,
      u1: 2,
      u2: 2,
    },
  );
  assert.equal(grantOwnership({ default: 2 }, { all: false, userIds: ['u1'] }, 2), null);
  assert.equal(grantOwnership({ default: 0, u1: 3 }, { all: false, userIds: ['u1'] }, 2), null);
  assert.equal(grantOwnership({ default: 0 }, { all: false, userIds: [] }, 2), null);
});

test('visibleLinkIds e marca de «novo» dos vínculos', () => {
  const blocks = setLineRevealed(sampleBlocks(), 'a', 'a1', true);
  const links = normalizeLinks([
    { id: 'v1', uuid: 'Item.a', linhaId: 'a1' },
    { id: 'v2', uuid: 'Item.b' },
  ]);
  assert.deepEqual(visibleLinkIds(links, blocks, 'u1'), ['v1']);
  const view = buildLinks(links, {
    blocks,
    resolve: () => ({ name: 'x' }),
    userId: 'u1',
    fresh: ['v1'],
  });
  assert.equal(view[0].novo, true);
});
