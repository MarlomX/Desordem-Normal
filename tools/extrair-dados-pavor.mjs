/**
 * Gera scripts/data/dados-pavor/dN.js a partir do SVG dos dados de pavor com neon.
 * Uso: node tools/extrair-dados-pavor.mjs caminho/do/fear_set_neon.svg
 *
 * Para cada dado e tamanho (grande 80px, pequeno 30px) guarda:
 *  - viewBox: quadrado de lado fixo (100 no grande, 36 no pequeno) centrado no dado, para que
 *    todos os dados do mesmo tamanho tenham a mesma escala;
 *  - corpo: tudo que não é número (contorno, neon das arestas, rachaduras), sem comentários;
 *  - numero: posição (x, y) do número;
 *  - camadas: o estilo das 9 camadas do número (halo escuro, 7 de brilho, preenchimento), em ordem.
 * O texto do número e o tamanho da fonte são decididos por `buildFearDie`, não ficam nos dados.
 * Este script roda só quando o SVG de origem muda; ele não vai no release.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SIDES = [4, 6, 8, 10, 12, 20];
const VIEWBOX = { grande: 100, pequeno: 36 };
const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '../scripts/data/dados-pavor');

const source = readFileSync(process.argv[2], 'utf8');
const blocks = new Map();
for (const part of source.split('<!-- ===== ').slice(1)) {
  const title = part.slice(0, part.indexOf(' ====='));
  const match = title.match(/^D(\d+) DE PAVOR (GRANDE|PEQUENO)/);
  if (match) blocks.set(`${match[1]}-${match[2].toLowerCase()}`, part);
}

function numbers(text) {
  return [...text.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
}

function extract(block) {
  const firstText = block.indexOf('<text');
  const corpo = block
    .slice(block.indexOf('-->\n') + 4, firstText)
    .replace(/<!--.*?-->/gs, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('');
  const texts = [...block.matchAll(/<text ([^>]*)>([^<]*)<\/text>/g)];
  const camadas = texts.map((m) => {
    const style = m[1].match(/style="([^"]*)"/)[1];
    return style
      .split(';')
      .filter((rule) => rule && !rule.startsWith('font-size'))
      .join(';');
  });
  const last = texts.at(-1)[1];
  const numero = {
    x: Number(last.match(/ x="([\d.]+)"/)[1]),
    y: Number(last.match(/ y="([\d.]+)"/)[1]),
  };
  // Caixa do dado: pontos do polígono (o contorno define o centro do dado)
  const points = corpo
    .match(/<polygon points="([^"]+)"/)[1]
    .split(' ')
    .map((p) => p.split(',').map(Number));
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const centro = {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
  // Confere que nada do desenho sai do enquadramento (o neon mais grosso foi medido: 10,5/3,9)
  const all = numbers([...corpo.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]).join(' '));
  return { corpo, numero, camadas, centro, all };
}

mkdirSync(outDir, { recursive: true });
for (const sides of SIDES) {
  const entry = {};
  for (const size of ['grande', 'pequeno']) {
    const data = extract(blocks.get(`${sides}-${size}`));
    const lado = VIEWBOX[size];
    const x = +(data.centro.x - lado / 2).toFixed(2);
    const y = +(data.centro.y - lado / 2).toFixed(2);
    entry[size] = {
      viewBox: `${x} ${y} ${lado} ${lado}`,
      corpo: data.corpo,
      numero: data.numero,
      camadas: data.camadas,
    };
  }
  const body = `/**\n * Geometria do dado de pavor d${sides} (neon). Gerado por tools/extrair-dados-pavor.mjs a partir de\n * fear_set_neon.svg; não editar à mão.\n */\nexport const d${sides} = ${JSON.stringify({ lados: sides, ...entry }, null, 2)};\n`;
  writeFileSync(`${outDir}/d${sides}.js`, body);
  console.log(
    `d${sides}: ok`,
    entry.grande.viewBox,
    entry.pequeno.viewBox,
    entry.grande.camadas.length,
    entry.pequeno.camadas.length,
  );
}
