import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTest } from '../scripts/rolls/test.js';
import { buildChatContext } from '../scripts/rolls/presenter.js';
import { buildDieFace, dieFaceHelper, sanitizeDieValue } from '../scripts/rolls/die-face.js';
import { fixedRng } from './helpers.js';

const run = (opts, values) => resolveTest({ ...opts, rng: fixedRng(values) });

test('a face usa as classes da ficha e mostra o número rolado', () => {
  const html = buildDieFace({ sides: 8, value: 5 });
  assert.match(html, /class="desordem-forma desordem-d-8"/);
  assert.match(html, /<span class="desordem-forma__valor">5<\/span>/);
  assert.match(html, /aria-label="d8 = 5"/);
});

test('sem número, a face mostra os lados; lados sem desenho usam o d0', () => {
  assert.match(buildDieFace({ sides: 12 }), />12<\/span><\/span>$/);
  const neutro = buildDieFace({ sides: 7, value: 3 });
  assert.match(neutro, /desordem-d-0/);
  assert.match(neutro, /aria-label="3"/);
  assert.match(buildDieFace(), /desordem-d-0/);
});

test('tamanho grande e mini acrescentam a classe; tamanho desconhecido é o padrão', () => {
  assert.match(buildDieFace({ sides: 6, value: 1, size: 'grande' }), /desordem-forma--grande/);
  assert.match(buildDieFace({ sides: 6, size: 'mini' }), /desordem-forma--mini/);
  assert.doesNotMatch(buildDieFace({ sides: 6, value: 1, size: 'enorme' }), /--(grande|mini)/);
  // na miniatura só o tipo importa para quem usa leitor de tela
  assert.match(buildDieFace({ sides: 6, size: 'mini' }), /aria-label="d6"/);
});

test('o brilho de passo sobe (azul) ou desce (vermelho) e ignora valores inválidos', () => {
  assert.match(buildDieFace({ sides: 8, step: 'up' }), /is-passo is-passo--up/);
  assert.match(buildDieFace({ sides: 6, step: 'down' }), /is-passo is-passo--down/);
  assert.doesNotMatch(buildDieFace({ sides: 6, step: 'x" onclick="' }), /is-passo|onclick/);
});

test('só dígitos entram no HTML (sem injeção)', () => {
  assert.equal(sanitizeDieValue('<b>12</b>'), '12');
  assert.equal(sanitizeDieValue(123456), '123');
  assert.equal(sanitizeDieValue(null), '');
  const html = buildDieFace({ sides: 6, value: '<script>7</script>' });
  assert.doesNotMatch(html, /<script/);
  assert.match(html, />7<\/span><\/span>$/);
});

test('o helper do template aceita o objeto de opções do Handlebars no fim', () => {
  const options = { hash: {}, data: {} };
  assert.equal(
    dieFaceHelper(6, 4, 'grande', options),
    buildDieFace({ sides: 6, value: 4, size: 'grande' }),
  );
  assert.equal(dieFaceHelper(6, options), buildDieFace({ sides: 6 }));
});

test('os dados do crítico (iguais, 6 ou mais) ficam marcados no cartão', () => {
  const ctx = buildChatContext(run({ attrDie: 8, skillDie: 8, extraDice: [8] }, [6, 3, 6]));
  assert.equal(ctx.outcomeClass, 'sucesso-critico');
  assert.deepEqual(
    ctx.dice.map((d) => d.critical),
    [true, false, true],
  );
  assert.equal(
    ctx.dice.every((d) => d.fumble === false),
    true,
  );
});

test('sem crítico, nenhum dado é marcado; iguais abaixo de 6 não contam', () => {
  const ctx = buildChatContext(run({ attrDie: 8, skillDie: 8 }, [4, 4]));
  assert.equal(
    ctx.dice.some((d) => d.critical || d.fumble),
    false,
  );
});

test('a falha crítica marca os dados em 1', () => {
  const ctx = buildChatContext(run({ attrDie: 6, skillDie: 6 }, [1, 1]));
  assert.deepEqual(
    ctx.dice.map((d) => [d.fumble, d.critical]),
    [
      [true, false],
      [true, false],
    ],
  );
});

test('dados devorados pelo pavor não entram no destaque do crítico', () => {
  // dados 6 e 6 formariam crítico, mas o pavor (5) devora o que for menor; aqui nenhum é devorado
  const livre = buildChatContext(run({ attrDie: 8, skillDie: 8, fearDie: 6 }, [6, 6, 5]));
  assert.deepEqual(
    livre.dice.map((d) => [d.annulled, d.critical]),
    [
      [false, true],
      [false, true],
    ],
  );
  // todos devorados: falha crítica pelo pavor, sem dados em destaque
  const devorado = buildChatContext(run({ attrDie: 6, skillDie: 6, fearDie: 6 }, [2, 3, 6]));
  assert.equal(devorado.devouredAll, true);
  assert.deepEqual(
    devorado.dice.map((d) => [d.annulled, d.fumble, d.critical]),
    [
      [true, false, false],
      [true, false, false],
    ],
  );
});

test('os ajustes de passo dizem se o dado subiu ou desceu', () => {
  const subiu = buildChatContext(
    run({ attrDie: 6, skillDie: 8, stepMods: [{ target: 'attribute', steps: 1 }] }, [3, 3]),
    { attrLabel: 'Físico', skillLabel: 'Luta' },
  );
  assert.deepEqual(subiu.adjustments, [{ name: 'Físico', from: 6, to: 8, direction: 'up' }]);
});

test('o espaço reservado do dado de pavor vira o SVG (o chat remove SVG vindo do template)', async () => {
  const { fearSlotMarkup, FEAR_SLOT_ATTR } = await import('../scripts/rolls/fear-chat.js');
  assert.equal(FEAR_SLOT_ATTR, 'data-dado-pavor');
  const svg = fearSlotMarkup('6', '2'); // os atributos data-* chegam como texto
  assert.match(svg, /^<svg/);
  assert.match(svg, /desordem-dado-pavor--grande/);
  // lados sem desenho: devolve vazio, e o número de reserva do template fica à mostra
  assert.equal(fearSlotMarkup('7', '2'), '');
  assert.equal(fearSlotMarkup(undefined, '2'), '');
  // só dígitos chegam ao SVG
  assert.doesNotMatch(fearSlotMarkup('6', '<b>3</b>'), /<b>/);
});
