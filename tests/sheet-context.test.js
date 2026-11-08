import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dieOptions,
  buildAttributeRows,
  buildSkillRows,
  buildAptitudeRows,
  buildLesionRows,
  buildFearChoices,
  buildRelationRows,
  buildEffectRows,
  buildEquipmentRows,
  buildChoices,
} from '../scripts/sheets/context.js';

test('dieOptions lista d4 a d12 e marca o dado atual', () => {
  const opcoes = dieOptions(8);
  assert.deepEqual(
    opcoes.map((o) => o.label),
    ['d4', 'd6', 'd8', 'd10', 'd12'],
  );
  assert.deepEqual(
    opcoes.filter((o) => o.selected).map((o) => o.value),
    [8],
  );
});

test('dieOptions preserva um dado fora da escada (d20)', () => {
  const opcoes = dieOptions(20);
  assert.equal(opcoes.at(-1).label, 'd20');
  assert.equal(opcoes.at(-1).selected, true);
  assert.equal(opcoes.filter((o) => o.selected).length, 1);
});

test('dieOptions aceita o valor como texto', () => {
  assert.equal(dieOptions('10').find((o) => o.selected).value, 10);
});

test('buildAttributeRows segue a ordem das chaves e traduz o nome', () => {
  const linhas = buildAttributeRows({ fisico: 6, mente: 8 }, ['mente', 'fisico'], (k) =>
    k.toUpperCase(),
  );
  assert.deepEqual(
    linhas.map((l) => l.label),
    ['MENTE', 'FISICO'],
  );
  assert.equal(linhas[0].options.find((o) => o.selected).value, 8);
});

test('buildSkillRows ordena por nome traduzido (com acentos) e traz o atributo-base', () => {
  const nomes = { enganacao: 'Enganação', crime: 'Crime', atletismo: 'Atletismo' };
  const linhas = buildSkillRows(
    { enganacao: 6, crime: 4, atletismo: 8 },
    { enganacao: 'emocao', crime: 'fisico', atletismo: 'fisico' },
    { skillLabel: (k) => nomes[k], attrLabel: (k) => `attr:${k}` },
  );
  assert.deepEqual(
    linhas.map((l) => l.key),
    ['atletismo', 'crime', 'enganacao'],
  );
  assert.equal(linhas[2].attrLabel, 'attr:emocao');
  assert.equal(linhas[0].options.find((o) => o.selected).value, 8);
});

test('buildAptitudeRows lista as áreas na ordem e marca o dado de cada uma', () => {
  const linhas = buildAptitudeRows({ artes: 4, erudicao: 8 }, ['erudicao', 'artes'], (k) =>
    k.toUpperCase(),
  );
  assert.deepEqual(
    linhas.map((l) => l.label),
    ['ERUDICAO', 'ARTES'],
  );
  assert.equal(linhas[0].options.find((o) => o.selected).value, 8);
  assert.equal(linhas[1].options.find((o) => o.selected).value, 4);
});
test('buildLesionRows agrupa lesões repetidas e mantém a ordem', () => {
  const linhas = buildLesionRows(['semOlho', 'lacearacaoProfunda', 'lacearacaoProfunda'], (k) =>
    k.toUpperCase(),
  );
  assert.deepEqual(linhas, [
    { key: 'semOlho', label: 'SEMOLHO', count: 1, repeated: false },
    { key: 'lacearacaoProfunda', label: 'LACEARACAOPROFUNDA', count: 2, repeated: true },
  ]);
  assert.deepEqual(
    buildLesionRows([], (k) => k),
    [],
  );
});

test('buildFearChoices marca o dado atual e rotula a opção sem pavor', () => {
  const opcoes = buildFearChoices(8, 'Sem pavor');
  assert.deepEqual(
    opcoes.map((o) => o.value),
    [0, 4, 6, 8, 10, 12],
  );
  assert.equal(opcoes[0].label, 'Sem pavor');
  assert.equal(opcoes[3].label, 'd8');
  assert.deepEqual(
    opcoes.filter((o) => o.selected).map((o) => o.value),
    [8],
  );
});

test('buildRelationRows monta bolinhas e libera os botões conforme o grau', () => {
  const rows = buildRelationRows(
    [
      { pessoa: 'A', grau: 0, descricao: '', usada: false },
      { pessoa: 'B', grau: 2, descricao: 'x', usada: false },
      { pessoa: 'C', grau: 3, descricao: '', usada: true },
    ],
    { degreeLabel: (key) => `g:${key}` },
  );
  assert.deepEqual(
    rows.map((r) => r.dots.filter((d) => d.filled).length),
    [0, 2, 3],
  );
  assert.deepEqual(
    rows[0].dots.map((d) => d.n),
    [1, 2, 3],
  );
  assert.equal(rows[1].grauLabel, 'g:vinculo');
  assert.deepEqual(
    rows.map((r) => [r.showInvoke, r.canInvoke]),
    [
      [false, false],
      [true, true],
      [true, false],
    ],
  );
  assert.equal(rows[2].index, 2);
});

