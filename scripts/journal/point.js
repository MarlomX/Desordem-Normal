/**
 * Ponto de interesse (v0.24.0): lógica pura da página do Diário «Ponto de interesse», sem
 * dependência do Foundry. A folha (`point-sheet.js`) e os ganchos (`point-hooks.js`) chamam estas
 * funções e passam o que precisa do Foundry (tradução, enriquecimento de HTML, gerador de ids).
 *
 * Formato dos dados (`page.system`):
 * - `numero`: texto livre do número no mapa («4», «4.1»);
 * - `descricaoBasica`, `contexto`, `desafioAcesso`: HTML do editor rico;
 * - `imagem` (caminho) e `imagemVisivel` (o jogador vê a imagem?);
 * - `blocos`: o quadro de perícias. Cada bloco tem `id`, `pericias` (chaves, veja
 *   `skillKeyLabel`), `rotulo` (texto livre que substitui o nome montado), `oculta` (o jogador
 *   só vê o bloco quando alguma linha dele é revelada) e `linhas`. Cada linha tem `id`, `dt`,
 *   `texto` (HTML, o que o jogador lê), `notaMestre` e `condicao` (textos só do mestre),
 *   `revelada` (para o grupo todo) e `reveladaPara` (ids de usuários que veem a linha).
 */

/** Nome do subtipo de página no `system.json` e em `CONFIG.JournalEntryPage.dataModels`. */
export const POINT_TYPE = 'pontoInteresse';

/** Separador entre o número e o nome da página no índice («4.1 · Potes»). */
export const NAME_SEPARATOR = ' · ';

/** Quantas cores de bloco existem no CSS (`desordem-ponto__cor-0` … `-4`), usadas em rodízio. */
export const BLOCK_COLORS = 5;

/** DT de uma linha nova (a menor DT usada nos exemplos do livro). */
export const DEFAULT_DT = 6;

/** Limites para o quadro não crescer sem fim (um ponto do livro tem poucos blocos e linhas). */
export const MAX_BLOCKS = 20;
export const MAX_LINES = 20;

/** DT aceita numa linha (0 a 99; o livro usa 6 a 15). */
const MAX_DT = 99;

/** Texto limpo: sempre uma string, sem espaços nas pontas. */
const clean = (value) => (typeof value === 'string' ? value.trim() : '');

/** HTML como veio (só garante que é texto). */
const html = (value) => (typeof value === 'string' ? value : '');

/* ------------------------------------------------------------------------------------------ */
/* Nome da página e nível no índice                                                            */
/* ------------------------------------------------------------------------------------------ */

/**
 * Tira o prefixo «número · » do nome, se ele começar exatamente com esse número.
 * @param {string} name Nome da página.
 * @param {string} numero Número cujo prefixo deve sair (vazio = nada a tirar).
 * @returns {string}
 */
export function stripNumberPrefix(name, numero) {
  const text = String(name ?? '');
  const prefix = `${clean(numero)}${NAME_SEPARATOR}`;
  if (clean(numero) && text.startsWith(prefix)) return text.slice(prefix.length);
  return text;
}

/**
 * Nome da página com o número na frente, como aparece no índice do diário.
 * Tira primeiro o prefixo antigo (`oldNumero`) e o novo (se o nome já vier com ele, como numa
 * página duplicada), para nunca repetir o número.
 * @param {string} name Nome atual ou digitado.
 * @param {string} oldNumero Número que estava gravado.
 * @param {string} newNumero Número novo.
 * @returns {string} «4.1 · Potes», ou só «Potes» sem número. Nome vazio continua o nome antigo.
 */
export function pointPageName(name, oldNumero, newNumero) {
  const base = stripNumberPrefix(stripNumberPrefix(name, oldNumero), newNumero).trim();
  const numero = clean(newNumero);
  if (!base) return String(name ?? '');
  return numero ? `${numero}${NAME_SEPARATOR}${base}` : base;
}

/**
 * Nível no índice do diário a partir do número: «4» = 1, «4.1» = 2, «4.1.2» = 3 (máximo do
 * Foundry). Número vazio fica no nível 1.
 * @param {string} numero
 * @returns {1|2|3}
 */
export function headingLevel(numero) {
  const parts = clean(numero).split('.').filter(Boolean);
  return Math.min(3, Math.max(1, parts.length));
}

/* ------------------------------------------------------------------------------------------ */
/* Perícias do bloco                                                                           */
/* ------------------------------------------------------------------------------------------ */

/**
 * Opções do seletor de perícias, em grupos: perícias comuns (A→Z), Aptidão (geral e por área) e
 * Ofício (geral e por área). As chaves de área são `aptidao:guerra` e `oficio:metalurgia`; as
 * gerais, `aptidao` e `oficio`.
 * @param {object} lists
 * @param {string[]} lists.skills Chaves de `PERICIAS`.
 * @param {string[]} lists.aptitudes `APTIDOES`.
 * @param {string[]} lists.crafts `OFICIOS`.
 * @param {(key: string) => string} t Tradução.
 * @returns {{label: string, options: {key: string, label: string}[]}[]}
 */
