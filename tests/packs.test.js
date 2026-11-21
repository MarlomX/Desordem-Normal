import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeEffects } from '../scripts/rolls/ability-effects.js';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dir = path.join(root, 'packs-src', 'habilidades');
const docs = fs
  .readdirSync(dir)
  .filter((file) => file.endsWith('.json'))
  .map((file) => ({ file, doc: JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) }));

// Habilidades de conteúdo pago: não entram no compêndio
const PAID = ['Plano Estratégico', 'Guardião', 'Instinto de Sobrevivência'];

test('compêndio de habilidades: 13 itens com id, chave e nome únicos', () => {
  assert.equal(docs.length, 13);
  const ids = new Set();
  const names = new Set();
  for (const { file, doc } of docs) {
    assert.match(doc._id, /^[A-Za-z0-9]{16}$/, file);
    assert.equal(doc._key, `!items!${doc._id}`, file);
    assert.equal(doc.type, 'habilidade', file);
    assert.ok(doc.name, file);
    ids.add(doc._id);
    names.add(doc.name);
  }
  assert.equal(ids.size, docs.length);
  assert.equal(names.size, docs.length);
});

test('compêndio de habilidades: sem as pagas, sem descrição e com efeitos já normalizados', () => {
  for (const { file, doc } of docs) {
    assert.ok(!PAID.includes(doc.name), file);
    assert.equal(doc.system.descricao, '', file);
    assert.equal(doc.system.automacao, '', file);
    assert.deepEqual(normalizeEffects(doc.system.efeitos), doc.system.efeitos, file);
  }
});

test('compêndio de habilidades: o manifesto aponta para o pacote', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'system.json'), 'utf8'));
  const pack = manifest.packs.find((entry) => entry.name === 'habilidades');
  assert.equal(pack.path, 'packs/habilidades');
  assert.equal(pack.type, 'Item');
});
