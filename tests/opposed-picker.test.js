// Teste oposto (v0.25.4): janela de resposta com abas, lista e busca.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PICKER_SEARCH_MIN,
  firstTab,
  matchesName,
  pickerModel,
} from '../scripts/opposed/actor-picker.js';

const actor = (name, type) => ({ uuid: `Actor.${name}`, name, img: `${name}.webp`, type });
const ana = actor('Ana', 'personagem');
const bia = actor('Bia', 'personagem');
const sombra = actor('Sombra Faminta', 'criatura');

test('firstTab: o tipo oposto ao de quem propôs, senão o primeiro', () => {
  assert.equal(firstTab(['personagem', 'criatura'], 'personagem'), 'criatura');
  assert.equal(firstTab(['personagem', 'criatura'], 'criatura'), 'personagem');
  assert.equal(firstTab(['personagem'], 'personagem'), 'personagem');
  assert.equal(firstTab(['personagem', 'criatura'], null), 'personagem');
  assert.equal(firstTab([], 'personagem'), null);
});

test('pickerModel: abas na ordem, aba ativa e primeiro ator dela marcado', () => {
  const model = pickerModel([sombra, ana, bia], {
    proposerType: 'personagem',
    label: (type, n) => `${type} (${n})`,
  });
  assert.equal(model.showTabs, true);
  assert.equal(model.showSearch, false);
  assert.equal(model.activeType, 'criatura');
  assert.deepEqual(
    model.tabs.map((tab) => [tab.type, tab.label, tab.active]),
    [
      ['personagem', 'personagem (2)', false],
      ['criatura', 'criatura (1)', true],
    ],
  );
  assert.deepEqual(
    model.tabs[0].actors.map((a) => [a.name, a.checked]),
    [
      ['Ana', false],
      ['Bia', false],
    ],
  );
  assert.equal(model.tabs[1].actors[0].checked, true);
  assert.equal(model.tabs[1].actors[0].search, 'sombra faminta');
});

test('pickerModel: um tipo só, sem abas; busca a partir de 10 atores', () => {
  const one = pickerModel([ana, bia], { proposerType: 'personagem' });
  assert.equal(one.showTabs, false);
  assert.equal(one.activeType, 'personagem');
  assert.equal(one.tabs[0].actors[0].checked, true);
  const many = Array.from({ length: PICKER_SEARCH_MIN }, (_, i) => actor(`P${i}`, 'personagem'));
  assert.equal(pickerModel(many).showSearch, true);
  assert.equal(pickerModel(many.slice(1)).showSearch, false);
});

test('matchesName: sem acento, todas as palavras, vazio mostra todos', () => {
  assert.equal(matchesName('sombra faminta', ''), true);
  assert.equal(matchesName('sombra faminta', 'FAM'), true);
  assert.equal(matchesName('sombra faminta', 'faminta sombra'), true);
  assert.equal(matchesName('joao', 'João'), true);
  assert.equal(matchesName('sombra faminta', 'lobo'), false);
});
