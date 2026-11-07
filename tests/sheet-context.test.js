import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dieOptions,
  buildAttributeRows,
  buildSkillRows,
  buildAptitudeRows,
  buildLesionRows,
  buildFearChoices,
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