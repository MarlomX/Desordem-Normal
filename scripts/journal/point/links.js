/**
 * Vínculos do ponto de interesse (itens, páginas, atores): limpeza, edição e visibilidade.
 * Parte de `point.js` (v0.28.7). Lógica pura, sem Foundry.
 */
import { blockLabel, clean } from './blocks.js';
import { isLineVisibleTo } from './boards.js';
import { textSnippet } from './investigation.js';

/** Tipos de documento que podem ser vinculados (o nome do documento no Foundry). */
export const LINK_TYPES = Object.freeze(['Item', 'JournalEntry', 'JournalEntryPage', 'Actor']);

/** Limite de vínculos por ponto. */
export const MAX_LINKS = 20;

/** Ícone (Font Awesome) de cada tipo de vínculo. */
export const LINK_ICONS = Object.freeze({
  Item: 'fa-solid fa-suitcase',
  JournalEntry: 'fa-solid fa-book',
  JournalEntryPage: 'fa-solid fa-file-lines',
  Actor: 'fa-solid fa-user',
});

/** Tipo do documento pelo UUID («Item.abc», «JournalEntry.x.JournalEntryPage.y», compêndios). */
export function linkTypeOf(uuid) {
  const parts = clean(uuid).split('.');
  // O tipo é a penúltima parte com nome de documento (o id vem depois dele)
  for (let i = parts.length - 2; i >= 0; i -= 1) {
    if (LINK_TYPES.includes(parts[i])) return parts[i];
  }
  return '';
}

/** Quantidade disponível: inteiro de 0 a 999 (padrão 1). */
function cleanQuantity(value) {
  const number = Number(value);
  if (value === '' || value === null || value === undefined || !Number.isFinite(number)) return 1;
  return Math.min(999, Math.max(0, Math.round(number)));
}

/** Um vínculo novo, escondido de todos. */
export function newLink(id, uuid) {
  return {
    id,
    uuid: clean(uuid),
    tipo: linkTypeOf(uuid),
    rotulo: '',
    linhaId: '',
    quantidade: 1,
    revelado: false,
    reveladoPara: [],
  };
}

/**
 * Lista de vínculos limpa (sem UUID ou de tipo não aceito, sai). Ids faltando ou repetidos recebem
 * um id novo (`v0`, `v1`…, pulando os que já existem).
 */
export function normalizeLinks(raw) {
  if (!Array.isArray(raw)) return [];
  const used = new Set();
  const uniqueId = (wanted) => {
    let id = wanted;
    for (let n = 0; !id || used.has(id); n += 1) id = `v${n}`;
    used.add(id);
    return id;
  };
  return raw
    .filter((entry) => entry && typeof entry === 'object' && linkTypeOf(entry.uuid))
    .map((entry) => ({
      id: uniqueId(clean(entry.id)),
      uuid: clean(entry.uuid),
      tipo: linkTypeOf(entry.uuid),
      rotulo: clean(entry.rotulo),
      linhaId: clean(entry.linhaId),
      quantidade: cleanQuantity(entry.quantidade),
      revelado: entry.revelado === true,
      reveladoPara: [...new Set((entry.reveladoPara ?? []).map(clean).filter(Boolean))],
    }));
}

/**
 * Acrescenta um vínculo (o mesmo documento não entra duas vezes; até `MAX_LINKS`).
 * @returns {object[]} A lista nova, ou a mesma se nada mudou.
 */
export function addLink(links, link) {
  if (!linkTypeOf(link?.uuid) || links.length >= MAX_LINKS) return links;
  if (links.some((entry) => entry.uuid === link.uuid)) return links;
  return [...links, link];
}

export function removeLink(links, linkId) {
  return links.filter((link) => link.id !== linkId);
}

/** Troca um vínculo (pelo id) pelo resultado de `change(vínculo)`. */
const mapLink = (links, linkId, change) =>
  links.map((link) => (link.id === linkId ? change(link) : link));

/** Revela o vínculo para todos, ou esconde de todos (limpa também os jogadores específicos). */
export function setLinkRevealed(links, linkId, revealed) {
  return mapLink(links, linkId, (link) =>
    revealed ? { ...link, revelado: true } : { ...link, revelado: false, reveladoPara: [] },
  );
}

/** Revela o vínculo só para estes usuários (a lista substitui a anterior). */
export function setLinkUsers(links, linkId, userIds) {
  const ids = [...new Set((userIds ?? []).map(clean).filter(Boolean))];
  return mapLink(links, linkId, (link) => ({ ...link, reveladoPara: ids }));
}

/** Esconde todos os vínculos (o «Esconder tudo»). A ligação com a linha continua. */
export function hideAllLinks(links) {
  return links.map((link) => ({ ...link, revelado: false, reveladoPara: [] }));
}

/** Uma unidade a menos do item (não passa de 0). */
export function takeOne(links, linkId) {
  return mapLink(links, linkId, (link) => ({
    ...link,
    quantidade: Math.max(0, link.quantidade - 1),
  }));
}

/** Aplica o formulário de edição dos vínculos (`vinculo.<id>.rotulo` etc.), pelos ids. */
export function applyLinkForm(links, form) {
  if (!form || typeof form !== 'object') return links;
  return links.map((link) => {
    const entry = form[link.id];
    if (!entry || typeof entry !== 'object') return link;
    const next = { ...link };
    if ('rotulo' in entry) next.rotulo = clean(entry.rotulo);
    if ('linhaId' in entry) next.linhaId = clean(entry.linhaId);
    if ('quantidade' in entry) next.quantidade = cleanQuantity(entry.quantidade);
    return next;
  });
}

