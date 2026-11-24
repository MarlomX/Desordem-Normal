/**
 * Todos os módulos de `scripts/` carregam com o Foundry de mentira (v0.28.2): nenhum depende de
 * algo que só existe no navegador já na hora do import. É a base dos testes dos adaptadores.
 */
import './foundry-stub.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';

function scriptsIn(dir) {
  return readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true }).flatMap(
    (entry) => {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) return scriptsIn(path);
      return entry.name.endsWith('.js') && !entry.name.endsWith('.test.js') ? [path] : [];
    },
  );
}

test('todos os módulos de scripts/ carregam (com o Foundry de mentira)', async () => {
  const failed = [];
  for (const path of scriptsIn('scripts')) {
    try {
      await import(`../${path}`);
    } catch (error) {
      failed.push(`${path}: ${error.message}`);
    }
  }
  assert.deepEqual(failed, []);
});
