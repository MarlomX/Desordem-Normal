/**
 * Cartão do teste oposto iniciado pela ficha. Lógica pura, sem dependência do Foundry.
 *
 * Fluxo: alguém propõe a disputa (escolhe a própria perícia e, se quiser, o oponente). O cartão
 * nasce sem rolagem. Depois, cada lado rola o seu teste, na ordem que a mesa decidir; quem ainda
 * não tem oponente pode ser «aceito» por qualquer ator de outro dono. Cada teste é uma mensagem
 * comum do chat (com a marca `respostaOposto`); o mestre registra o teste no cartão e, com os dois
 * lados, compara os resultados (`resolveOpposed`). Empate no teste simples: repetem (p. 11).
 *
 * Estado guardado no cartão (flag `oposto`):
 * {
 *   estado: 'aberto' | 'resolvido' | 'empate' | 'cancelado' | 'repetido',
 *   descricao: string,
 *   a: Lado, b: Lado,
 *   resultado: null | {winner, margin, decidedBy, a: Resumo, b: Resumo},
 *   impetoAplicado: boolean,
 * }
 * Lado = {actorUuid, nome, skill, skillLabel, testId}. No lado B, `actorUuid` vazio = aberto a
 * quem aceitar; `skill` vazio = o oponente escolhe a perícia ao rolar.
 */
import { resolveOpposed } from './opposed.js';
import { PERICIAS, APTIDOES, OFICIOS } from '../config.js';
import { extraKey } from './extras.js';

/** Estados do cartão. */
export const OPPOSED_STATES = Object.freeze([
  'aberto',
  'resolvido',
  'empate',
  'cancelado',
  'repetido',
]);

/** Lados do cartão. */
export const SIDES = Object.freeze(['a', 'b']);

const MAX_DESCRIPTION = 120;
const text = (value, max = 80) =>
  String(value ?? '')
    .trim()
    .slice(0, max);

/** Lado limpo (só os campos conhecidos, todos texto). */
function cleanSide(side = {}) {
  return {
    actorUuid: text(side.actorUuid, 200),
    nome: text(side.nome),
    skill: text(side.skill),
    skillLabel: text(side.skillLabel),
    testId: text(side.testId, 64),
  };
}

/**
 * Estado inicial de um cartão proposto. O lado A é quem propõe (ator e perícia obrigatórios);
 * o lado B pode vir com o oponente (alvo) e, se quiser, a perícia dele.
 * @param {{a: object, b?: object, descricao?: string}} input
 */
export function createOpposedState({ a, b = {}, descricao = '' }) {
  const sideA = cleanSide(a);
  if (!sideA.actorUuid || !sideA.skill) throw new RangeError('Lado A sem ator ou sem perícia');
  const sideB = cleanSide({ ...b, testId: '' });
  if (sideB.actorUuid && sideB.actorUuid === sideA.actorUuid) {
    throw new RangeError('Um ator não pode disputar contra si mesmo');
  }
  return {
    estado: 'aberto',
    descricao: text(descricao, MAX_DESCRIPTION),
    a: { ...sideA, testId: '' },
    b: sideB,
    resultado: null,
    impetoAplicado: false,
  };
}

/**
 * Um ator pode rolar por este lado agora? O cartão precisa estar aberto e o lado sem teste; se o
 * lado já tem ator, tem que ser ele; o mesmo ator não pode ocupar os dois lados.
 */
export function canRollSide(state, side, actorUuid) {
  if (state?.estado !== 'aberto' || !SIDES.includes(side) || !actorUuid) return false;
  const mine = state[side];
  const other = state[side === 'a' ? 'b' : 'a'];
  if (mine.testId) return false;
  if (mine.actorUuid && mine.actorUuid !== actorUuid) return false;
  return other.actorUuid !== actorUuid;
}

/**
 * Registra o teste de um lado. Devolve o estado novo, ou null se o registro não vale (cartão
 * fechado, lado já rolado, ator errado ou repetido no outro lado). A perícia e o nome vêm do teste.
 * @param {object} state
 * @param {'a'|'b'} side
 * @param {{actorUuid: string, nome: string, skill: string, skillLabel: string, testId: string}} entry
 */
export function registerSide(state, side, entry) {
  if (!canRollSide(state, side, entry?.actorUuid) || !entry.testId) return null;
  return { ...state, [side]: cleanSide({ ...state[side], ...entry }) };
}

/** Os dois lados já rolaram? */
export function bothRolled(state) {
  return Boolean(state?.a.testId && state?.b.testId);
}

/** Resumo de um resultado de teste para o cartão. */
function summary(result) {
  return {
    total: result.total,
    criticalSuccess: Boolean(result.criticalSuccess),
    criticalFailure: Boolean(result.criticalFailure),
  };
}

