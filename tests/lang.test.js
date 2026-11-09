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

// Chaves novas ainda sem tradução para o inglês (a tradução vem em uma versão final, a 0.12.3).
// Ao traduzir, esvazie esta lista: os testes abaixo voltam a exigir paridade total.
const EN_PENDING_PREFIXES = ['DESORDEM.Ficha.Abas.', 'DESORDEM.Ficha.Cab.'];
const isPending = (key) => EN_PENDING_PREFIXES.some((prefix) => key.startsWith(prefix));

test('português e inglês têm exatamente as mesmas chaves', () => {
  const ptKeys = [...pt.keys()].filter((key) => !isPending(key));
  assert.deepEqual([...en.keys()].sort(), ptKeys.sort());
});

test('as pendências de inglês existem de fato e ainda não foram traduzidas', () => {
  for (const prefix of EN_PENDING_PREFIXES) {
    assert.ok(
      [...pt.keys()].some((key) => key.startsWith(prefix)),
      prefix,
    );
    assert.ok(![...en.keys()].some((key) => key.startsWith(prefix)), prefix);
  }
});

test('os marcadores {nome} de cada texto são os mesmos nos dois idiomas', () => {
  const marks = (text) => (text.match(/\{[^}]+\}/g) ?? []).sort();
  for (const [key, value] of pt) {
    if (isPending(key)) continue;
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
