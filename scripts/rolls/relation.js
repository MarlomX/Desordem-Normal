/**
 * Relações (laços) do personagem. Lógica pura, sem dependência do Foundry.
 *
 * Cada relação tem um grau de 0 a 3 (as bolinhas da ficha; 0 é um laço neutro, sem benefício)
 * e só pode ser invocada uma vez por missão. Os benefícios são aplicados à mão pelos jogadores
 * (semiautomático): o sistema só controla o grau, o marcador de "usada" e os avisos no chat.
 */

export const RELATION_MAX_DEGREE = 3;

/** Nomes dos graus (os textos ficam no idioma: DESORDEM.Relacao.Grau.<key>). */
export const DEGREE_KEYS = Object.freeze(['neutro', 'afinidade', 'vinculo', 'devocao']);

/** @returns {{pessoa: string, grau: number, descricao: string, usada: boolean}} */
export function newRelation() {
  return { pessoa: '', grau: 1, descricao: '', usada: false };
}

/** Chave do nome do grau (0 a 3). */
export function degreeKey(degree) {
  if (!Number.isInteger(degree) || degree < 0 || degree > RELATION_MAX_DEGREE) {
    throw new RangeError(`Grau de relação inválido: ${degree}`);
  }
  return DEGREE_KEYS[degree];
}

/**
 * Benefícios que o grau oferece ao invocar a relação (cada grau tem a sua própria lista).
 * @param {number} degree
 * @returns {{testDie: number, helpDie: number, motivate: ({count: number, sides: number}|null),
 *   extraAction: boolean}|null} null se o grau não permite invocar (0).
 */
export function relationBenefits(degree) {
  switch (degree) {
    case 1:
      return { testDie: 6, helpDie: 6, motivate: null, extraAction: false };
    case 2:
      return { testDie: 8, helpDie: 8, motivate: { count: 2, sides: 4 }, extraAction: false };
    case 3:
      return { testDie: 12, helpDie: 12, motivate: { count: 2, sides: 6 }, extraAction: true };
    default:
      return null;
  }
}

/**
 * Verifica se a relação pode ser invocada.
 * @returns {{ok: boolean, reason: ('semGrau'|'jaUsada'|null)}}
 */
export function invokeCheck(relation) {
  if (!relationBenefits(relation.grau)) return { ok: false, reason: 'semGrau' };
  if (relation.usada) return { ok: false, reason: 'jaUsada' };
  return { ok: true, reason: null };
}

/** Acrescenta uma relação nova ao fim da lista (devolve uma lista nova). */
export function addRelation(relations) {
  return [...relations.map((r) => ({ ...r })), newRelation()];
}

/** Remove a relação do índice indicado (devolve uma lista nova). */
export function removeRelation(relations, index) {
  return relations.filter((_, i) => i !== index).map((r) => ({ ...r }));
}

/**
 * Altera campos de uma relação (pessoa, descricao, usada, grau); campos desconhecidos são
 * ignorados e o grau é limitado a 0..3. Índice inexistente não altera nada.
 */
export function updateRelation(relations, index, changes) {
  return relations.map((relation, i) => {
    if (i !== index) return { ...relation };
    const next = { ...relation };
    if ('pessoa' in changes) next.pessoa = String(changes.pessoa ?? '');
    if ('descricao' in changes) next.descricao = String(changes.descricao ?? '');
    if ('usada' in changes) next.usada = Boolean(changes.usada);
    if ('grau' in changes) {
      const degree = Math.trunc(Number(changes.grau));
      next.grau = Number.isFinite(degree)
        ? Math.min(RELATION_MAX_DEGREE, Math.max(0, degree))
        : relation.grau;
    }
    return next;
  });
}

/**
 * Clique em uma bolinha da ficha: define o grau como o da bolinha clicada; clicar de novo na
 * última bolinha marcada diminui o grau em 1 (a única forma de chegar a 0 é clicar na primeira).
 */
export function setRelationDegree(relations, index, clicked) {
  const current = relations[index]?.grau;
  if (current === undefined) return relations.map((r) => ({ ...r }));
  const degree = clicked === current ? clicked - 1 : clicked;
  return updateRelation(relations, index, { grau: degree });
}

/**
 * Dados para o cartão de chat da invocação de uma relação.
 * @param {Object} relation
 * @param {Object} labels
 * @param {string} labels.actorName
 * @param {string} labels.degreeLabel Nome traduzido do grau.
 * @param {string} labels.noPerson Texto usado quando a relação não tem nome.
 */
export function buildInvocationContext(relation, { actorName, degreeLabel, noPerson }) {
  return {
    actorName,
    pessoa: relation.pessoa.trim() || noPerson,
    degree: relation.grau,
    degreeLabel,
    descricao: relation.descricao,
    benefits: relationBenefits(relation.grau),
  };
}
