/**
 * Quadro do ponto de interesse: o que o mestre e cada jogador veem e as revelações.
 * Parte de `point.js` (v0.28.7). Lógica pura, sem Foundry.
 */
import { BLOCK_COLORS, MAX_LINES, blockLabel, clean, mapBlock, skillKeyLabel } from './blocks.js';

/** A linha está revelada para este usuário (para todos, ou para ele em particular)? */
export function isLineVisibleTo(line, userId) {
  return line.revelada === true || (line.reveladaPara ?? []).includes(userId);
}

/**
 * Blocos prontos para o formulário de edição: nome montado, perícias em etiquetas, opções do
 * seletor «+ perícia» (sem as já escolhidas) e marcas de primeiro/último para as setas.
 * @param {object[]} blocks
 * @param {object} opts
 * @param {(key: string, data?: object) => string} opts.t
 * @param {{label: string, options: {key: string, label: string}[]}[]} opts.groups
 *   Saída de `skillOptionGroups`.
 */
export function buildEditBlocks(blocks, { t, groups }) {
  return blocks.map((block, index) => ({
    ...block,
    label: blockLabel(block, t),
    cor: index % BLOCK_COLORS,
    first: index === 0,
    last: index === blocks.length - 1,
    canAddLine: block.linhas.length < MAX_LINES,
    chips: block.pericias.map((key) => ({ key, label: skillKeyLabel(key, t) })),
    groups: groups
      .map((group) => ({
        label: group.label,
        options: group.options.filter((option) => !block.pericias.includes(option.key)),
      }))
      .filter((group) => group.options.length),
    linhas: block.linhas.map((line, lineIndex) => ({
      ...line,
      first: lineIndex === 0,
      last: lineIndex === block.linhas.length - 1,
    })),
  }));
}

/**
 * Quadro completo do mestre (modo de leitura): todos os blocos na ordem gravada, com DT, texto
 * enriquecido, nota, condição e quem já vê cada linha.
 * @param {object[]} blocks
 * @param {object} opts
 * @param {(key: string, data?: object) => string} opts.t
 * @param {(html: string) => Promise<string>|string} opts.enrich HTML pronto para leitura.
 * @param {(userId: string) => string} [opts.userName] Nome do usuário (para a dica de «revelada
 *   para»); sem ela, aparece o id.
 */
export async function buildGmBoard(blocks, { t, enrich, userName = (id) => id }) {
  return Promise.all(
    blocks.map(async (block, index) => ({
      id: block.id,
      label: blockLabel(block, t),
      oculta: block.oculta,
      cor: index % BLOCK_COLORS,
      // Bloco com todas as linhas reveladas para todos: o olho do bloco passa a esconder
      todasReveladas: block.linhas.length > 0 && block.linhas.every((line) => line.revelada),
      linhas: await Promise.all(
        block.linhas.map(async (line) => ({
          id: line.id,
          dt: line.dt,
          texto: line.texto ? await enrich(line.texto) : '',
          notaMestre: line.notaMestre,
          condicao: line.condicao,
          revelada: line.revelada,
          reveladaPara: line.reveladaPara.length,
          reveladaParaNomes: line.reveladaPara.map(userName).join(', '),
        })),
      ),
    })),
  );
}

/**
 * Quadro do jogador. Só sai daqui o que ele pode ver: nome das perícias e texto das linhas
 * reveladas para ele. Nunca DT, nota do mestre, condição, nem quantas linhas faltam.
 * - Blocos com o mesmo nome (a mesma perícia em dois blocos) viram um grupo só, na posição do
 *   primeiro.
 * - Um bloco oculto só entra quando alguma linha dele está revelada para este usuário.
 * @param {object[]} blocks
 * @param {object} opts
 * @param {string} opts.userId Usuário que vai ver (`game.user.id`).
 * @param {(key: string, data?: object) => string} opts.t
 * @param {(html: string) => Promise<string>|string} opts.enrich
 * @param {string[]} [opts.fresh] Ids das linhas que chegaram nesta visita (marca de «novo»).
 * @returns {Promise<{label: string, cor: number,
 *   linhas: {id: string, texto: string, novo: boolean}[]}[]>}
 */
