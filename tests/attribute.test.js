import test from 'node:test';
import assert from 'node:assert/strict';
import { PERICIAS, APTIDOES, OFICIOS } from '../scripts/config.js';
import {
  OVERRIDABLE_KEYS,
  attributeChoiceUpdate,
  defaultAttribute,
  resolveSkillAttribute,
  storedAttribute,
  validAttribute,
} from '../scripts/rolls/attribute.js';
import {
  addRowAttributes,
  buildAttributeFields,
  buildExtraRows,
  buildSkillRows,
} from '../scripts/sheets/context.js';

const system = (extra = {}) => ({
  atributosPericias: {},
  aptidoesExtras: [{ id: 'a1', nome: 'Heráldica', dado: 6, atributo: '' }],
  oficiosExtras: [{ id: 'o1', nome: 'Couraçaria', dado: 8, atributo: 'fisico' }],
  ...extra,
});

test('OVERRIDABLE_KEYS reúne perícias, aptidões e ofícios do livro, sem repetir chave', () => {
  assert.equal(
    OVERRIDABLE_KEYS.length,
    Object.keys(PERICIAS).length + APTIDOES.length + OFICIOS.length,
  );
  assert.equal(new Set(OVERRIDABLE_KEYS).size, OVERRIDABLE_KEYS.length);
});

test('atributo padrão: o da perícia; aptidões, ofícios e extras usam Mente', () => {
  assert.equal(defaultAttribute('luta'), 'fisico');
  assert.equal(defaultAttribute('persuasao'), 'emocao');
  for (const key of [...APTIDOES, ...OFICIOS, 'aptidao:a1', 'oficio:o1']) {
    assert.equal(defaultAttribute(key), 'mente', key);
  }
});

test('validAttribute só aceita fisico, mente e emocao', () => {
  assert.equal(validAttribute('mente'), 'mente');
  for (const ruim of ['', 'forca', null, undefined, 3, 'MENTE'])
    assert.equal(validAttribute(ruim), '');
});

test('resolveSkillAttribute: explícito > escolha da ficha > padrão', () => {
  const s = system({ atributosPericias: { luta: 'mente', folclore: 'emocao' } });
  assert.equal(resolveSkillAttribute(s, 'luta'), 'mente'); // escolha da ficha
  assert.equal(resolveSkillAttribute(s, 'luta', 'emocao'), 'emocao'); // explícito vence
  assert.equal(resolveSkillAttribute(s, 'luta', 'xx'), 'mente'); // explícito inválido é ignorado
  assert.equal(resolveSkillAttribute(s, 'pontaria'), 'fisico'); // padrão
  assert.equal(resolveSkillAttribute(s, 'folclore'), 'emocao');
  assert.equal(resolveSkillAttribute(s, 'erudicao'), 'mente');
});

test('resolveSkillAttribute com áreas extras e dados antigos sem os campos novos', () => {
  const s = system();
  assert.equal(resolveSkillAttribute(s, 'oficio:o1'), 'fisico');
  assert.equal(resolveSkillAttribute(s, 'aptidao:a1'), 'mente');
  assert.equal(resolveSkillAttribute(s, 'aptidao:sumiu'), 'mente');
  assert.equal(resolveSkillAttribute({}, 'luta'), 'fisico');
  assert.equal(storedAttribute({}, 'luta'), '');
  assert.equal(storedAttribute(system({ atributosPericias: { luta: 'zzz' } }), 'luta'), '');
});

test('attributeChoiceUpdate: perícia do livro guarda em atributosPericias', () => {
  assert.deepEqual(attributeChoiceUpdate(system(), 'luta', 'mente'), {
    path: 'atributosPericias.luta',
    value: 'mente',
  });
  assert.deepEqual(attributeChoiceUpdate(system(), 'erudicao', 'emocao'), {
    path: 'atributosPericias.erudicao',
    value: 'emocao',
  });
});

test('attributeChoiceUpdate: escolher o padrão (ou vazio) volta ao padrão', () => {
  assert.equal(attributeChoiceUpdate(system(), 'luta', 'fisico').value, '');
  assert.equal(attributeChoiceUpdate(system(), 'luta', '').value, '');
  assert.equal(attributeChoiceUpdate(system(), 'folclore', 'mente').value, '');
});

