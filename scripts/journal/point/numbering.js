/**
 * Numeração e ordem das páginas de ponto de interesse, páginas filhas e ícones das notas.
 * Parte de `point.js` (v0.28.7). Lógica pura, sem Foundry.
 */
import { clean } from './blocks.js';

/** Partes do número: «3.1.2» → ['3', '1', '2'] (partes vazias saem). */
const numberParts = (numero) => clean(numero).split('.').filter(Boolean);

/**
 * Compara dois números de ponto pelas partes, como números: 2 antes de 10, 4.2 antes de 4.10, e
 * o pai antes dos filhos (3 < 3.1 < 3.1.1 < 3.2). Parte que não é número vem depois das numéricas
 * e é comparada como texto. Número vazio vai para o fim.
 * @returns {number} Negativo se `a` vem antes, positivo se depois, 0 se iguais.
 */
export function compareNumbers(a, b) {
  const left = numberParts(a);
  const right = numberParts(b);
  if (!left.length || !right.length) return (left.length ? 0 : 1) - (right.length ? 0 : 1);
  for (let i = 0; i < Math.min(left.length, right.length); i += 1) {
    const x = Number(left[i]);
    const y = Number(right[i]);
    const xNum = /^\d+$/.test(left[i]);
    const yNum = /^\d+$/.test(right[i]);
    if (xNum && yNum && x !== y) return x - y;
    if (xNum !== yNum) return xNum ? -1 : 1;
    if (!xNum && left[i] !== right[i]) return left[i].localeCompare(right[i], 'pt-BR');
  }
  return left.length - right.length;
}

/**
 * Nova ordem das páginas de um diário: as que não são ponto primeiro (na ordem que já tinham), os
 * pontos depois, pelo número (`compareNumbers`; empate pela ordem antiga). Só devolve as páginas
 * cuja posição muda.
 * @param {{id: string, isPoint: boolean, numero?: string, sort: number}[]} pages
 * @param {number} [step=100000] Distância entre posições (a mesma densidade do Foundry).
 * @returns {{_id: string, sort: number}[]}
 */
export function sortUpdates(pages, step = 100000) {
  const bySort = [...pages].sort((a, b) => a.sort - b.sort);
  const others = bySort.filter((page) => !page.isPoint);
  const points = bySort
    .filter((page) => page.isPoint)
    .map((page, index) => ({ page, index }))
    .sort((a, b) => compareNumbers(a.page.numero, b.page.numero) || a.index - b.index)
    .map(({ page }) => page);
  return [...others, ...points]
    .map((page, index) => ({ _id: page.id, sort: (index + 1) * step }))
    .filter((entry) => pages.find((page) => page.id === entry._id)?.sort !== entry.sort);
}

/**
 * Número de um subponto novo: o do pai mais o próximo número livre entre os irmãos (3 com 3.1 e
 * 3.2 → 3.3). Pai sem número: o filho fica sem número.
 * @param {string} parentNumero
 * @param {string[]} siblingNumeros Números dos outros filhos do mesmo pai.
 */
export function nextChildNumber(parentNumero, siblingNumeros) {
  const base = clean(parentNumero);
  if (!base) return '';
  const used = (siblingNumeros ?? [])
    .map(clean)
    .filter((numero) => numero.startsWith(`${base}.`))
    .map((numero) => Number(numero.slice(base.length + 1).split('.')[0]))
    .filter(Number.isInteger);
  return `${base}.${used.length ? Math.max(...used) + 1 : 1}`;
}

/**
 * Número de um filho depois que o pai mudou de número: troca o começo pelo número novo do pai e
 * mantém a última parte (3.2 com o pai virando 5 → 5.2). Sem última parte, recebe 1.
 */
export function childNumberFor(parentNumero, childNumero) {
  const base = clean(parentNumero);
  if (!base) return clean(childNumero);
  const last = numberParts(childNumero).at(-1) ?? '1';
  return `${base}.${last}`;
}

/**
 * Ids de todos os descendentes de um ponto (filhos, netos…), pelos `paiId`. Protegido contra
 * ciclos (um ponto nunca aparece duas vezes).
 * @param {{id: string, paiId?: string}[]} pages
 * @param {string} rootId
 */
export function descendantIds(pages, rootId) {
  const found = new Set();
  const queue = [rootId];
  while (queue.length) {
    const current = queue.shift();
    for (const page of pages) {
      if (page.paiId === current && page.id !== rootId && !found.has(page.id)) {
        found.add(page.id);
        queue.push(page.id);
      }
    }
  }
  return [...found];
}

/**
 * Pontos que podem ser pai deste: os outros pontos do diário, menos ele mesmo e os descendentes
 * dele (senão viraria um ciclo). Em ordem de número.
 * @param {{id: string, name: string, numero: string, paiId?: string}[]} points
 * @param {string} selfId
 */
export function parentChoices(points, selfId) {
  const blocked = new Set([selfId, ...descendantIds(points, selfId)]);
  return points
    .filter((page) => !blocked.has(page.id))
    .sort((a, b) => compareNumbers(a.numero, b.numero));
}

/* ------------------------------------------------------------------------------------------ */
/* Marcador no mapa (v0.24.7)                                                                  */
/* ------------------------------------------------------------------------------------------ */

/**
 * Ícone do marcador de um ponto no mapa: a imagem de referência, se os jogadores podem vê-la;
 * senão o ícone neutro (a imagem escondida não pode vazar pelo mapa).
 * @param {{imagem?: string, imagemVisivel?: boolean}} system Dados do ponto.
 * @param {string} neutral Caminho do ícone neutro (lupa).
 */
export function noteIconFor(system, neutral) {
  const image = clean(system?.imagem);
  return image && system?.imagemVisivel !== false ? image : neutral;
}

/**
 * Atualizações dos marcadores de um ponto depois que a imagem ou o nome mudaram. Só mexe no que o
 * sistema controla: o ícone, se ainda é o antigo do ponto, a lupa ou o livro padrão do Foundry (um
 * ícone escolhido à mão pelo mestre fica); o texto, se está vazio ou ainda é o nome antigo.
 * @param {{id: string, src: string, text: string}[]} notes Marcadores ligados à página.
 * @param {object} change
 * @param {string} change.oldIcon Ícone que o ponto dava antes.
 * @param {string} change.newIcon Ícone que o ponto dá agora.
 * @param {string} change.oldName Nome da página antes.
 * @param {string} change.newName Nome da página agora.
 * @param {string[]} change.managed Outros ícones que o sistema pode trocar (lupa, livro padrão).
 * @returns {{_id: string, 'texture.src'?: string, text?: string}[]}
 */
export function noteUpdates(notes, { oldIcon, newIcon, oldName, newName, managed = [] }) {
  const ours = new Set([oldIcon, ...managed].filter(Boolean));
  return notes
    .map((note) => {
      const update = { _id: note.id };
      if (note.src !== newIcon && (!note.src || ours.has(note.src))) {
        update['texture.src'] = newIcon;
      }
      if (newName && note.text !== newName && (!note.text || note.text === oldName)) {
        update.text = newName;
      }
      return update;
    })
    .filter((update) => Object.keys(update).length > 1);
}

/* ------------------------------------------------------------------------------------------ */
/* Vínculos: itens, diários, páginas e atores encontrados no ponto (v0.24.8)                   */
/* ------------------------------------------------------------------------------------------ */
