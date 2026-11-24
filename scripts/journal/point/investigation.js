/**
 * Janela de investigação do ponto de interesse: grupos de perícias, linhas e o que revela.
 * Parte de `point.js` (v0.28.7). Lógica pura, sem Foundry.
 */
import { blockLabel, clean, skillKeyLabel } from './blocks.js';
import { isLineVisibleTo } from './boards.js';

/** Dados que o jogador diz no Investigar e no Observar (o valor do dado é o limite da DT). */
export const INVESTIGATION_DICE = Object.freeze([4, 6, 8, 10, 12]);

// Modos da janela: Investigar/Observar (valor do dado) ou Examinar (resultado do teste).

/** Chave de um grupo de perícia: o nome do bloco em minúsculas (como o jogador vê, juntado). */
export const blockGroupKey = (block, t) => blockLabel(block, t).toLocaleLowerCase('pt-BR');
const groupKeyOf = blockGroupKey;

/**
 * Grupos de perícia da página, sem repetir nomes, na ordem do quadro (os mesmos que o jogador vê
 * juntos). Blocos sem linha também entram (o mestre pode querer conferir).
 * @returns {{key: string, label: string}[]}
 */
export function groupChoices(blocks, t) {
  const seen = new Map();
  for (const block of blocks) {
    const key = groupKeyOf(block, t);
    if (!seen.has(key)) seen.set(key, { key, label: blockLabel(block, t) });
  }
  return [...seen.values()];
}

/**
 * Grupo que combina com o nome de uma perícia (o do cartão do teste, como «Percepção»): primeiro
 * o grupo de mesmo nome; depois um bloco que tenha essa perícia entre as dele («Percepção ou
 * Intuição»). Sem combinação, devolve `''`.
 * @param {object[]} blocks
 * @param {string} skillLabel Nome da perícia, já traduzido.
 * @param {(key: string, data?: object) => string} t
 */
export function findGroupKey(blocks, skillLabel, t) {
  const wanted = clean(skillLabel).toLocaleLowerCase('pt-BR');
  if (!wanted) return '';
  const exact = blocks.find((block) => groupKeyOf(block, t) === wanted);
  if (exact) return groupKeyOf(exact, t);
  const partial = blocks.find((block) =>
    block.pericias.some((key) => skillKeyLabel(key, t).toLocaleLowerCase('pt-BR') === wanted),
  );
  return partial ? groupKeyOf(partial, t) : '';
}

/**
 * Começo do texto de uma linha, sem HTML, para a prévia da janela.
 * @param {string} text HTML da linha.
 * @param {number} [max=90] Tamanho máximo (corta com «…»).
 */
export function textSnippet(text, max = 90) {
  const plain = String(text ?? '')
    .replace(/<(br|\/p|\/li|\/div)[^>]*>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain;
}

/**
 * Linhas do grupo escolhido para a prévia da janela, com a marcação padrão: entra quem tem DT até
 * o valor e não tem condição (linha com condição depende da cena: o mestre decide).
 * @param {object[]} blocks
 * @param {object} opts
 * @param {string} opts.groupKey Saída de `groupChoices` (`key`).
 * @param {number} opts.value Valor do dado (Investigar/Observar) ou resultado do teste (Examinar).
 * @param {(key: string, data?: object) => string} opts.t
 * @param {Record<string, boolean>} [opts.overrides] Marcações mudadas à mão (id da linha → marcada).
 * @returns {{blockId: string, lineId: string, dt: number, condicao: string, resumo: string,
 *   alcanca: boolean, marcada: boolean, revelada: boolean}[]}
 */
export function investigationRows(blocks, { groupKey, value, t, overrides = {} }) {
  const limit = Number.isFinite(Number(value)) ? Number(value) : 0;
  return blocks
    .filter((block) => groupKeyOf(block, t) === groupKey)
    .flatMap((block) =>
      block.linhas.map((line) => {
        const alcanca = line.dt <= limit;
        const padrao = alcanca && !line.condicao;
        return {
          blockId: block.id,
          lineId: line.id,
          dt: line.dt,
          condicao: line.condicao,
          resumo: textSnippet(line.texto),
          alcanca,
          marcada: line.id in overrides ? overrides[line.id] === true : padrao,
          revelada: line.revelada,
        };
      }),
    );
}

/**
 * Revela as linhas escolhidas: para todos (`{all: true}`) ou acrescentando usuários à lista de
 * cada linha (`{userIds}`; quem já estava continua).
 * @param {object[]} blocks
 * @param {string[]} lineIds
 * @param {{all?: boolean, userIds?: string[]}} target
 */
export function applyReveal(blocks, lineIds, target) {
  const chosen = new Set(lineIds);
  const users = [...new Set((target?.userIds ?? []).map(clean).filter(Boolean))];
  return blocks.map((block) => ({
    ...block,
    linhas: block.linhas.map((line) => {
      if (!chosen.has(line.id)) return line;
      if (target?.all) return { ...line, revelada: true };
      return { ...line, reveladaPara: [...new Set([...line.reveladaPara, ...users])] };
    }),
  }));
}

/**
 * Examinar sem informação nova: nenhuma das linhas escolhidas é nova para quem examinou (todas
 * ele já via, ou nenhuma foi escolhida). Calcular ANTES de revelar.
 * @param {object[]} blocks Blocos como estavam antes de revelar.
 * @param {string[]} lineIds Linhas que vão ser reveladas.
 * @param {string} examinerId Usuário que examinou.
 */
export function examineFindsNothing(blocks, lineIds, examinerId) {
  const chosen = new Set(lineIds);
  return !blocks.some((block) =>
    block.linhas.some((line) => chosen.has(line.id) && !isLineVisibleTo(line, examinerId)),
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Ponto pai e ordenação por número (v0.24.6)                                                  */
/* ------------------------------------------------------------------------------------------ */