test('attributeChoiceUpdate: área extra regrava a lista com o novo atributo', () => {
  const s = system();
  const change = attributeChoiceUpdate(s, 'aptidao:a1', 'emocao');
  assert.equal(change.path, 'aptidoesExtras');
  assert.deepEqual(change.value, [{ id: 'a1', nome: 'Heráldica', dado: 6, atributo: 'emocao' }]);
  assert.equal(s.aptidoesExtras[0].atributo, ''); // a lista original não muda
  assert.equal(attributeChoiceUpdate(s, 'oficio:o1', 'mente').value[0].atributo, ''); // padrão
});

test('attributeChoiceUpdate rejeita chave, atributo ou extra inválidos', () => {
  assert.equal(attributeChoiceUpdate(system(), 'inexistente', 'mente'), null);
  assert.equal(attributeChoiceUpdate(system(), 'luta', 'forca'), null);
  assert.equal(attributeChoiceUpdate(system(), 'oficio:nada', 'mente'), null);
  assert.equal(attributeChoiceUpdate(system(), 'aptidao:', 'mente'), null);
});

const attrLabel = (k) => ({ fisico: 'Físico', mente: 'Mente', emocao: 'Emoção' })[k];
const defaultLabel = (k) => `Padrão (${attrLabel(k)})`;

test('buildAttributeFields: padrão selecionado, atributo alterado e dado do atributo', () => {
  const padrao = buildAttributeFields({
    attrKey: 'fisico',
    defaultKey: 'fisico',
    attrLabel,
    defaultLabel,
    attributeDice: { fisico: 8, mente: 6, emocao: 4 },
  });
  assert.equal(padrao.attrOverridden, false);
  assert.deepEqual(
    padrao.attrOptions.map((o) => [o.value, o.label, o.selected]),
    [
      ['', 'Padrão (Físico)', true],
      ['fisico', 'Físico', false],
      ['mente', 'Mente', false],
      ['emocao', 'Emoção', false],
    ],
  );
  assert.equal(padrao.attrShownDie, 8);

  const alterado = buildAttributeFields({
    attrKey: 'emocao',
    defaultKey: 'fisico',
    attrLabel,
    defaultLabel,
    attributeDice: { fisico: 8, mente: 6, emocao: 4 },
  });
  assert.equal(alterado.attrOverridden, true);
  assert.equal(alterado.attrDefaultLabel, 'Físico');
  assert.equal(alterado.attrShownDie, 4);
  assert.deepEqual(
    alterado.attrOptions.filter((o) => o.selected).map((o) => o.value),
    ['emocao'],
  );
});

test('buildSkillRows usa o atributo escolhido: rótulo, dado e busca', () => {
  const dice = { fisico: 10, mente: 6, emocao: 8 };
  const base = { skillLabel: (k) => k, attrLabel, attributeDice: dice };
  const [luta] = buildSkillRows(
    { luta: 8 },
    { luta: 'fisico' },
    { ...base, attrChoices: { luta: 'mente' } },
  );
  assert.deepEqual(
    [luta.attrKey, luta.attrLabel, luta.attrShownDie, luta.attrOverridden],
    ['mente', 'Mente', 6, true],
  );
  assert.equal(luta.search.includes('mente'), true);
  const [sem] = buildSkillRows({ luta: 8 }, { luta: 'fisico' }, base);
  assert.deepEqual([sem.attrKey, sem.attrShownDie, sem.attrOverridden], ['fisico', 10, false]);
  const [ruim] = buildSkillRows(
    { luta: 8 },
    { luta: 'fisico' },
    { ...base, attrChoices: { luta: 'zzz' } },
  );
  assert.equal(ruim.attrKey, 'fisico');
});

test('addRowAttributes acrescenta o atributo às áreas, com Mente como padrão', () => {
  const rows = buildExtraRows(
    [
      { id: 'a', nome: 'A', dado: 6, atributo: '' },
      { id: 'b', nome: 'B', dado: 8, atributo: 'fisico' },
    ],
    'oficio',
    { emptyLabel: 'x' },
  );
  assert.equal(rows[1].atributo, 'fisico');
  const com = addRowAttributes(rows, {
    chosenOf: (row) => row.atributo,
    attrLabel,
    defaultLabel,
    attributeDice: { fisico: 10, mente: 6, emocao: 8 },
  });
  assert.deepEqual(
    com.map((r) => [r.attrKey, r.attrShownDie, r.attrOverridden]),
    [
      ['mente', 6, false],
      ['fisico', 10, true],
    ],
  );
  assert.equal(com[0].key, 'oficio:a'); // os campos originais continuam
});
