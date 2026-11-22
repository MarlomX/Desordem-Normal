import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseNumberInput,
  applyRelativeInput,
  limitsFromDataset,
  readPath,
  resolveRelativeFields,
} from '../scripts/sheets/relative-input.js';

test('parseNumberInput entende N, =N, +N e -N (com espaços)', () => {
  assert.deepEqual(parseNumberInput('5'), { mode: 'set', amount: 5 });
  assert.deepEqual(parseNumberInput('=5'), { mode: 'set', amount: 5 });
  assert.deepEqual(parseNumberInput(' + 3 '), { mode: 'add', amount: 3 });
  assert.deepEqual(parseNumberInput('-2'), { mode: 'add', amount: -2 });
  assert.deepEqual(parseNumberInput('−2'), { mode: 'add', amount: -2 });
  assert.deepEqual(parseNumberInput(7), { mode: 'set', amount: 7 });
});

test('parseNumberInput recusa o que não é um formato aceito', () => {
  for (const raw of ['', '  ', 'abc', '10-2', '2.5', '+', '=-3', '*2', null, undefined, 1.5]) {
    assert.equal(parseNumberInput(raw), null, `aceitou ${raw}`);
  }
});

test('applyRelativeInput subtrai e soma sobre o valor gravado', () => {
  assert.equal(applyRelativeInput('-2', 10, { max: 10 }), 8);
  assert.equal(applyRelativeInput('+3', 5, { max: 10 }), 8);
});

test('applyRelativeInput limita a conta entre o mínimo e o máximo', () => {
  assert.equal(applyRelativeInput('+3', 9, { max: 10 }), 10);
  assert.equal(applyRelativeInput('-20', 4, { max: 10 }), 0);
  assert.equal(applyRelativeInput('-3', 2, { min: 1 }), 1);
  // Sem máximo, a soma não tem teto
  assert.equal(applyRelativeInput('+50', 10), 60);
});

test('applyRelativeInput: valor absoluto não tem teto, só o mínimo', () => {
  assert.equal(applyRelativeInput('15', 10, { max: 10 }), 15);
  assert.equal(applyRelativeInput('=0', 10, { max: 10 }), 0);
  assert.equal(applyRelativeInput('=3', 10, { min: 5 }), 5);
});

test('applyRelativeInput acima do máximo: somar não mexe, subtrair funciona', () => {
  assert.equal(applyRelativeInput('+1', 15, { max: 10 }), 15);
  assert.equal(applyRelativeInput('-2', 15, { max: 10 }), 13);
});

test('applyRelativeInput mantém o valor gravado com texto inválido', () => {
  assert.equal(applyRelativeInput('abc', 7, { max: 10 }), 7);
  assert.equal(applyRelativeInput('', 7), 7);
  assert.equal(applyRelativeInput('xyz', undefined), 0);
});

test('limitsFromDataset lê os atributos data-relativo-min e -max', () => {
  assert.deepEqual(limitsFromDataset({}), { min: 0 });
  assert.deepEqual(limitsFromDataset({ relativoMax: '10' }), { min: 0, max: 10 });
  assert.deepEqual(limitsFromDataset({ relativoMin: '1', relativoMax: '' }), { min: 1 });
  assert.deepEqual(limitsFromDataset({ relativoMax: 'abc' }), { min: 0 });
});

test('readPath segue caminhos com pontos', () => {
  const source = { system: { pv: { value: 7 } } };
  assert.equal(readPath(source, 'system.pv.value'), 7);
  assert.equal(readPath(source, 'system.pd.value'), undefined);
});

/** Campo falso com o mínimo que `resolveRelativeFields` usa. */
const fakeInput = (name, value, dataset = {}) => ({
  name,
  value,
  dataset: { relativo: '', ...dataset },
});

test('resolveRelativeFields troca o texto pelo valor final e o escreve no campo', () => {
  const pv = fakeInput('system.pv.value', '-2', { relativoMax: '10' });
  const base = fakeInput('system.pv.base', '10');
  const pd = fakeInput('system.pd.value', '+1', { relativoMax: '6' });
  const form = { querySelectorAll: () => [pv, base, pd] };
  const values = {
    'system.pv.value': '-2',
    'system.pv.base': '10',
    'system.pd.value': '+1',
    name: 'Ana',
  };
  const source = { system: { pv: { value: 10, base: 10 }, pd: { value: 6 } } };
  resolveRelativeFields(form, values, source);
  assert.deepEqual(values, {
    'system.pv.value': 8,
    'system.pv.base': 10,
    'system.pd.value': 6,
    name: 'Ana',
  });
  assert.equal(pv.value, '8');
  assert.equal(pd.value, '6');
});

test('resolveRelativeFields ignora campos fora do formulário (desabilitados)', () => {
  const pv = fakeInput('system.pv.value', '-2');
  const form = { querySelectorAll: () => [pv] };
  const values = {};
  resolveRelativeFields(form, values, { system: { pv: { value: 10 } } });
  assert.deepEqual(values, {});
  assert.equal(pv.value, '-2');
});