export function skillOptionGroups({ skills, aptitudes, crafts }, t) {
  const byLabel = (a, b) => a.label.localeCompare(b.label, 'pt-BR');
  const common = skills.map((key) => ({ key, label: skillKeyLabel(key, t) })).sort(byLabel);
  const area = (base, areas) => [
    { key: base, label: skillKeyLabel(base, t) },
    ...areas.map((name) => ({
      key: `${base}:${name}`,
      label: skillKeyLabel(`${base}:${name}`, t),
    })),
  ];
  return [
    { label: t('DESORDEM.Ficha.Pericias'), options: common },
    { label: t('DESORDEM.Ponto.Aptidao'), options: area('aptidao', aptitudes) },
    { label: t('DESORDEM.Ponto.Oficio'), options: area('oficio', crafts) },
  ];
}

/**
 * Nome de uma chave de perícia: `percepcao` → «Percepção», `aptidao:guerra` → «Aptidão (Guerra)»,
 * `oficio` → «Ofício». Chave desconhecida aparece como está (o mestre ainda entende).
 * @param {string} key
 * @param {(key: string) => string} t Tradução; devolve a própria chave quando não acha o texto.
 */
export function skillKeyLabel(key, t) {
  const [base, area] = String(key ?? '').split(':');
  if (base === 'aptidao' || base === 'oficio') {
    const name = t(base === 'aptidao' ? 'DESORDEM.Ponto.Aptidao' : 'DESORDEM.Ponto.Oficio');
    if (!area) return name;
    const group = base === 'aptidao' ? 'Aptidoes' : 'Oficios';
    const areaKey = `DESORDEM.${group}.${area}`;
    const areaName = t(areaKey);
    return `${name} (${areaName === areaKey ? area : areaName})`;
  }
  const skillKey = `DESORDEM.Pericias.${base}`;
  const label = t(skillKey);
  return label === skillKey ? String(key ?? '') : label;
}

/**
 * Nome do bloco: o rótulo livre, se houver; senão as perícias ligadas por «ou»
 * («Aptidão (Guerra) ou Ofício»); sem nenhuma, «Sem perícia».
 * @param {{pericias?: string[], rotulo?: string}} block
 * @param {(key: string, data?: object) => string} t
 */
export function blockLabel(block, t) {
  const rotulo = clean(block?.rotulo);
  if (rotulo) return rotulo;
  const names = (block?.pericias ?? []).map((key) => skillKeyLabel(key, t));
  if (!names.length) return t('DESORDEM.Ponto.SemPericia');
  if (names.length === 1) return names[0];
  return t('DESORDEM.Ponto.Ou', {
    lista: names.slice(0, -1).join(', '),
    ultima: names[names.length - 1],
  });
}

/* ------------------------------------------------------------------------------------------ */
/* Blocos e linhas: criar, limpar, editar                                                      */
/* ------------------------------------------------------------------------------------------ */

/** DT válida: inteiro de 0 a 99; o resto vira a DT padrão. */
function cleanDt(value) {
  const number = Number(value);
  if (value === '' || value === null || !Number.isFinite(number)) return DEFAULT_DT;
  return Math.min(MAX_DT, Math.max(0, Math.round(number)));
}

/** Linha nova, vazia, ainda não revelada. */
export function newLine(id) {
  return {
    id,
    dt: DEFAULT_DT,
    texto: '',
    notaMestre: '',
    condicao: '',
    revelada: false,
    reveladaPara: [],
  };
}

/** Bloco novo, sem perícia, com uma linha vazia (o caso mais comum é preencher logo). */
export function newBlock(id, lineId) {
  return { id, pericias: [], rotulo: '', oculta: false, linhas: [newLine(lineId)] };
}

/** Uma linha limpa (campos que faltam recebem o padrão). */
export function normalizeLine(raw, fallbackId) {
  const line = raw && typeof raw === 'object' ? raw : {};
  return {
    id: clean(line.id) || fallbackId,
    dt: cleanDt(line.dt),
    texto: html(line.texto),
    notaMestre: html(line.notaMestre),
    condicao: clean(line.condicao),
    revelada: line.revelada === true,
    reveladaPara: [...new Set((line.reveladaPara ?? []).map(clean).filter(Boolean))],
  };
}

/**
 * Lista de blocos limpa: ids garantidos (ids faltando viram `b0`, `b0l1`…), perícias sem
 * repetição, linhas limpas.
 */
export function normalizeBlocks(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry, index) => {
      const id = clean(entry.id) || `b${index}`;
      return {
        id,
        pericias: [...new Set((entry.pericias ?? []).map(clean).filter(Boolean))],
        rotulo: clean(entry.rotulo),
        oculta: entry.oculta === true,
        linhas: (Array.isArray(entry.linhas) ? entry.linhas : []).map((line, lineIndex) =>
          normalizeLine(line, `${id}l${lineIndex}`),
        ),
      };
    });
}

