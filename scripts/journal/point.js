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

// Desde a v0.28.7 o código mora em `point/`; este arquivo só reexporta (os imports de
// fora continuam iguais).
export {
  POINT_TYPE,
  NAME_SEPARATOR,
  BLOCK_COLORS,
  DEFAULT_DT,
  MAX_BLOCKS,
  MAX_LINES,
  stripNumberPrefix,
  pointPageName,
  headingLevel,
  skillOptionGroups,
  skillKeyLabel,
  blockLabel,
  newLine,
  newBlock,
  normalizeLine,
  normalizeBlocks,
  addBlock,
  removeBlock,
  moveBlock,
  addLine,
  removeLine,
  moveLine,
  removeSkill,
  applyBlockForm,
} from './point/blocks.js';
export {
  isLineVisibleTo,
  buildEditBlocks,
  buildGmBoard,
  buildPlayerBoard,
  setLineRevealed,
  setLineUsers,
  setBlockRevealed,
  hideAll,
  hasRevealed,
  visibleLineIds,
  newLineIds,
  sameIds,
} from './point/boards.js';
export {
  INVESTIGATION_DICE,
  blockGroupKey,
  groupChoices,
  findGroupKey,
  textSnippet,
  investigationRows,
  applyReveal,
  examineFindsNothing,
} from './point/investigation.js';
export {
  compareNumbers,
  sortUpdates,
  nextChildNumber,
  childNumberFor,
  descendantIds,
  parentChoices,
  noteIconFor,
  noteUpdates,
} from './point/numbering.js';
export {
  LINK_TYPES,
  MAX_LINKS,
  LINK_ICONS,
  linkTypeOf,
  newLink,
  normalizeLinks,
  addLink,
  removeLink,
  setLinkRevealed,
  setLinkUsers,
  hideAllLinks,
  takeOne,
  applyLinkForm,
  isLinkVisibleTo,
  visibleLinkIds,
  linkAudience,
  lineChoices,
  buildLinks,
  grantOwnership,
} from './point/links.js';
