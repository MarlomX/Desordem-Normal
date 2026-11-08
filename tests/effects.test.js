import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newEffect,
  addEffect,
  removeEffect,
  updateEffect,
  effectStepMods,
} from '../scripts/rolls/effects.js';

test('addEffect e removeEffect devolvem listas novas', () => {
  const original = [{ ...newEffect(), nome: 'A' }];
  const added = addEffect(original);
  assert.equal(added.length, 2);
  assert.equal(original.length, 1);
  assert.deepEqual(added[1], newEffect());
  assert.deepEqual(removeEffect(added, 0), [newEffect()]);
});

test('updateEffect limita passos, valida o atributo e ignora campos desconhecidos', () => {
  const list = [newEffect()];
  const next = updateEffect(list, 0, { nome: 'Tônico', atributo: 'fisico', passos: 9, x: 1 });
  assert.equal(next[0].nome, 'Tônico');
  assert.equal(next[0].atributo, 'fisico');
  assert.equal(next[0].passos, 3);
  assert.equal('x' in next[0], false);
  assert.equal(updateEffect(list, 0, { passos: -8 })[0].passos, -3);
  assert.equal(updateEffect(list, 0, { passos: 'abc' })[0].passos, 0);
  assert.equal(updateEffect(list, 0, { atributo: 'forca' })[0].atributo, '');
  assert.deepEqual(updateEffect(list, 3, { nome: 'Z' }), list);
});

test('effectStepMods devolve só os efeitos do atributo do teste', () => {
  const effects = [
    { ...newEffect(), atributo: 'fisico', passos: 1 },
    { ...newEffect(), atributo: 'mente', passos: -1 },
    { ...newEffect(), atributo: 'fisico', passos: 0 },
    { ...newEffect(), nome: 'só texto' },
  ];
  assert.deepEqual(effectStepMods(effects, 'fisico'), [{ target: 'attribute', steps: 1 }]);
  assert.deepEqual(effectStepMods(effects, 'mente'), [{ target: 'attribute', steps: -1 }]);
  assert.deepEqual(effectStepMods(effects, 'emocao'), []);
});
