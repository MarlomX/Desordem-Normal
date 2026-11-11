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
  buildAbilityRows,
  SHEET_TABS,
  resolveActiveTab,
  buildTabs,
  tabForItemType,
  resourcePercent,
  stepResource,
  stepCounter,
  PIP_MAX,
  buildPips,
  togglePip,
  buildStatusTags,
  isResourceLow,
  normalizeSearch,
  rowMatches,
  filterSkillRows,
  nextOpenIds,
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

const wpn = (id, maos, empunhada, tipo = 'corpo', bonusDano = 0) => ({
  id,
  name: id,
  type: 'arma',
  system: { descricao: '', tipo, maos, bonusDano, pericia: '', naoLetal: false, empunhada },
});
const armr = (id, pontos, restantes, vestida) => ({
  id,
  name: id,
  type: 'armadura',
  system: { descricao: '', pontos, restantes, vestida },
});
const itm = (id, extra = {}) => ({
  id,
  name: id,
  type: 'item',
  system: {
    descricao: '',
    quantidade: 1,
    consumivel: false,
    usosMax: 0,
    usos: 0,
    maos: 1,
    empunhada: false,
    ...extra,
  },
});
const labels = {
  kindLabel: (k) => `tipo:${k}`,
  handsLabel: (n) => `${n}m`,
  skillLabel: (k) => `p:${k}`,
};

