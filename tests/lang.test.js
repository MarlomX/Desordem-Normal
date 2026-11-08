import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const load = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));

function flatten(object, prefix = '') {
  return Object.entries(object).flatMap(([key, value]) =>
    typeof value === 'object' ? flatten(value, `${prefix}${key}.`) : [[`${prefix}${key}`, value]],
  );
}

const pt = new Map(flatten(load('lang/pt-BR.json')));
const en = new Map(flatten(load('lang/en.json')));

test('português e inglês têm exatamente as mesmas chaves', () => {
  assert.deepEqual([...en.keys()].sort(), [...pt.keys()].sort());
});

test('os marcadores {nome} de cada texto são os mesmos nos dois idiomas', () => {
  const marks = (text) => (text.match(/\{[^}]+\}/g) ?? []).sort();
  for (const [key, value] of pt) {
    assert.deepEqual(marks(en.get(key)), marks(value), key);
  }
});

test('as chaves fixas usadas nos templates existem no idioma', () => {
  const missing = [];
  for (const dir of ['templates/actor', 'templates/chat', 'templates/item']) {
    for (const file of readdirSync(new URL(`../${dir}`, import.meta.url))) {
      const text = readFileSync(new URL(`../${dir}/${file}`, import.meta.url), 'utf8');
      for (const [, key] of text.matchAll(/localize "(DESORDEM\.[^"]+)"/g)) {
        if (!pt.has(key)) missing.push(`${file}: ${key}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});
