import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeEffects, ownEffects } from '../scripts/rolls/ability-effects.js';

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

test('compêndio de habilidades: sem as pagas, com descrição e com efeitos já normalizados', () => {
  for (const { file, doc } of docs) {
    assert.ok(!PAID.includes(doc.name), file);
    assert.ok(doc.system.descricao.trim().length > 0, file);
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

// ---------- Compêndio «Itens básicos» (v0.21.9) ----------

const itemsDir = path.join(root, 'packs-src', 'itens');
const itemDocs = fs
  .readdirSync(itemsDir)
  .filter((file) => file.endsWith('.json'))
  .map((file) => ({ file, doc: JSON.parse(fs.readFileSync(path.join(itemsDir, file), 'utf8')) }));

test('compêndio de itens: 23 itens com id, chave e nome únicos, de tipos de equipamento', () => {
  assert.equal(itemDocs.length, 23);
  const ids = new Set(itemDocs.map(({ doc }) => doc._id));
  const names = new Set(itemDocs.map(({ doc }) => doc.name));
  assert.equal(ids.size, itemDocs.length);
  assert.equal(names.size, itemDocs.length);
  for (const { file, doc } of itemDocs) {
    assert.match(doc._id, /^[A-Za-z0-9]{16}$/, file);
    assert.equal(doc._key, `!items!${doc._id}`, file);
    assert.ok(['arma', 'armadura', 'item'].includes(doc.type), file);
    assert.ok(doc.system.descricao.trim().length > 0, file);
  }
  // Os ids não colidem com os das habilidades
  for (const { doc } of docs) assert.ok(!ids.has(doc._id));
});

test('compêndio de itens: efeitos normalizados e aceitos pelo tipo de cada item', () => {
  for (const { file, doc } of itemDocs) {
    assert.deepEqual(normalizeEffects(doc.system.efeitos), doc.system.efeitos, file);
    // Todo efeito gravado sobrevive ao filtro de tipos do item (nada fica «sem uso»)
    assert.equal(ownEffects(doc).length, doc.system.efeitos.length, file);
  }
});

test('compêndio de itens: só o Gládio e a Cota de malha são marciais', () => {
  const martial = itemDocs
    .filter(({ doc }) => doc.system.categoria === 'marcial')
    .map(({ doc }) => doc.name)
    .sort();
  assert.deepEqual(martial, ['Cota de malha', 'Gládio']);
});

test('compêndio de itens: o manifesto aponta para o pacote', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'system.json'), 'utf8'));
  const pack = manifest.packs.find((entry) => entry.name === 'itens');
  assert.equal(pack.path, 'packs/itens');
  assert.equal(pack.type, 'Item');
});

test('Segredo do Aço: proficiência marcial e Armadura extra', () => {
  const steel = docs.find(({ doc }) => doc.name === 'Segredo do Aço').doc;
  assert.deepEqual(
    steel.system.efeitos.map((e) => e.tipo),
    ['proficienciaMarcial', 'armaduraExtra'],
  );
});