export async function buildPlayerBoard(blocks, { userId, t, enrich, fresh = [] }) {
  const isNew = new Set(fresh);
  const groups = new Map();
  for (const block of blocks) {
    const visible = block.linhas.filter((line) => isLineVisibleTo(line, userId));
    if (block.oculta && !visible.length) continue;
    const label = blockLabel(block, t);
    const key = label.toLocaleLowerCase('pt-BR');
    if (!groups.has(key)) groups.set(key, { label, linhas: [] });
    groups.get(key).linhas.push(...visible);
  }
  return Promise.all(
    [...groups.values()].map(async (group, index) => ({
      label: group.label,
      cor: index % BLOCK_COLORS,
      linhas: await Promise.all(
        group.linhas.map(async (line) => ({
          id: line.id,
          texto: line.texto ? await enrich(line.texto) : '',
          novo: isNew.has(line.id),
        })),
      ),
    })),
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Revelar (v0.24.3)                                                                           */
/* ------------------------------------------------------------------------------------------ */

/** Troca uma linha (pelo id) pelo resultado de `change(linha)`. */
function mapLine(blocks, blockId, lineId, change) {
  return mapBlock(blocks, blockId, (block) => ({
    ...block,
    linhas: block.linhas.map((line) => (line.id === lineId ? change(line) : line)),
  }));
}

/** Linha escondida de todos: tira a revelação geral e a lista de jogadores. */
const hidden = (line) => ({ ...line, revelada: false, reveladaPara: [] });

/**
 * Revela a linha para todos (`revealed = true`) ou esconde de novo. Esconder limpa também a
 * lista de jogadores específicos (o olho vale como «ninguém vê»).
 */
export function setLineRevealed(blocks, blockId, lineId, revealed) {
  return mapLine(blocks, blockId, lineId, (line) =>
    revealed ? { ...line, revelada: true } : hidden(line),
  );
}

/** Revela a linha só para estes usuários (a lista substitui a anterior; ids repetidos saem). */
export function setLineUsers(blocks, blockId, lineId, userIds) {
  const ids = [...new Set((userIds ?? []).map(clean).filter(Boolean))];
  return mapLine(blocks, blockId, lineId, (line) => ({ ...line, reveladaPara: ids }));
}

/** Revela (para todos) ou esconde todas as linhas de um bloco. */
export function setBlockRevealed(blocks, blockId, revealed) {
  return mapBlock(blocks, blockId, (block) => ({
    ...block,
    linhas: block.linhas.map((line) => (revealed ? { ...line, revelada: true } : hidden(line))),
  }));
}

/** Esconde todas as linhas da página (para reusar a aventura). */
export function hideAll(blocks) {
  return blocks.map((block) => ({ ...block, linhas: block.linhas.map(hidden) }));
}

/** Alguma linha da página está revelada (para todos ou para alguém)? */
export function hasRevealed(blocks) {
  return blocks.some((block) =>
    block.linhas.some((line) => line.revelada || line.reveladaPara.length > 0),
  );
}

/** Ids das linhas que este usuário vê agora, na ordem do quadro. */
export function visibleLineIds(blocks, userId) {
  return blocks.flatMap((block) =>
    block.linhas.filter((line) => isLineVisibleTo(line, userId)).map((line) => line.id),
  );
}

/**
 * Linhas novas para o jogador: as que ele vê agora e que não estavam na lista de vistas.
 * @param {string[]} visible Saída de `visibleLineIds`.
 * @param {string[]} seen Ids que ele já viu nesta página (guardados no usuário dele).
 * @returns {string[]}
 */
export function newLineIds(visible, seen) {
  const known = new Set(seen ?? []);
  return visible.filter((id) => !known.has(id));
}

/**
 * Dois conjuntos de ids iguais, sem contar a ordem? Serve para não gravar a lista de vistas
 * quando nada mudou.
 */
export function sameIds(a, b) {
  const left = new Set(a ?? []);
  const right = new Set(b ?? []);
  return left.size === right.size && [...left].every((id) => right.has(id));
}

/* ------------------------------------------------------------------------------------------ */
/* Atalhos de investigação (v0.24.4)                                                           */
/* ------------------------------------------------------------------------------------------ */
