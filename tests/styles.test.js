// Folhas de estilo: os arquivos de system.json existem, os url() apontam para arquivos reais,
// as chaves { } fecham e nenhum seletor se repete entre arquivos (o que mudaria a cascata).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const system = JSON.parse(readFileSync(new URL('system.json', root), 'utf8'));
const read = (path) => readFileSync(new URL(path, root), 'utf8');
/** Tira os comentários e o texto entre aspas, para contar chaves e achar seletores sem ruído. */
const strip = (css) =>
  css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(['"])(?:\\.|(?!\1).)*\1/g, (m) => m[0] + m[0]);

test('cada arquivo de styles existe e não há CSS fora da lista', () => {
  for (const path of system.styles) assert.ok(existsSync(new URL(path, root)), path);
  const listed = new Set(system.styles);
  const onDisk = readdirSync(new URL('styles/', root)).filter((name) => name.endsWith('.css'));
  for (const name of onDisk)
    assert.ok(listed.has(`styles/${name}`), `styles/${name} não está em system.json`);
});

test('os url() das folhas apontam para arquivos que existem', () => {
  for (const path of system.styles) {
    const base = new URL(path, root);
    for (const [, target] of read(path).matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) {
      assert.ok(existsSync(new URL(target, base)), `${path}: ${target}`);
    }
  }
});

test('as chaves abrem e fecham em cada arquivo', () => {
  for (const path of system.styles) {
    let depth = 0;
    for (const char of strip(read(path))) {
      if (char === '{') depth++;
      if (char === '}') depth--;
      assert.ok(depth >= 0, path);
    }
    assert.equal(depth, 0, path);
  }
});

test('nenhum seletor de primeiro nível se repete entre os arquivos', () => {
  const seen = new Map();
  for (const path of system.styles) {
    // Só regras no primeiro nível (fora de @media/@container/@keyframes)
    let depth = 0;
    let buffer = '';
    for (const char of strip(read(path))) {
      if (char === '{') {
        const head = buffer.trim();
        if (depth === 0 && head && !head.startsWith('@')) {
          assert.ok(!seen.has(head), `${head} em ${path} e ${seen.get(head)}`);
          seen.set(head, path);
        }
        depth++;
        buffer = '';
      } else if (char === '}') {
        depth--;
        buffer = '';
      } else if (char === ';' && depth === 0) buffer = '';
      else buffer += char;
    }
  }
  assert.ok(seen.size > 600);
});
