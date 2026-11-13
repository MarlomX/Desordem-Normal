import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAreaRows,
  buildAttributeRows,
  buildSkillRows,
  shiftDirection,
} from '../scripts/sheets/context.js';

const up = { net: 1, effects: 0, manual: 1, direction: 'up' };
const down = { net: -1, effects: 0, manual: -1, direction: 'down' };

test('shiftDirection compara o dado mostrado com o base', () => {
  assert.equal(shiftDirection(6, 8), 'up');
  assert.equal(shiftDirection(8, 6), 'down');
  assert.equal(shiftDirection(6, 6), '');
  assert.equal(shiftDirection('8', 10), 'up');
});

test('perícias: passo para cima, para baixo e sem passo', () => {
  const labels = { skillLabel: (k) => k, attrLabel: (k) => k };
  const attrs = { luta: 'fisico' };
  const sobe = buildSkillRows({ luta: 8 }, attrs, { ...labels, skillStep: up })[0];
  assert.deepEqual([sobe.shifted, sobe.shiftDir, sobe.shownDie], [true, 'up', 10]);
  const desce = buildSkillRows({ luta: 8 }, attrs, { ...labels, skillStep: down })[0];
  assert.deepEqual([desce.shifted, desce.shiftDir, desce.shownDie], [true, 'down', 6]);
  const sem = buildSkillRows({ luta: 8 }, attrs, labels)[0];
  assert.deepEqual([sem.shifted, sem.shiftDir], [false, '']);
});

test('perícias: o dado do atributo dentro da linha também tem direção', () => {
  const linha = buildSkillRows(
    { luta: 8 },
    { luta: 'fisico' },
    {
      skillLabel: (k) => k,
      attrLabel: (k) => k,
      attributeDice: { fisico: 6 },
      attrStepOf: () => down,
    },
  )[0];
  assert.deepEqual([linha.attrShifted, linha.attrShiftDir, linha.attrShownDie], [true, 'down', 4]);
});

test('dado no limite não se move: não conta como alterado nem tem direção', () => {
  const alto = buildSkillRows(
    { x: 12 },
    { x: 'mente' },
    { skillLabel: (k) => k, attrLabel: (k) => k, skillStep: up },
  )[0];
  assert.deepEqual([alto.shifted, alto.shiftDir], [false, '']);
  const baixo = buildAttributeRows(
    { a: 4 },
    ['a'],
    (k) => k,
    () => down,
  )[0];
  assert.deepEqual([baixo.shifted, baixo.shiftDir], [false, '']);
});

test('atributos e áreas de aptidão e ofício trazem a direção', () => {
  assert.equal(
    buildAttributeRows(
      { a: 6 },
      ['a'],
      (k) => k,
      () => up,
    )[0].shiftDir,
    'up',
  );
  assert.equal(buildAreaRows({ b: 8 }, ['b'], (k) => k, down)[0].shiftDir, 'down');
});
