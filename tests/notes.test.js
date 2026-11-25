// Notas da ficha: campos e HTML gravado e enriquecido.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHARACTER_NOTES,
  CREATURE_NOTES,
  buildNoteRows,
  isBlankHtml,
  looksLikeHtml,
  escapeHtml,
  plainTextToHtml,
} from '../scripts/sheets/notes.js';

test('CHARACTER_NOTES: descrição, história e anotações, nessa ordem', () => {
  assert.deepEqual(
    CHARACTER_NOTES.map((n) => n.key),
    ['descricao', 'historia', 'anotacoes'],
  );
  assert.deepEqual(
    CREATURE_NOTES.map((n) => n.key),
    ['estrategia', 'descricao'],
  );
  assert.ok([...CHARACTER_NOTES, ...CREATURE_NOTES].every((n) => n.icon.startsWith('fa-')));
});

test('buildNoteRows monta as linhas com o HTML gravado e o enriquecido', async () => {
  const system = { descricao: '<p>Alta</p>', historia: '', anotacoes: '<p></p>' };
  const fields = { descricao: { name: 'campo-descricao' } };
  const rows = await buildNoteRows(CHARACTER_NOTES, system, {
    t: (key) => `[${key}]`,
    enrich: async (html) => `${html}!`,
    fields,
  });
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], {
    key: 'descricao',
    icon: 'fa-user-pen',
    label: '[DESORDEM.Notas.Descricao]',
    hint: '[DESORDEM.Notas.DescricaoDica]',
    value: '<p>Alta</p>',
    enriched: '<p>Alta</p>!',
    empty: false,
    field: fields.descricao,
  });
  // Vazio não chama o enriquecimento
  assert.equal(rows[1].enriched, '');
  assert.equal(rows[1].empty, true);
  assert.equal(rows[2].empty, true);
});

test('buildNoteRows: campo sem dica e valor que não é texto', async () => {
  const rows = await buildNoteRows(
    CREATURE_NOTES,
    { estrategia: 5 },
    {
      t: (key) => key,
      enrich: (html) => html,
    },
  );
  assert.equal(rows[0].value, '');
  assert.equal(rows[1].hint, '');
  assert.equal(rows[1].field, undefined);
});

test('isBlankHtml: só marcação ou espaços conta como vazio', () => {
  assert.equal(isBlankHtml(''), true);
  assert.equal(isBlankHtml('<p></p><p>&nbsp;</p>'), true);
  assert.equal(isBlankHtml(undefined), true);
  assert.equal(isBlankHtml('<p>oi</p>'), false);
  assert.equal(isBlankHtml('<p><img src="a.png"></p>'), false);
});

test('looksLikeHtml reconhece texto que começa por marcação', () => {
  assert.equal(looksLikeHtml('<p>a</p>'), true);
  assert.equal(looksLikeHtml('  <div>a</div>'), true);
  assert.equal(looksLikeHtml('PV < 5: foge'), false);
  assert.equal(looksLikeHtml(''), false);
});

test('escapeHtml troca os caracteres especiais', () => {
  assert.equal(escapeHtml('a < b & "c" > d'), 'a &lt; b &amp; &quot;c&quot; &gt; d');
});

test('plainTextToHtml: parágrafos e quebras de linha', () => {
  assert.equal(plainTextToHtml('Ataca o mais fraco.'), '<p>Ataca o mais fraco.</p>');
  assert.equal(
    plainTextToHtml('Linha 1\nLinha 2\n\nOutro parágrafo\r\n'),
    '<p>Linha 1<br>Linha 2</p><p>Outro parágrafo</p>',
  );
  assert.equal(plainTextToHtml('PV < 5: foge'), '<p>PV &lt; 5: foge</p>');
  assert.equal(plainTextToHtml('   '), '');
});
