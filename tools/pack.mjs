/**
 * Compila os compêndios: lê as fontes JSON de `packs-src/<nome>/` (um arquivo por documento) e
 * grava o banco do Foundry (LevelDB) em `packs/<nome>/`. Roda no workflow de release, antes do
 * zip; localmente: `npm install --no-save @foundryvtt/foundryvtt-cli` e `node tools/pack.mjs`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { compilePack } from '@foundryvtt/foundryvtt-cli';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const source = path.join(root, 'packs-src');

for (const name of fs.readdirSync(source)) {
  const input = path.join(source, name);
  if (!fs.statSync(input).isDirectory()) continue;
  const output = path.join(root, 'packs', name);
  // Começa do zero: o banco é refeito inteiro a partir das fontes
  fs.rmSync(output, { recursive: true, force: true });
  await compilePack(input, output, { log: true });
}
