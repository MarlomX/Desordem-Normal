/**
 * Fontes do compêndio «Efeitos básicos» (v0.22.3), montadas a partir das definições do código:
 * as tabelas de lesões e traumas, as condições de combate e os efeitos de falha crítica
 * (scripts/rolls/condition-tables.js). Assim o compêndio não se separa da mecânica: o teste
 * `tests/packs.test.js` confere que as fontes gravadas são iguais às que esta função monta.
 *
 * Cada efeito vira um Item do tipo `efeito` com:
 * - nome e descrição em português (do arquivo de idioma; a cópia na ficha fica sem texto e mostra
 *   o traduzido pela chave);
 * - `chave` = `lesao:<chave>`, `trauma:<chave>`, `cond:<chave>` ou `falha:<chave>`;
 * - a duração e os efeitos do catálogo de `tableEffect`.
 * Os ids saem de um resumo (hash) da chave: gerar de novo dá os mesmos ids.
 *
 * Só para o desenvolvimento (a pasta tools não vai no zip do sistema).
 */
import crypto from 'node:crypto';
import {
  COMBAT_CONDITIONS,
  DISASTER_EFFECTS,
  storesEffect,
  tableEffect,
} from '../scripts/rolls/condition-tables.js';
import { LESIONS } from '../scripts/rolls/injury.js';
import { TRAUMAS } from '../scripts/rolls/emotional.js';

/**
 * Pastas do compêndio, na ordem em que aparecem: grupo do efeito pronto, nome da pasta, ícone dos
 * itens e as entradas.
 */
const FOLDERS = [
  {
    kind: 'cond',
    name: 'Condições de combate',
    img: 'icons/svg/falling.svg',
    entries: COMBAT_CONDITIONS,
  },
  {
    kind: 'lesao',
    name: 'Saúde',
    img: 'icons/svg/blood.svg',
    entries: LESIONS.filter((e) => e.kind === 'temporary'),
  },
  {
    kind: 'lesao',
    name: 'Lesões',
    img: 'icons/svg/bones.svg',
    entries: LESIONS.filter((e) => e.kind === 'permanent'),
  },
  {
    kind: 'trauma',
    name: 'Traumas',
    img: 'icons/svg/terror.svg',
    entries: TRAUMAS.filter(storesEffect),
  },
  { kind: 'falha', name: 'Falha crítica', img: 'icons/svg/hazard.svg', entries: DISASTER_EFFECTS },
];

/** Onde ficam os textos de cada grupo no arquivo de idioma. */
const TEXT_BASE = {
  lesao: 'Lesoes',
  trauma: 'Traumas',
  cond: 'Condicoes',
  falha: 'FalhaCritica',
};

/** Letras e números aceitos num id do Foundry. */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** Id de 16 letras: o prefixo e, no resto, letras tiradas do hash da chave. */
function stableId(prefix, key) {
  const bytes = crypto.createHash('sha256').update(key).digest();
  let id = prefix;
  for (let i = 0; id.length < 16; i += 1) id += ALPHABET[bytes[i] % ALPHABET.length];
  return id;
}

/** Nome do arquivo de uma fonte: o nome sem acento, em minúsculas, com hífens. */
function fileName(name) {
  return `${name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')}.json`;
}

/**
 * Documentos do compêndio (pastas e itens), cada um com o nome do arquivo.
 * @param {object} lang Conteúdo de `lang/pt-BR.json`.
 * @returns {{file: string, doc: object}[]}
 */
export function buildEffectSources(lang) {
  const text = (kind, key) => lang.DESORDEM[TEXT_BASE[kind]][key];
  const sources = [];
  FOLDERS.forEach((folder, folderIndex) => {
    const folderId = `dnPastaEfeito00${folderIndex + 1}`;
    sources.push({
      file: `_pasta-${fileName(folder.name)}`,
      doc: {
        _id: folderId,
        _key: `!folders!${folderId}`,
        name: folder.name,
        type: 'Item',
        folder: null,
        description: '',
        sorting: 'm',
        sort: (folderIndex + 1) * 100000,
        color: null,
        flags: {},
      },
    });
    folder.entries.forEach((entry, entryIndex) => {
      const effect = tableEffect(folder.kind, entry);
      const id = stableId('dnEfeito', effect.chave);
      const { Nome: name, Descricao: description } = text(folder.kind, entry.key);
      sources.push({
        file: fileName(name),
        doc: {
          _id: id,
          _key: `!items!${id}`,
          name,
          type: 'efeito',
          img: folder.img,
          system: {
            descricao: description,
            duracao: effect.duracao,
            chave: effect.chave,
            efeitos: effect.efeitos,
          },
          effects: [],
          folder: folderId,
          sort: (entryIndex + 1) * 100000,
          ownership: { default: 0 },
          flags: {},
        },
      });
    });
  });
  return sources;
}
