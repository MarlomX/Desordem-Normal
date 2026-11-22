import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { itemEffectTypes, normalizeEffects, ownEffects } from '../scripts/rolls/ability-effects.js';
import { presetOf } from '../scripts/rolls/condition-tables.js';

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
const packDocs = fs
  .readdirSync(itemsDir)
  .filter((file) => file.endsWith('.json'))
  .map((file) => ({ file, doc: JSON.parse(fs.readFileSync(path.join(itemsDir, file), 'utf8')) }));
// Pastas do compêndio (documentos Folder) e os itens
const folderDocs = packDocs.filter(({ doc }) => doc._key.startsWith('!folders!'));
const itemDocs = packDocs.filter(({ doc }) => doc._key.startsWith('!items!'));

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

test('compêndio de itens: três pastas, e cada item na pasta do seu tipo', () => {
  assert.equal(packDocs.length, folderDocs.length + itemDocs.length);
  const folders = new Map(folderDocs.map(({ doc }) => [doc._id, doc]));
  assert.deepEqual(
    [...folders.values()].map((folder) => folder.name),
    ['Armaduras e escudos', 'Armas', 'Itens gerais'],
  );
  for (const { doc } of folderDocs) {
    assert.equal(doc._key, `!folders!${doc._id}`);
    assert.equal(doc.type, 'Item');
  }
  const expected = { arma: 'Armas', armadura: 'Armaduras e escudos', item: 'Itens gerais' };
  for (const { file, doc } of itemDocs) {
    assert.equal(folders.get(doc.folder)?.name, expected[doc.type], file);
  }
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

// ---------- Compêndio «Efeitos básicos» (v0.22.3) ----------

const effectsDir = path.join(root, 'packs-src', 'efeitos');
const effectFiles = fs
  .readdirSync(effectsDir)
  .filter((file) => file.endsWith('.json'))
  .map((file) => ({ file, doc: JSON.parse(fs.readFileSync(path.join(effectsDir, file), 'utf8')) }));
const effectFolders = effectFiles.filter(({ doc }) => doc._key.startsWith('!folders!'));
const effectItems = effectFiles.filter(({ doc }) => doc._key.startsWith('!items!'));

test('compêndio de efeitos: as fontes gravadas são as que o código monta', async () => {
  const { buildEffectSources } = await import('../tools/efeitos-fontes.mjs');
  const lang = JSON.parse(fs.readFileSync(path.join(root, 'lang', 'pt-BR.json'), 'utf8'));
  const built = buildEffectSources(lang);
  // Mesmo conjunto de arquivos e o mesmo conteúdo (rode `node tools/gerar-efeitos.mjs` se mudar)
  assert.deepEqual(built.map((s) => s.file).sort(), effectFiles.map((s) => s.file).sort());
  for (const { file, doc } of built) {
    assert.deepEqual(effectFiles.find((s) => s.file === file).doc, doc, file);
  }
});

test('compêndio de efeitos: 28 efeitos em 5 pastas, ids, nomes e chaves únicos', () => {
  assert.deepEqual(effectFolders.map(({ doc }) => doc.name).sort(), [
    'Condições de combate',
    'Falha crítica',
    'Lesões',
    'Saúde',
    'Traumas',
  ]);
  assert.equal(effectItems.length, 28);
  const folderIds = new Set(effectFolders.map(({ doc }) => doc._id));
  for (const key of ['_id', 'name']) {
    assert.equal(new Set(effectItems.map(({ doc }) => doc[key])).size, effectItems.length, key);
  }
  assert.equal(new Set(effectItems.map(({ doc }) => doc.system.chave)).size, effectItems.length);
  for (const { file, doc } of [...effectFolders, ...effectItems]) {
    assert.match(doc._id, /^[A-Za-z0-9]{16}$/, file);
  }
  for (const { file, doc } of effectItems) {
    assert.equal(doc.type, 'efeito', file);
    assert.ok(folderIds.has(doc.folder), file);
    assert.ok(doc.system.descricao.trim().length > 0, file);
    assert.ok(['cena', 'permanente', 'manual'].includes(doc.system.duracao), file);
    // Toda chave é de um efeito pronto (a cópia traduz o texto por ela)
    assert.ok(presetOf(doc.system.chave), file);
    assert.deepEqual(normalizeEffects(doc.system.efeitos), doc.system.efeitos, file);
    assert.ok(
      doc.system.efeitos.every((e) => itemEffectTypes('efeito').includes(e.tipo)),
      file,
    );
  }
});

test('compêndio de efeitos: cada pasta com o seu grupo de efeitos', () => {
  const folderName = new Map(effectFolders.map(({ doc }) => [doc._id, doc.name]));
  const byFolder = {};
  for (const { doc } of effectItems) {
    const name = folderName.get(doc.folder);
    (byFolder[name] ??= []).push(doc.system.chave.split(':')[0]);
  }
  assert.equal(byFolder['Condições de combate'].length, 10);
  assert.deepEqual(byFolder['Saúde'], ['lesao']);
  assert.equal(byFolder['Lesões'].length, 9);
  assert.equal(byFolder['Traumas'].length, 5);
  assert.equal(byFolder['Falha crítica'].length, 3);
  assert.ok(byFolder['Condições de combate'].every((k) => k === 'cond'));
  assert.ok(byFolder['Traumas'].every((k) => k === 'trauma'));
  assert.ok(byFolder['Falha crítica'].every((k) => k === 'falha'));
});

test('compêndio de efeitos: o manifesto aponta para o pacote', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'system.json'), 'utf8'));
  const pack = manifest.packs.find((entry) => entry.name === 'efeitos');
  assert.equal(pack.path, 'packs/efeitos');
  assert.equal(pack.type, 'Item');
  assert.ok(manifest.documentTypes.Item.efeito);
});

// ---------- Compêndio «Macros do mestre» (v0.23.3) ----------

const macrosDir = path.join(root, 'packs-src', 'macros');
const macroDocs = fs
  .readdirSync(macrosDir)
  .filter((file) => file.endsWith('.json'))
  .map((file) => ({ file, doc: JSON.parse(fs.readFileSync(path.join(macrosDir, file), 'utf8')) }));

test('compêndio de macros: a macro «Nova cena» chama o sistema', () => {
  assert.equal(macroDocs.length, 1);
  const [{ file, doc }] = macroDocs;
  assert.match(doc._id, /^[A-Za-z0-9]{16}$/, file);
  assert.equal(doc._key, `!macros!${doc._id}`, file);
  assert.equal(doc.name, 'Nova cena');
  assert.equal(doc.type, 'script');
  // A lógica fica no código do sistema (atualiza junto); a macro só chama a função
  assert.match(doc.command, /game\.desordem\.newSceneForAll\(\)/);
});

test('compêndio de macros: o manifesto aponta para o pacote, escondido dos jogadores', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'system.json'), 'utf8'));
  const pack = manifest.packs.find((entry) => entry.name === 'macros');
  assert.equal(pack.path, 'packs/macros');
  assert.equal(pack.type, 'Macro');
  assert.equal(pack.ownership.PLAYER, 'NONE');
});