test('buildEquipmentRows separa armas, armaduras e itens e calcula mãos e armadura', () => {
  const rows = buildEquipmentRows(
    [
      wpn('Machado', 1, true, 'corpo', 3),
      wpn('Arco', 2, false, 'distancia', 1),
      armr('Tenaz', 2, 1, true),
      itm('Bálsamo', { quantidade: 2, consumivel: true }),
      itm('Odre', { usosMax: 3, usos: 0 }),
    ],
    labels,
  );
  assert.deepEqual(
    rows.weapons.map((w) => [w.name, w.kindLabel, w.handsLabel, w.damageLabel, w.skillLabel]),
    [
      ['Machado', 'tipo:corpo', '1m', 'RA+3', 'p:luta'],
      ['Arco', 'tipo:distancia', '2m', 'RA+1', 'p:pontaria'],
    ],
  );
  assert.deepEqual(rows.hands, { used: 1, over: false });
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

test('buildEquipmentRows bloqueia equipar o que não cabe nas duas mãos (armas e itens juntos)', () => {
  const rows = buildEquipmentRows(
    [
      wpn('Espada', 1, true),
      itm('Tocha', { empunhada: true }),
      wpn('Arco', 2, false),
      itm('Livro'),
    ],
    labels,
  );
  assert.deepEqual(rows.hands, { used: 2, over: false });
  // quem já está equipado nunca é bloqueado (pode desequipar); os demais não cabem
  assert.deepEqual(
    rows.weapons.map((w) => [w.name, w.blocked]),
    [
      ['Espada', false],
      ['Arco', true],
    ],
  );
  assert.deepEqual(
    rows.others.map((o) => [o.name, o.blocked]),
    [
      ['Tocha', false],
      ['Livro', true],
    ],
  );
});

test('buildEquipmentRows libera equipar quando há mão livre', () => {
  const rows = buildEquipmentRows([wpn('Espada', 1, true), itm('Tocha')], labels);
  assert.equal(rows.others[0].blocked, false);
});

test('buildEquipmentRows permite uma só armadura vestida', () => {
  const rows = buildEquipmentRows([armr('A', 1, 1, true), armr('B', 1, 1, false)], labels);
  assert.deepEqual(
    rows.armors.map((a) => [a.name, a.blocked]),
    [
      ['A', false],
      ['B', true],
    ],
  );
  const free = buildEquipmentRows([armr('A', 1, 1, false), armr('B', 1, 1, false)], labels);
  assert.deepEqual(
    free.armors.map((a) => a.blocked),
    [false, false],
  );
});

test('buildEquipmentRows trava os botões quando a ficha não é editável', () => {
  const rows = buildEquipmentRows(
    [itm('X', { consumivel: true }), armr('A', 1, 1, false), wpn('W', 1, false)],
    { ...labels, editable: false },
  );
  assert.equal(rows.others[0].canUse, false);
  assert.equal(rows.others[0].locked, true);
  assert.equal(rows.others[0].blocked, true);
  assert.equal(rows.armors[0].blocked, true);
  assert.equal(rows.weapons[0].blocked, true);
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

const abl = (id, name, automacao, perfil = false) => ({
  id,
  name,
  system: { descricao: '', perfil, automacao },
});

test('buildAbilityRows põe a de perfil primeiro e ordena as outras por nome', () => {
  const rows = buildAbilityRows(
    [abl('1', 'Zeta', 'esquiva'), abl('2', 'Alfa', ''), abl('3', 'Meio', 'impeto', true)],
    { active: [], resources: { impeto: 2, analise: 0 }, hurtCompanion: false },
  );
  assert.deepEqual(
    rows.map((r) => r.name),
    ['Meio', 'Alfa', 'Zeta'],
  );
});

test('buildAbilityRows mostra os controles de cada automação e o estado das ativações', () => {
  const rows = buildAbilityRows(
    [
      abl('1', 'A', 'impeto'),
      abl('2', 'B', 'analise'),
      abl('3', 'C', 'esquiva'),
      abl('4', 'D', 'curandeiro'),
      abl('5', 'E', 'companheiro'),
      abl('6', 'F', 'sorrateiro'),
      abl('7', 'G', 'prontidao'),
    ],
    { active: ['impetoDado'], resources: { impeto: 3, analise: 1 }, hurtCompanion: true },
  );
  const by = Object.fromEntries(rows.map((r) => [r.name, r]));
  assert.equal(by.A.showImpeto, true);
  assert.equal(by.A.impeto, 3);
  assert.equal(by.A.impetoDadoAtivo, true);
  assert.equal(by.B.showAnalise, true);
  assert.equal(by.B.analise, 1);
  assert.equal(by.C.showDodge, true);
  assert.equal(by.D.showHeal, true);
  assert.equal(by.E.showCompanion, true);
  assert.equal(by.E.animalFerido, true);
  assert.equal(by.F.showSneak, true);
  assert.equal(by.F.sorrateiroAtivo, false);
  // a repetição de dado só aparece nos cartões de teste, não na ficha
  assert.equal(by.G.showImpeto || by.G.showAnalise || by.G.showHeal, false);
});

test('buildAbilityRows trava os controles quando a ficha não é editável', () => {
  const [row] = buildAbilityRows([abl('1', 'A', 'impeto')], {
    active: [],
    resources: { impeto: 0, analise: 0 },
    hurtCompanion: false,
    editable: false,
  });
  assert.equal(row.locked, true);
});

// --- Abas e cabeçalho (v0.12.0) ---
test('as 5 abas estão na ordem combinada e têm ícone', () => {
  assert.deepEqual(
    SHEET_TABS.map((t) => t.id),
    ['testes', 'habilidades', 'equipamento', 'condicao', 'relacoes'],
  );
  assert.ok(SHEET_TABS.every((t) => t.icon.startsWith('fa-')));
});

test('resolveActiveTab aceita aba válida e cai na primeira se for inválida ou ausente', () => {
  assert.equal(resolveActiveTab('condicao'), 'condicao');
  assert.equal(resolveActiveTab('nao-existe'), 'testes');
  assert.equal(resolveActiveTab(undefined), 'testes');
});

test('buildTabs marca só a aba ativa, na lista e no estado dos painéis', () => {
  const { list, state } = buildTabs('equipamento', (id) => `T-${id}`);
  assert.deepEqual(
    list.filter((t) => t.active).map((t) => t.id),
    ['equipamento'],
  );
  assert.equal(list[0].label, 'T-testes');
  assert.deepEqual(state, {
    testes: false,
    habilidades: false,
    equipamento: true,
    condicao: false,
    relacoes: false,
  });
});

test('tabForItemType leva cada tipo de item para a aba certa', () => {
  assert.equal(tabForItemType('habilidade'), 'habilidades');
  for (const type of ['arma', 'armadura', 'item'])
    assert.equal(tabForItemType(type), 'equipamento');
  assert.equal(tabForItemType('outro'), undefined);
});

test('resourcePercent limita entre 0 e 100 e trata máximo zero', () => {
  assert.equal(resourcePercent(11, 22), 50);
  assert.equal(resourcePercent(30, 22), 100);
  assert.equal(resourcePercent(-3, 22), 0);
  assert.equal(resourcePercent(5, 0), 0);
});

test('stepResource sobe e desce sem passar de 0 nem do máximo', () => {
  assert.equal(stepResource({ value: 10, max: 12 }, 1), 11);
  assert.equal(stepResource({ value: 12, max: 12 }, 1), 12);
  assert.equal(stepResource({ value: 0, max: 12 }, -1), 0);
  assert.equal(stepResource({ value: 7, max: 12 }, -1), 6);
});

test('stepCounter nunca fica abaixo de 0', () => {
  assert.equal(stepCounter(0, -1), 0);
  assert.equal(stepCounter(2, 1), 3);
});

test('buildPips preenche até o valor e togglePip apaga o último ao clicar nele', () => {
  assert.deepEqual(
    buildPips(2, PIP_MAX.analise).map((p) => p.filled),
    [true, true, false, false],
  );
  assert.equal(buildPips(0, PIP_MAX.impeto).length, 5);
  assert.equal(togglePip(2, 4), 4);
  assert.equal(togglePip(2, 2), 1);
  assert.equal(togglePip(1, 1), 0);
  assert.equal(togglePip(3, 1), 1);
});

test('buildStatusTags lista condições ativas e o pavor, com a cor de cada grupo', () => {
  const estado = {
    inconsciente: false,
    moribundo: true,
    morteLenta: false,
    contusao: true,
    morto: false,
    estupor: true,
    colapso: false,
    pavor: 6,
  };
  const tags = buildStatusTags(estado, {
    stateLabel: (k) => `E-${k}`,
    fearLabel: (d) => `Pavor d${d}`,
  });
  assert.deepEqual(
    tags.map((t) => [t.label, t.tone]),
    [
      ['E-moribundo', 'saude'],
      ['E-contusao', 'saude'],
      ['E-estupor', 'mental'],
      ['Pavor d6', 'mental'],
    ],
  );
  assert.equal(tags.find((t) => t.key === 'pavor').die, 6);
  const vazio = buildStatusTags(
    { ...estado, moribundo: false, contusao: false, estupor: false, pavor: 0 },
    { stateLabel: (k) => k, fearLabel: (d) => `d${d}` },
  );
  assert.deepEqual(vazio, []);
  const morto = buildStatusTags(
    { ...estado, moribundo: false, contusao: false, estupor: false, pavor: 0, morto: true },
    { stateLabel: (k) => k, fearLabel: (d) => `d${d}` },
  );
  assert.equal(morto[0].tone, 'grave');
});

// --- Visual (v0.12.1) ---

test('buildSkillRows traz o dado da perícia, o do atributo-base e se é treinada', () => {
  const linhas = buildSkillRows(
    { luta: 8, furtividade: 4 },
    { luta: 'fisico', furtividade: 'fisico' },
    {
      skillLabel: (k) => k,
      attrLabel: (k) => k,
      attributeDice: { fisico: 10 },
    },
  );
  const luta = linhas.find((l) => l.key === 'luta');
  assert.deepEqual([luta.die, luta.attrDie, luta.trained], [8, 10, true]);
  const furtividade = linhas.find((l) => l.key === 'furtividade');
  assert.deepEqual([furtividade.die, furtividade.trained], [4, false]);
});

test('buildSkillRows sem attributeDice deixa o dado do atributo indefinido', () => {
  const [linha] = buildSkillRows(
    { luta: 6 },
    { luta: 'fisico' },
    {
      skillLabel: (k) => k,
      attrLabel: (k) => k,
    },
  );
  assert.equal(linha.attrDie, undefined);
  assert.equal(linha.trained, true);
});

test('buildAttributeRows e buildAptitudeRows trazem o dado atual (die)', () => {
  const [linha] = buildAttributeRows({ fisico: 12 }, ['fisico'], (k) => k);
  assert.equal(linha.die, 12);
  const [apt] = buildAptitudeRows({ artes: 8 }, ['artes'], (k) => k);
  assert.equal(apt.die, 8);
  assert.equal(apt.trained, true);
});

test('isResourceLow vale para um quarto do máximo ou menos e ignora máximo zero', () => {
  assert.equal(isResourceLow(5, 20), true);
  assert.equal(isResourceLow(6, 20), false);
  assert.equal(isResourceLow(0, 20), true);
  assert.equal(isResourceLow(0, 0), false);
});

// --- Habilidades recolhíveis e filtro de perícias (v0.12.9) ---

test('normalizeSearch tira acentos, caixa e espaços das pontas', () => {
  assert.equal(normalizeSearch('  Enganação '), 'enganacao');
  assert.equal(normalizeSearch('FÍSICO'), 'fisico');
  assert.equal(normalizeSearch(undefined), '');
});

test('buildSkillRows traz o texto de busca com nome e atributo, sem acentos', () => {
  const [linha] = buildSkillRows(
    { luta: 8 },
    { luta: 'fisico' },
    { skillLabel: () => 'Luta', attrLabel: () => 'Físico' },
  );
  assert.equal(linha.search, 'luta fisico');
});

test('buildAttributeRows e buildAptitudeRows trazem o texto de busca', () => {
  const [apt] = buildAptitudeRows({ erudicao: 8 }, ['erudicao'], () => 'Erudição');
  assert.equal(apt.search, 'erudicao');
});

const exemplo = [
  { search: 'luta fisico', die: 8 },
  { search: 'enganacao emocao', die: 4 },
  { search: 'furtividade fisico', die: 4 },
  { search: 'medicina mente', die: 6 },
];

test('rowMatches sem filtro mostra tudo', () => {
  assert.equal(filterSkillRows(exemplo, { text: '', trained: false }).length, 4);
  assert.equal(filterSkillRows(exemplo, {}).length, 4);
});

test('rowMatches busca por nome ou por atributo, sem acentos e ignorando caixa', () => {
  const nomes = (f) => filterSkillRows(exemplo, f).map((r) => r.search.split(' ')[0]);
  assert.deepEqual(nomes({ text: 'ENGANAÇÃO' }), ['enganacao']);
  assert.deepEqual(nomes({ text: 'físico' }), ['luta', 'furtividade']);
  assert.deepEqual(nomes({ text: 'zzz' }), []);
});

test('rowMatches exige todas as palavras digitadas', () => {
  assert.equal(filterSkillRows(exemplo, { text: 'fisico luta' }).length, 1);
  assert.equal(filterSkillRows(exemplo, { text: 'fisico mente' }).length, 0);
});

test('rowMatches com "só treinadas" esconde os d4 e combina com a busca', () => {
  assert.deepEqual(
    filterSkillRows(exemplo, { trained: true }).map((r) => r.die),
    [8, 6],
  );
  assert.deepEqual(
    filterSkillRows(exemplo, { text: 'fisico', trained: true }).map((r) => r.search),
    ['luta fisico'],
  );
});

test('nextOpenIds abre e recolhe sem repetir ids', () => {
  assert.deepEqual(nextOpenIds([], 'a', true), ['a']);
  assert.deepEqual(nextOpenIds(['a'], 'a', true), ['a']);
  assert.deepEqual(nextOpenIds(['a', 'b'], 'a', false), ['b']);
  assert.deepEqual(nextOpenIds(new Set(['a']), 'x', false), ['a']);
});

test('buildAbilityRows marca as habilidades abertas (openIds)', () => {
  const itens = [
    { id: 'h1', name: 'Análise', system: { automacao: 'analise', perfil: false, descricao: '' } },
    { id: 'h2', name: 'Esquiva', system: { automacao: 'esquiva', perfil: false, descricao: '' } },
  ];
  const opcoes = { active: [], resources: { impeto: 0, analise: 0 }, hurtCompanion: false };
  const linhas = buildAbilityRows(itens, { ...opcoes, openIds: ['h2'] });
  assert.deepEqual(
    linhas.map((l) => [l.id, l.open]),
    [
      ['h1', false],
      ['h2', true],
    ],
  );
  assert.equal(
    buildAbilityRows(itens, opcoes).every((l) => l.open === false),
    true,
  );
});

test('buildAttributeRows mostra o dado com passos temporários e o sentido da seta', () => {
  const stepOf = (key) =>
    key === 'fisico'
      ? { net: 2, manual: 2, effects: 0, direction: 'up' }
      : { net: -1, manual: -1, effects: 0, direction: 'down' };
  const [fisico, mente] = buildAttributeRows(
    { fisico: 6, mente: 4 },
    ['fisico', 'mente'],
    (k) => k,
    stepOf,
  );
  assert.equal(fisico.die, 6);
  assert.equal(fisico.shownDie, 10);
  assert.equal(fisico.shifted, true);
  assert.equal(fisico.stepUp, true);
  assert.equal(fisico.stepBig, true);
  assert.equal(fisico.stepAbs, 2);
  assert.equal(mente.shownDie, 4); // d4 não desce mais, sem transbordo
  assert.equal(mente.shifted, false);
  assert.equal(mente.stepDirection, 'down');
});

test('buildAttributeRows sem passos mostra o dado base', () => {
  const [linha] = buildAttributeRows({ fisico: 8 }, ['fisico'], (k) => k);
  assert.equal(linha.shownDie, 8);
  assert.equal(linha.shifted, false);
  assert.equal(linha.stepNet, 0);
  assert.equal(linha.stepDirection, 'none');
});

test('buildSkillRows aplica os passos do atributo e o geral das perícias', () => {
  const [linha] = buildSkillRows(
    { luta: 8 },
    { luta: 'fisico' },
    {
      skillLabel: (k) => k,
      attrLabel: (k) => k,
      attributeDice: { fisico: 6 },
      attrStepOf: () => ({ net: 1, manual: 1, effects: 0, direction: 'up' }),
      skillStep: { net: 2, manual: 2, effects: 0, direction: 'up' },
    },
  );
  assert.equal(linha.attrDie, 6);
  assert.equal(linha.attrShownDie, 8);
  assert.equal(linha.attrShifted, true);
  assert.equal(linha.die, 8);
  assert.equal(linha.shownDie, 12);
  assert.equal(linha.shifted, true);
});

test('buildAptitudeRows usa o passo geral das perícias', () => {
  const [apt] = buildAptitudeRows({ artes: 6 }, ['artes'], (k) => k, {
    net: -1,
    manual: -1,
    effects: 0,
    direction: 'down',
  });
  assert.equal(apt.shownDie, 4);
});
