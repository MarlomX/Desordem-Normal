/**
 * Grava as fontes do compêndio «Efeitos básicos» em `packs-src/efeitos/` (um arquivo por
 * documento), a partir das definições do código (veja tools/efeitos-fontes.mjs). Rode depois de
 * mudar a mecânica de uma lesão, de um trauma, de uma condição ou o texto delas:
 * `node tools/gerar-efeitos.mjs`. Os arquivos antigos da pasta são apagados antes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildEffectSources } from './efeitos-fontes.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const lang = JSON.parse(fs.readFileSync(path.join(root, 'lang', 'pt-BR.json'), 'utf8'));
const dir = path.join(root, 'packs-src', 'efeitos');

fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
const sources = buildEffectSources(lang);
for (const { file, doc } of sources) {
  fs.writeFileSync(path.join(dir, file), `${JSON.stringify(doc, null, 2)}\n`);
}
console.log(`${sources.length} documentos gravados em packs-src/efeitos`);
