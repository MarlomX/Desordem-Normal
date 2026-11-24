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

/** Todos os arquivos de uma pasta e das subpastas (caminhos relativos à raiz do repositório). */
function filesIn(dir, ext) {
  return readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true }).flatMap(
    (entry) => {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) return filesIn(path, ext);
      return entry.name.endsWith(ext) ? [path] : [];
    },
  );
}

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('as chaves fixas usadas nos templates existem no idioma', () => {
  // Todas as pastas de templates (desde a v0.28.0 também partials/ e settings/)
  const missing = [];
  for (const file of filesIn('templates', '.hbs')) {
    for (const [, key] of read(file).matchAll(/localize "(DESORDEM\.[^"]+)"/g)) {
      if (!pt.has(key)) missing.push(`${file}: ${key}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('as chaves fixas escritas nos scripts existem no idioma', () => {
  // Uma chave escrita por inteiro entre aspas ('DESORDEM.X.Y'). Pode ser também o começo de um
  // grupo de chaves montadas no código (ex.: 'DESORDEM.Lesoes' + chave + '.Nome'): vale se alguma
  // chave do idioma começa por ela.
  const groups = new Set();
  for (const key of pt.keys()) {
    const parts = key.split('.');
    for (let i = 1; i < parts.length; i++) groups.add(parts.slice(0, i).join('.'));
  }
  const missing = [];
  for (const file of filesIn('scripts', '.js')) {
    for (const [, key] of read(file).matchAll(
      /['"`](DESORDEM\.[A-Za-z0-9_.]*[A-Za-z0-9_])['"`]/g,
    )) {
      if (!pt.has(key) && !groups.has(key)) missing.push(`${file}: ${key}`);
    }
  }
  assert.deepEqual(missing, []);
});
