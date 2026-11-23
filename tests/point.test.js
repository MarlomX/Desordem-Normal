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
