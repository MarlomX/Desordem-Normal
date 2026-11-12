import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FEAR_NUMBER_FONT_SIZE,
  buildFearDie,
  fearDieHelper,
  fearDieSides,
  sanitizeFearValue,
} from '../scripts/sheets/dado-pavor.js';

const texts = (svg) => [...svg.matchAll(/<text [^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);

test('existe um desenho de pavor para d4, d6, d8, d10, d12 e d20', () => {
  assert.deepEqual(fearDieSides(), [4, 6, 8, 10, 12, 20]);
});

test('cada dado tem 9 camadas de número, todas com o mesmo valor (padrão: os lados)', () => {
  for (const sides of fearDieSides()) {
    for (const size of ['grande', 'pequeno']) {
      const layers = texts(buildFearDie({ sides, size }));
      assert.equal(layers.length, 9, `d${sides} ${size}`);
      assert.deepEqual([...new Set(layers)], [String(sides)]);
    }
  }
});

test('o valor trocado vale em todas as camadas, sem sobrar o número antigo', () => {
  const svg = buildFearDie({ sides: 6, value: 12 });
  assert.deepEqual([...new Set(texts(svg))], ['12']);
  assert.equal(/>6</.test(svg), false);
});

test('só dígitos entram no SVG (nada de HTML)', () => {
  assert.equal(sanitizeFearValue('<script>alert(1)</script>'), '1');
  assert.equal(sanitizeFearValue('abc'), '');
  assert.equal(sanitizeFearValue(null), '');
  assert.equal(sanitizeFearValue(12345), '123');
  const svg = buildFearDie({ sides: 8, value: '<img src=x onerror=1>' });
  assert.equal(svg.includes('<img'), false);
  assert.deepEqual([...new Set(texts(svg))], ['1']);
  assert.deepEqual([...new Set(texts(buildFearDie({ sides: 8, value: 'abc' })))], ['8']);
});

test('dado sem desenho devolve texto vazio', () => {
  assert.equal(buildFearDie({ sides: 7 }), '');
  assert.equal(buildFearDie({ sides: 0 }), '');
  assert.equal(buildFearDie(), '');
});

test('tamanho inválido cai no grande e a classe acompanha a versão usada', () => {
  assert.match(buildFearDie({ sides: 6, size: 'enorme' }), /desordem-dado-pavor--grande/);
  assert.match(buildFearDie({ sides: 6, size: 'pequeno' }), /desordem-dado-pavor--pequeno/);
});

test('o pequeno usa um único tamanho de número para um e dois dígitos', () => {
  const sizeOf = (svg) => [...new Set([...svg.matchAll(/font-size:([\d.]+)px/g)].map((m) => m[1]))];
  const one = sizeOf(buildFearDie({ sides: 6, size: 'pequeno' }));
  const two = sizeOf(buildFearDie({ sides: 12, size: 'pequeno' }));
  assert.deepEqual(one, [String(FEAR_NUMBER_FONT_SIZE.pequeno)]);
  assert.deepEqual(two, one);
});

test('a fonte vem do CSS, não de atributo no texto', () => {
  assert.equal(buildFearDie({ sides: 6 }).includes('font-family'), false);
});

test('o SVG tem acessibilidade e não tem ids (pode repetir na página)', () => {
  const svg = buildFearDie({ sides: 10 });
  assert.match(svg, /role="img"/);
  assert.match(svg, /aria-label="d10"/);
  assert.equal(/\sid="/.test(svg), false);
});

test('o viewBox contém todo o desenho, inclusive a largura do neon', () => {
  for (const sides of fearDieSides()) {
    for (const size of ['grande', 'pequeno']) {
      const svg = buildFearDie({ sides, size });
      const [vx, vy, vw, vh] = svg
        .match(/viewBox="([^"]+)"/)[1]
        .split(' ')
        .map(Number);
      const widths = [...svg.matchAll(/stroke-width="([\d.]+)"/g)].map((m) => Number(m[1]));
      const pad = Math.max(...widths) / 2;
      const coords = [...svg.matchAll(/ d="([^"]+)"/g)].flatMap((m) =>
        m[1].match(/-?\d+(?:\.\d+)?/g).map(Number),
      );
      for (let i = 0; i < coords.length; i += 2) {
        const [x, y] = [coords[i], coords[i + 1]];
        assert.ok(x - pad >= vx - 0.01 && x + pad <= vx + vw + 0.01, `d${sides} ${size} x=${x}`);
        assert.ok(y - pad >= vy - 0.01 && y + pad <= vy + vh + 0.01, `d${sides} ${size} y=${y}`);
      }
    }
  }
});

test('o helper ignora o objeto de opções do Handlebars', () => {
  const options = { hash: {}, data: {} };
  assert.equal(fearDieHelper(8, options), buildFearDie({ sides: 8 }));
  assert.equal(fearDieHelper(8, undefined, options), buildFearDie({ sides: 8 }));
  assert.equal(
    fearDieHelper(8, 5, 'pequeno'),
    buildFearDie({ sides: 8, value: 5, size: 'pequeno' }),
  );
});