/** Move um item da lista uma casa para cima (`-1`) ou para baixo (`+1`). Fora da lista, nada. */
function move(list, id, direction) {
  const from = list.findIndex((entry) => entry.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= list.length) return list;
  const copy = [...list];
  [copy[from], copy[to]] = [copy[to], copy[from]];
  return copy;
}

/** Troca um bloco (pelo id) pelo resultado de `change(bloco)`. */
function mapBlock(blocks, blockId, change) {
  return blocks.map((block) => (block.id === blockId ? change(block) : block));
}

/** Acrescenta um bloco no fim (até `MAX_BLOCKS`). */
export function addBlock(blocks, block) {
  return blocks.length >= MAX_BLOCKS ? blocks : [...blocks, block];
}

export function removeBlock(blocks, blockId) {
  return blocks.filter((block) => block.id !== blockId);
}

export function moveBlock(blocks, blockId, direction) {
  return move(blocks, blockId, direction);
}

/** Acrescenta uma linha no fim do bloco (até `MAX_LINES`). */
export function addLine(blocks, blockId, line) {
  return mapBlock(blocks, blockId, (block) =>
    block.linhas.length >= MAX_LINES ? block : { ...block, linhas: [...block.linhas, line] },
  );
}

export function removeLine(blocks, blockId, lineId) {
  return mapBlock(blocks, blockId, (block) => ({
    ...block,
    linhas: block.linhas.filter((line) => line.id !== lineId),
  }));
}

export function moveLine(blocks, blockId, lineId, direction) {
  return mapBlock(blocks, blockId, (block) => ({
    ...block,
    linhas: move(block.linhas, lineId, direction),
  }));
}

/** Tira uma perícia do bloco. */
export function removeSkill(blocks, blockId, key) {
  return mapBlock(blocks, blockId, (block) => ({
    ...block,
    pericias: block.pericias.filter((entry) => entry !== key),
  }));
}

/**
 * Aplica o formulário de edição aos blocos gravados. Os campos do formulário são nomeados pelos
 * ids (`ponto.<bloco>.rotulo`, `ponto.<bloco>.linhas.<linha>.dt`…), não pela posição, para uma
 * gravação nunca cair no bloco errado depois de reordenar. Só os campos presentes mudam; o
 * estado de revelação nunca vem do formulário.
 * @param {object[]} blocks Blocos gravados (já limpos por `normalizeBlocks`).
 * @param {Record<string, object>} form O objeto `ponto` do formulário, já expandido.
 *   `adicionar` (chave escolhida no seletor «+ perícia») acrescenta uma perícia ao bloco.
 * @returns {object[]}
 */
export function applyBlockForm(blocks, form) {
  if (!form || typeof form !== 'object') return blocks;
  return blocks.map((block) => {
    const entry = form[block.id];
    if (!entry || typeof entry !== 'object') return block;
    const next = { ...block };
    if ('rotulo' in entry) next.rotulo = clean(entry.rotulo);
    if ('oculta' in entry) next.oculta = entry.oculta === true || entry.oculta === 'true';
    const added = clean(entry.adicionar);
    if (added && !next.pericias.includes(added)) next.pericias = [...next.pericias, added];
    const lines = entry.linhas && typeof entry.linhas === 'object' ? entry.linhas : {};
    next.linhas = block.linhas.map((line) => {
      const fields = lines[line.id];
      if (!fields || typeof fields !== 'object') return line;
      const updated = { ...line };
      if ('dt' in fields) updated.dt = cleanDt(fields.dt);
      if ('texto' in fields) updated.texto = html(fields.texto);
      if ('notaMestre' in fields) updated.notaMestre = html(fields.notaMestre);
      if ('condicao' in fields) updated.condicao = clean(fields.condicao);
      return updated;
    });
    return next;
  });
}

/* ------------------------------------------------------------------------------------------ */
/* Visões                                                                                      */
/* ------------------------------------------------------------------------------------------ */

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
 */
export async function buildGmBoard(blocks, { t, enrich }) {
  return Promise.all(
    blocks.map(async (block, index) => ({
      id: block.id,
      label: blockLabel(block, t),
      oculta: block.oculta,
      cor: index % BLOCK_COLORS,
      linhas: await Promise.all(
        block.linhas.map(async (line) => ({
          id: line.id,
          dt: line.dt,
          texto: line.texto ? await enrich(line.texto) : '',
          notaMestre: line.notaMestre,
          condicao: line.condicao,
          revelada: line.revelada,
          reveladaPara: line.reveladaPara.length,
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
 * @returns {Promise<{label: string, cor: number, linhas: {id: string, texto: string}[]}[]>}
 */
export async function buildPlayerBoard(blocks, { userId, t, enrich }) {
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
        })),
      ),
    })),
  );
}