/**
 * Compara os dois testes e fecha o cartão. Também serve para recalcular depois que um teste foi
 * alterado (análise, repetir dado): um cartão resolvido ou empatado volta a ser comparado.
 * @param {object} state
 * @param {{total: number, criticalSuccess: boolean, criticalFailure: boolean}} resultA
 * @param {{total: number, criticalSuccess: boolean, criticalFailure: boolean}} resultB
 */
export function resolveState(state, resultA, resultB) {
  if (!bothRolled(state) || !['aberto', 'resolvido', 'empate'].includes(state.estado)) {
    return state;
  }
  const outcome = resolveOpposed(resultA, resultB);
  return {
    ...state,
    estado: outcome.winner === 'empate' ? 'empate' : 'resolvido',
    resultado: { ...outcome, a: summary(resultA), b: summary(resultB) },
  };
}

/** Lado que perde a disputa (enche o ímpeto), ou null (sem resultado ou empate). */
export function loserSide(state) {
  const winner = state?.resultado?.winner;
  if (winner === 'a') return 'b';
  if (winner === 'b') return 'a';
  return null;
}

/**
 * Cartão novo para repetir um empate: os mesmos atores e as mesmas perícias, sem testes.
 * @returns {object} Estado do cartão novo.
 */
export function repeatState(state) {
  return createOpposedState({
    a: { ...state.a, testId: '' },
    b: { ...state.b, testId: '' },
    descricao: state.descricao,
  });
}

/** O cartão ainda pode ser cancelado (ninguém terminou: está aberto)? */
export function canCancel(state) {
  return state?.estado === 'aberto';
}

/**
 * Perícias que um ator pode usar na disputa, em ordem alfabética. Usa só os grupos que a ficha
 * tem: personagem (perícias, áreas de Aptidão e Ofício, áreas extras) ou criatura (perícias e
 * perícias próprias).
 * @param {object} system `actor.system`.
 * @param {Object} labels
 * @param {(key: string) => string} labels.skill Nome da perícia do livro.
 * @param {(key: string) => string} labels.aptitude Nome da área de Aptidão («Aptidão: Folclore»).
 * @param {(key: string) => string} labels.craft Nome da área de Ofício.
 * @param {(group: string, name: string) => string} labels.extra Nome de uma área extra.
 * @returns {{key: string, label: string}[]}
 */
export function opposedSkillChoices(system, labels) {
  const list = Object.keys(PERICIAS).map((key) => ({ key, label: labels.skill(key) }));
  if (system?.aptidoes) {
    list.push(...APTIDOES.map((key) => ({ key, label: labels.aptitude(key) })));
  }
  if (system?.oficios) list.push(...OFICIOS.map((key) => ({ key, label: labels.craft(key) })));
  const groups = [
    ['aptidao', system?.aptidoesExtras],
    ['oficio', system?.oficiosExtras],
    ['pericia', system?.periciasExtras],
  ];
  for (const [group, extras] of groups) {
    for (const extra of extras ?? []) {
      list.push({ key: extraKey(group, extra.id), label: labels.extra(group, extra.nome) });
    }
  }
  return list.sort((x, y) => x.label.localeCompare(y.label, 'pt-BR'));
}

/**
 * Dados do template do cartão.
 * @param {object} state
 * @returns {object}
 */
export function buildOpposedCardContext(state) {
  const result = state.resultado;
  const side = (key) => {
    const data = state[key];
    const res = result?.[key];
    return {
      key,
      nome: data.nome,
      aberto: !data.actorUuid,
      skillLabel: data.skillLabel,
      rolou: Boolean(data.testId),
      total: res?.total ?? null,
      // Total 0 (o pavor anulou tudo) também aparece: o template não pode testar `total`
      temTotal: Number.isFinite(res?.total),
      criticalSuccess: Boolean(res?.criticalSuccess),
      criticalFailure: Boolean(res?.criticalFailure),
      vencedor: result?.winner === key,
      perdedor: Boolean(result) && result.winner !== 'empate' && result.winner !== key,
    };
  };
  return {
    estado: state.estado,
    descricao: state.descricao,
    a: side('a'),
    b: side('b'),
    aberto: state.estado === 'aberto',
    resolvido: state.estado === 'resolvido',
    empate: state.estado === 'empate',
    cancelado: state.estado === 'cancelado',
    repetido: state.estado === 'repetido',
    vencedorNome: result && result.winner !== 'empate' ? state[result.winner].nome : '',
    margem: result?.margin ?? 0,
    temMargem: (result?.margin ?? 0) > 0,
    porCritico: result?.decidedBy === 'critical',
  };
}