/** Linha (pelo id) em qualquer bloco, ou `null`. */
function findLine(blocks, lineId) {
  for (const block of blocks) {
    const line = block.linhas.find((entry) => entry.id === lineId);
    if (line) return line;
  }
  return null;
}

/**
 * O vínculo aparece para este usuário? Revelado para todos, para ele, ou amarrado a uma linha que
 * ele vê.
 */
export function isLinkVisibleTo(link, blocks, userId) {
  if (link.revelado || link.reveladoPara.includes(userId)) return true;
  const line = link.linhaId ? findLine(blocks, link.linhaId) : null;
  return Boolean(line && isLineVisibleTo(line, userId));
}

/**
 * Ids dos vínculos que este usuário vê. Entram na mesma lista de «vistos» das linhas (os ids não
 * se repetem), para o vínculo novo também ganhar a marca de «novo» e o aviso.
 */
export function visibleLinkIds(links, blocks, userId) {
  return links.filter((link) => isLinkVisibleTo(link, blocks, userId)).map((link) => link.id);
}

/**
 * Quem vê o vínculo (para dar a permissão de ver o documento): `all` se é para todos (o vínculo
 * ou a linha dele revelados para todos); senão a lista de usuários.
 * @returns {{all: boolean, userIds: string[]}}
 */
export function linkAudience(link, blocks) {
  const line = link.linhaId ? findLine(blocks, link.linhaId) : null;
  if (link.revelado || line?.revelada) return { all: true, userIds: [] };
  const userIds = new Set([...link.reveladoPara, ...(line?.reveladaPara ?? [])]);
  return { all: false, userIds: [...userIds] };
}

/**
 * Linhas para o seletor «Junto com a linha…» da edição: «Percepção · DT 6 · começo do texto».
 * @returns {{id: string, label: string}[]}
 */
export function lineChoices(blocks, t) {
  return blocks.flatMap((block) =>
    block.linhas.map((line) => ({
      id: line.id,
      label: [
        blockLabel(block, t),
        `${t('DESORDEM.Ponto.DT')} ${line.dt}`,
        textSnippet(line.texto, 40),
      ]
        .filter(Boolean)
        .join(' · '),
    })),
  );
}

/**
 * Vínculos prontos para mostrar. Quem chama passa `resolve`, que acha o documento pelo UUID
 * (nome e se existe); o jogador recebe só os vínculos que vê, sem estado de revelação.
 * @param {object[]} links
 * @param {object} opts
 * @param {object[]} opts.blocks Blocos do ponto (para os vínculos amarrados a linhas).
 * @param {(uuid: string) => ({name: string}|null)} opts.resolve
 * @param {string} [opts.userId] Sem ele, é a visão do mestre (todos os vínculos).
 * @param {(id: string) => string} [opts.userName]
 * @param {(key: string, data?: object) => string} [opts.t]
 * @param {string[]} [opts.fresh] Ids que chegaram nesta visita (marca de «novo»).
 */
export function buildLinks(
  links,
  { blocks, resolve, userId, userName = (id) => id, t, fresh = [] },
) {
  const gm = !userId;
  const isNew = new Set(fresh);
  return links
    .filter((link) => gm || isLinkVisibleTo(link, blocks, userId))
    .map((link) => {
      const doc = resolve(link.uuid);
      const isItem = link.tipo === 'Item';
      const view = {
        id: link.id,
        uuid: link.uuid,
        icon: LINK_ICONS[link.tipo] ?? 'fa-solid fa-link',
        label: link.rotulo || doc?.name || link.uuid,
        missing: !doc,
        isItem,
        quantidade: link.quantidade,
        // Item sem unidade: aparece cinza para todos
        esgotado: isItem && link.quantidade <= 0,
        novo: isNew.has(link.id),
      };
      if (!gm) return view;
      const line = link.linhaId ? findLine(blocks, link.linhaId) : null;
      return {
        ...view,
        revelado: link.revelado,
        reveladoPara: link.reveladoPara.length,
        reveladoParaNomes: link.reveladoPara.map(userName).join(', '),
        linha:
          line && t ? `${t('DESORDEM.Ponto.DT')} ${line.dt} · ${textSnippet(line.texto, 30)}` : '',
      };
    });
}

/**
 * Permissões novas de um documento vinculado para que quem recebeu o vínculo consiga abri-lo.
 * Só sobe (nunca tira o que já havia). Devolve `null` se nada precisa mudar.
 * @param {Record<string, number>} ownership Permissões atuais (`default` e ids de usuários).
 * @param {{all: boolean, userIds: string[]}} audience Saída de `linkAudience`.
 * @param {number} level Nível mínimo (Observador = 2; Limitado = 1).
 * @returns {Record<string, number>|null}
 */
export function grantOwnership(ownership, audience, level) {
  const current = { default: 0, ...(ownership ?? {}) };
  const next = { ...current };
  if (audience?.all) {
    if ((next.default ?? 0) < level) next.default = level;
  } else {
    for (const userId of audience?.userIds ?? []) {
      // Quem herda do padrão já pode ver se o padrão alcança o nível
      const has = next[userId] ?? next.default ?? 0;
      if (has < level) next[userId] = level;
    }
  }
  const changed = Object.keys(next).some((key) => next[key] !== current[key]);
  return changed ? next : null;
}
