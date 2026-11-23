// Aparência do dado de pavor por jogador (v0.25.5).
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_FEAR_STYLE, FEAR_FONT, fearAppearance } from '../scripts/dice3d/fear-dice.js';
import {
  effectiveFearStyle,
  fontOptions,
  normalizeHexColor,
  previewShape,
  previewSides,
  sanitizeFearStyle,
  selectOptions,
  styleOverrides,
} from '../scripts/dice3d/fear-style.js';

test('normalizeHexColor: #rrggbb em minúsculas; #rgb expandido; o resto é null', () => {
  assert.equal(normalizeHexColor('#AABBCC'), '#aabbcc');
  assert.equal(normalizeHexColor(' #abc '), '#aabbcc');
  assert.equal(normalizeHexColor('red'), null);
  assert.equal(normalizeHexColor('#abcd'), null);
  assert.equal(normalizeHexColor(undefined), null);
});

test('sanitizeFearStyle: só campos válidos, com e sem listas', () => {
  const raw = {
    background: '#300',
    foreground: 'azul',
    texture: 'cloudy',
    material: 'metal',
    font: 'Arial',
    extra: 'x',
  };
  assert.deepEqual(sanitizeFearStyle(raw), {
    background: '#330000',
    texture: 'cloudy',
    material: 'metal',
    font: 'Arial',
  });
  assert.deepEqual(sanitizeFearStyle(raw, { textures: ['none'], fonts: [FEAR_FONT] }), {
    background: '#330000',
    material: 'metal',
  });
  assert.deepEqual(sanitizeFearStyle({ material: 'ouro' }), {});
  assert.deepEqual(sanitizeFearStyle(null), {});
  assert.deepEqual(sanitizeFearStyle({ font: 'x'.repeat(81) }), {});
});

test('effectiveFearStyle e styleOverrides: padrão por baixo, só o que difere é guardado', () => {
  assert.deepEqual(effectiveFearStyle({}), DEFAULT_FEAR_STYLE);
  const style = effectiveFearStyle({ edge: '#ff0000', material: 'glass' });
  assert.equal(style.edge, '#ff0000');
  assert.equal(style.background, DEFAULT_FEAR_STYLE.background);
  // `glass` já é o padrão: não vai para a configuração
  assert.deepEqual(styleOverrides(style), { edge: '#ff0000' });
  assert.deepEqual(styleOverrides(DEFAULT_FEAR_STYLE), {});
  // A aparência da rolagem usa a escolha por cima do padrão
  assert.equal(fearAppearance(style).edge, '#ff0000');
});

test('selectOptions: marca a escolhida e não perde uma que saiu da lista', () => {
  const options = [
    { key: 'none', label: 'Nenhuma' },
    { key: 'cloudy', label: 'Nuvens' },
  ];
  assert.deepEqual(
    selectOptions(options, 'cloudy').map((o) => o.selected),
    [false, true],
  );
  const lost = selectOptions(options, 'modulo-x');
  assert.equal(lost[0].key, 'modulo-x');
  assert.equal(lost[0].selected, true);
});

test('fontOptions: a fonte dos números primeiro, sem repetir', () => {
  assert.deepEqual(
    fontOptions(['Arial', FEAR_FONT]).map((o) => o.key),
    [FEAR_FONT, 'Arial'],
  );
});

test('prévia: silhueta por dado e lados válidos', () => {
  assert.equal(previewShape(4), '50,6 95,90 5,90');
  assert.equal(previewShape(99), previewShape(20));
  assert.equal(previewSides('8'), 8);
  assert.equal(previewSides(7), 20);
});