test('buildRelationRows trava tudo quando a ficha não é editável', () => {
  const [row] = buildRelationRows([{ pessoa: 'A', grau: 3, descricao: '', usada: false }], {
    degreeLabel: (key) => key,
    editable: false,
  });
  assert.equal(row.locked, true);
  assert.equal(row.canInvoke, false);
});

test('buildLesionRows acrescenta a descrição só quando há uma função para isso', () => {
  const [row] = buildLesionRows(
    ['semOlho'],
    (k) => k,
    (k) => `desc:${k}`,
  );
  assert.equal(row.description, 'desc:semOlho');
});

test('buildEffectRows monta os seletores de atributo e de passos', () => {
  const [row] = buildEffectRows(
    [{ nome: 'Tônico', descricao: 'd', atributo: 'mente', passos: 2 }],
    {
      attrLabel: (k) => k.toUpperCase(),
      noAttrLabel: '—',
      attributes: ['fisico', 'mente', 'emocao'],
    },
  );
  assert.deepEqual(
    row.attrOptions.map((o) => [o.value, o.selected]),
    [
      ['', false],
      ['fisico', false],
      ['mente', true],
      ['emocao', false],
    ],
  );
  assert.deepEqual(
    row.stepOptions.map((o) => o.label),
    ['-3', '-2', '-1', '0', '+1', '+2', '+3'],
  );
  assert.equal(row.stepOptions.find((o) => o.selected).value, 2);
  assert.equal(row.locked, false);
});

test('buildEquipmentRows separa armas, armaduras e itens e calcula mãos e armadura', () => {
  const items = [
    {
      id: 'w1',
      name: 'Machado',
      type: 'arma',
      system: {
        descricao: '',
        tipo: 'corpo',
        maos: 2,
        bonusDano: 3,
        pericia: '',
        naoLetal: false,
        empunhada: true,
      },
    },
    {
      id: 'w2',
      name: 'Arco',
      type: 'arma',
      system: {
        descricao: '',
        tipo: 'distancia',
        maos: 2,
        bonusDano: 1,
        pericia: '',
        naoLetal: false,
        empunhada: true,
      },
    },
    {
      id: 'a1',
      name: 'Tenaz',
      type: 'armadura',
      system: { descricao: '', pontos: 2, gastos: 1, vestida: true },
    },
    {
      id: 'i1',
      name: 'Bálsamo',
      type: 'item',
      system: { descricao: '', quantidade: 2, consumivel: true, usosMax: 0, usos: 0 },
    },
    {
      id: 'i2',
      name: 'Odre',
      type: 'item',
      system: { descricao: '', quantidade: 1, consumivel: false, usosMax: 3, usos: 0 },
    },
  ];
  const rows = buildEquipmentRows(items, {
    kindLabel: (k) => `tipo:${k}`,
    handsLabel: (n) => `${n}m`,
    skillLabel: (k) => `p:${k}`,
  });
  assert.deepEqual(
    rows.weapons.map((w) => [w.name, w.kindLabel, w.handsLabel, w.damageLabel, w.skillLabel]),
    [
      ['Machado', 'tipo:corpo', '2m', 'RA+3', 'p:luta'],
      ['Arco', 'tipo:distancia', '2m', 'RA+1', 'p:pontaria'],
    ],
  );
  assert.deepEqual(rows.hands, { used: 4, over: true });
  assert.deepEqual(
    rows.armors.map((a) => [a.pontos, a.restantes, a.vestida]),
    [[2, 1, true]],
  );
  assert.deepEqual(rows.armorTotals, { total: 2, available: 1 });
  assert.deepEqual(
    rows.others.map((o) => [o.name, o.showUse, o.canUse, o.hasUsos]),
    [
      ['Bálsamo', true, true, false],
      ['Odre', true, false, true],
    ],
  );
});

test('buildEquipmentRows trava os botões quando a ficha não é editável', () => {
  const rows = buildEquipmentRows(
    [
      {
        id: 'i',
        name: 'X',
        type: 'item',
        system: { descricao: '', quantidade: 1, consumivel: true, usosMax: 0, usos: 0 },
      },
    ],
    { kindLabel: (k) => k, handsLabel: String, skillLabel: (k) => k, editable: false },
  );
  assert.equal(rows.others[0].canUse, false);
  assert.equal(rows.others[0].locked, true);
});

test('buildChoices marca a opção atual', () => {
  assert.deepEqual(
    buildChoices(['a', 'b'], 'b', (v) => v.toUpperCase()),
    [
      { value: 'a', label: 'A', selected: false },
      { value: 'b', label: 'B', selected: true },
    ],
  );
});
