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

/** Dados que o jogador diz no Investigar e no Observar (o valor do dado é o limite da DT). */
export const INVESTIGATION_DICE = Object.freeze([4, 6, 8, 10, 12]);

/** Modos da janela: Investigar/Observar (valor do dado) ou Examinar (resultado do teste). */
export const INVESTIGATION_MODES = Object.freeze(['investigar', 'examinar']);

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
