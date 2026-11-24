/**
 * Cartão do teste oposto iniciado pela ficha. Lógica pura, sem dependência do Foundry.
 *
 * Fluxo: alguém propõe a disputa e escolhe o seu lado (perícia, arma ou defesa) e, se quiser, o
 * oponente. O cartão nasce sem rolagem. Depois, cada lado rola o seu teste, na ordem que a mesa
 * decidir; quem ainda não tem oponente pode ser «aceito» por qualquer ator de outro dono. Cada
 * teste é uma mensagem comum do chat (com a marca `respostaOposto`); o mestre registra o teste no
 * cartão e, com os dois lados, compara os resultados (regras em `opposed-rules.js`).
 *
 * Tipos de cartão:
 * - `simples`: perícia × perícia. Empate de total e de RA: os dois repetem (cartão novo).
 * - `corpo`: ataque corpo a corpo × ataque corpo a corpo. Pode acertar um, os dois ou nenhum.
 * - `defesa`: ataque (qualquer arma) × Defender-se (Acrobacia ou Luta, +d6).
 *
 * Estado guardado no cartão (flag `oposto`):
 * {
 *   tipo, estado: 'aberto' | 'resolvido' | 'empate' | 'cancelado' | 'repetido',
 *   descricao, a: Lado, b: Lado,
 *   resultado: null | {winner, margin, decidedBy, hits?, a: Resumo, b: Resumo},
 *   dano: {a: Dano|null, b: Dano|null},   // dano causado PELO lado (no outro lado)
 *   impetoAplicado: boolean,
 * }
 * Lado = {actorUuid, nome, papel, skill, skillLabel, arma, testId, esquiva}; papel = 'pericia' |
 * 'ataque' | 'defesa'; `esquiva` = a defesa foi uma esquiva livre (efeito `defesaLivre`, sem o d6); arma = {id, nome, bonusDano, naoLetal, tipo} ou null. No lado B, `actorUuid` vazio =
 * aberto a quem aceitar; `skill`/`arma` vazios = o oponente escolhe ao rolar.
 * Dano = {valor, naoLetal, estado: 'pendente' | 'aplicado', por: id do usuário que aplicou,
 *   guardiao?: {actorUuid, nome, habilidade}} (guardiao = quem assumiu o ataque e leva o dano).
 */
import { PERICIAS, APTIDOES, OFICIOS } from '../config.js';
import { extraKey } from './extras.js';
import { computeDamage } from './damage.js';
import { weaponReady, weaponSkill } from './equipment.js';
import { resolveDefense, resolveMelee, resolveSimple } from './opposed-rules.js';

/** Tipos de cartão. */
export const OPPOSED_TYPES = Object.freeze(['simples', 'corpo', 'defesa']);

// Estados do cartão (campo `estado`): aberto, resolvido, empate, cancelado e repetido.

/** Lados do cartão. */
export const SIDES = Object.freeze(['a', 'b']);

/** Perícias de Defender-se (Luta só contra ataque corpo a corpo). */
export const DEFENSE_SKILLS = Object.freeze(['acrobacia', 'luta']);

const MAX_DESCRIPTION = 120;
const text = (value, max = 80) =>
  String(value ?? '')
    .trim()
    .slice(0, max);

const other = (side) => (side === 'a' ? 'b' : 'a');

/** Tipo do cartão (cartões da 0.19.3 não guardavam o tipo: são simples). */
export const cardType = (state) => (OPPOSED_TYPES.includes(state?.tipo) ? state.tipo : 'simples');

/** Papel de um lado (cartões antigos: perícia). */
const papelOf = (data) => (['ataque', 'defesa'].includes(data?.papel) ? data.papel : 'pericia');

/** Arma limpa (só os campos que o cartão usa), ou null. */
function cleanWeapon(arma) {
  if (!arma?.id) return null;
  return {
    id: text(arma.id, 64),
    nome: text(arma.nome),
    bonusDano: Number.isInteger(arma.bonusDano) ? arma.bonusDano : 0,
    baseDano: arma.baseDano === 'rb' ? 'rb' : 'ra',
    naoLetal: Boolean(arma.naoLetal),
    tipo: arma.tipo === 'distancia' ? 'distancia' : 'corpo',
  };
}

/** Lado limpo (só os campos conhecidos). */
function cleanSide(side = {}) {
  return {
    actorUuid: text(side.actorUuid, 200),
    nome: text(side.nome),
    papel: papelOf(side),
    skill: text(side.skill),
    skillLabel: text(side.skillLabel),
    arma: cleanWeapon(side.arma),
    testId: text(side.testId, 64),
    esquiva: papelOf(side) === 'defesa' && Boolean(side.esquiva),
    esquivaNome: papelOf(side) === 'defesa' && side.esquiva ? text(side.esquivaNome, 80) : '',
  };
}

/** Papéis dos dois lados para um tipo de cartão (na defesa, quem propõe escolhe o seu). */
function rolesFor(tipo, papelA) {
  if (tipo === 'corpo') return { a: 'ataque', b: 'ataque' };
  if (tipo === 'defesa') {
    return papelA === 'defesa' ? { a: 'defesa', b: 'ataque' } : { a: 'ataque', b: 'defesa' };
  }
  return { a: 'pericia', b: 'pericia' };
}

/**
 * A escolha de um lado vale para o cartão? Perícia: qualquer uma. Ataque: uma arma (no corpo a
 * corpo, só arma corpo a corpo), com a perícia da própria arma. Defesa: Acrobacia ou Luta.
 * @param {string} tipo
 * @param {string} papel
 * @param {{skill?: string, arma?: object|null}} choice
 */
export function validChoice(tipo, papel, { skill, arma, esquiva = false } = {}) {
  if (papel === 'pericia') return Boolean(skill);
  // Esquiva livre: a perícia vem do efeito (Acrobacia, por padrão); Defender-se: Acrobacia ou Luta
  if (papel === 'defesa') return esquiva ? Boolean(skill) : DEFENSE_SKILLS.includes(skill);
  if (papel !== 'ataque' || !arma?.id) return false;
  if (tipo === 'corpo' && arma.tipo !== 'corpo') return false;
  return skill === weaponSkill({ pericia: arma.pericia ?? '', tipo: arma.tipo });
}

/**
 * Estado inicial de um cartão proposto. O lado A é quem propõe (ator e escolha obrigatórios);
 * o lado B pode vir com o oponente (alvo).
 * @param {{tipo?: string, a: object, b?: object, descricao?: string}} input `a.arma` (para
 *   atacar) precisa trazer também `pericia` (da arma), para conferir a perícia do ataque.
 */
export function createOpposedState({ tipo = 'simples', a, b = {}, descricao = '' }) {
  if (!OPPOSED_TYPES.includes(tipo)) throw new RangeError(`Tipo de teste oposto: ${tipo}`);
  const roles = rolesFor(tipo, a?.papel);
  const sideA = cleanSide({ ...a, papel: roles.a, testId: '' });
  if (!sideA.actorUuid) throw new RangeError('Lado A sem ator');
  if (!validChoice(tipo, roles.a, { skill: sideA.skill, arma: a?.arma })) {
    throw new RangeError('Escolha inválida para o lado A');
  }
  const sideB = cleanSide({ ...b, papel: roles.b, testId: '' });
  if (sideB.actorUuid && sideB.actorUuid === sideA.actorUuid) {
    throw new RangeError('Um ator não pode disputar contra si mesmo');
  }
  return {
    tipo,
    estado: 'aberto',
    descricao: text(descricao, MAX_DESCRIPTION),
    a: sideA,
    b: sideB,
    resultado: null,
    dano: { a: null, b: null },
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
  if (mine.testId) return false;
  if (mine.actorUuid && mine.actorUuid !== actorUuid) return false;
  return state[other(side)].actorUuid !== actorUuid;
}

/**
 * Registra o teste de um lado. Devolve o estado novo, ou null se o registro não vale (cartão
 * fechado, lado já rolado, ator errado ou repetido, escolha que não serve para o papel do lado).
 * Se o lado já tinha perícia ou arma escolhida (na proposta), o teste tem que ser com ela.
 * @param {object} state
 * @param {'a'|'b'} side
 * @param {{actorUuid: string, nome: string, skill: string, skillLabel: string, testId: string,
 *   arma?: object|null, esquiva?: boolean}} entry `arma` com `pericia`, para conferir a perícia
 *   do ataque. `esquiva`: defesa livre (a perícia escolhida na proposta não precisa bater).
 */
export function registerSide(state, side, entry) {
  if (!canRollSide(state, side, entry?.actorUuid) || !entry.testId) return null;
  const current = state[side];
  const papel = papelOf(current);
  if (!validChoice(cardType(state), papel, entry)) return null;
  const dodge = papel === 'defesa' && Boolean(entry.esquiva);
  if (papel !== 'ataque' && !dodge && current.skill && current.skill !== entry.skill) return null;
  if (papel === 'ataque' && current.arma && current.arma.id !== entry.arma?.id) return null;
  return { ...state, [side]: cleanSide({ ...current, ...entry, papel }) };
}

/** Os dois lados já rolaram? */
export function bothRolled(state) {
  return Boolean(state?.a.testId && state?.b.testId);
}

/** Resumo de um resultado de teste para o cartão. */
function summary(result) {
  return {
    total: result.total,
    highRoll: result.highRoll ?? 0,
    // Rolagem baixa: a redução do escudo de quem perdeu o ataque (cartões antigos não têm)
    lowRoll: result.lowRoll ?? 0,
    criticalSuccess: Boolean(result.criticalSuccess),
    criticalFailure: Boolean(result.criticalFailure),
  };
}

/**
 * Dano causado por cada lado. Dano já aplicado não muda (nem some) quando o cartão é recalculado;
 * o pendente acompanha o resultado novo.
 */
function damageEntries(state, hits, results) {
  const dano = { a: null, b: null };
  for (const side of SIDES) {
    const previous = state.dano?.[side];
    if (previous?.estado === 'aplicado') {
      dano[side] = previous;
      continue;
    }
    const arma = state[side].arma;
    if (!hits?.[side] || !arma) continue;
    dano[side] = {
      valor: computeDamage(results[side], arma.bonusDano, arma.baseDano),
      naoLetal: arma.naoLetal,
      estado: 'pendente',
      por: '',
      // Quem assumiu o ataque continua assumindo depois do recálculo
      ...(previous?.guardiao ? { guardiao: previous.guardiao } : {}),
    };
  }
  return dano;
}

/**
 * Compara os dois testes e fecha o cartão. Também serve para recalcular depois que um teste foi
 * alterado (análise, repetir dado): um cartão resolvido ou empatado volta a ser comparado.
 * @param {object} state
 * @param {object} resultA Resultado completo de `resolveTest` do lado A.
 * @param {object} resultB Resultado do lado B.
 */
export function resolveState(state, resultA, resultB) {
  if (!bothRolled(state) || !['aberto', 'resolvido', 'empate'].includes(state.estado)) {
    return state;
  }
  const tipo = cardType(state);
  const results = { a: resultA, b: resultB };
  let outcome;
  if (tipo === 'corpo') outcome = resolveMelee(resultA, resultB);
  else if (tipo === 'defesa') {
    const attackSide = papelOf(state.a) === 'ataque' ? 'a' : 'b';
    outcome = resolveDefense(results[attackSide], results[other(attackSide)], attackSide);
  } else outcome = resolveSimple(resultA, resultB);
  return {
    ...state,
    estado: outcome.winner === 'empate' && tipo === 'simples' ? 'empate' : 'resolvido',
    resultado: { ...outcome, a: summary(resultA), b: summary(resultB) },
    dano: damageEntries(state, outcome.hits, results),
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
 * Marca o dano de um lado como aplicado (o botão é de uso único). Devolve o estado novo, ou null
 * se o dano não existe ou já foi aplicado.
 * @param {object} state
 * @param {'a'|'b'} side Lado que causou o dano.
 * @param {string} userId Quem aplicou.
 */
export function markDamage(state, side, userId) {
  const entry = state?.dano?.[side];
  if (!entry || entry.estado !== 'pendente') return null;
  return {
    ...state,
    dano: { ...state.dano, [side]: { ...entry, estado: 'aplicado', por: userId } },
  };
}

/**
 * Quem assume o ataque do lado `side` (efeito `interceptar`): o dano desse lado passa a ir para o
 * Guardião. Devolve o estado novo, ou null se o dano não está pendente, se alguém já assumiu ou se
 * o Guardião é o atacante ou o próprio alvo.
 * @param {object} state
 * @param {'a'|'b'} side Lado que causou o dano.
 * @param {{actorUuid: string, nome: string, habilidade: string}} guardian
 */
export function assignGuardian(state, side, guardian) {
  const entry = state?.dano?.[side];
  if (!entry || entry.estado !== 'pendente' || entry.guardiao || !guardian?.actorUuid) return null;
  if ([state[side]?.actorUuid, state[other(side)]?.actorUuid].includes(guardian.actorUuid)) {
    return null;
  }
  return {
    ...state,
    dano: { ...state.dano, [side]: { ...entry, guardiao: { ...guardian } } },
  };
}

/** Quem leva o dano do lado `side`: o Guardião, se alguém assumiu; senão, o outro lado. */
export function damageTargetUuid(state, side) {
  return state?.dano?.[side]?.guardiao?.actorUuid || state?.[other(side)]?.actorUuid || '';
}

/**
 * Cartão novo para repetir um empate: os mesmos atores e as mesmas escolhas, sem testes.
 * @returns {object} Estado do cartão novo.
 */
export function repeatState(state) {
  return {
    ...createOpposedState({
      tipo: cardType(state),
      a: { ...state.a, arma: null, papel: 'pericia' },
      b: { ...state.b, arma: null, papel: 'pericia' },
      descricao: state.descricao,
    }),
  };
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
 * Armas que o ator pode usar num cartão: no corpo a corpo, só as corpo a corpo; nunca uma arma
 * consumível sem unidades.
 * @param {{id: string, name: string, type: string, system: object}[]} items
 * @param {string} tipo Tipo do cartão.
 * @returns {{id: string, nome: string, bonusDano: number, naoLetal: boolean, tipo: string,
 *   pericia: string}[]}
 */
export function weaponChoices(items, tipo) {
  return (
    items
      .filter((item) => item.type === 'arma')
      .filter((item) => tipo !== 'corpo' || item.system.tipo === 'corpo')
      // Arma consumível sem unidades fica fora da escolha
      .filter((item) => weaponReady(item.system))
      .map(({ id, name, system }) => ({
        id,
        nome: name,
        bonusDano: system.bonusDano,
        baseDano: system.baseDano === 'rb' ? 'rb' : 'ra',
        naoLetal: Boolean(system.naoLetal),
        tipo: system.tipo,
        pericia: system.pericia ?? '',
      }))
      .sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'))
  );
}

/**
 * Perícias de Defender-se. Luta só serve contra ataque corpo a corpo: some se o ataque já é
 * conhecido e é à distância; se ainda não é conhecido, aparece com o aviso `soCorpo`.
 * @param {{tipo: string}|null} attackWeapon Arma do ataque, se já escolhida.
 * @returns {{key: string, soCorpo: boolean}[]}
 */
export function defenseChoices(attackWeapon) {
  const choices = [{ key: 'acrobacia', soCorpo: false }];
  if (!attackWeapon) choices.push({ key: 'luta', soCorpo: true });
  else if (attackWeapon.tipo === 'corpo') choices.push({ key: 'luta', soCorpo: false });
  return choices;
}

/**
 * Dados do template do cartão.
 * @param {object} state
 * @returns {object}
 */
export function buildOpposedCardContext(state) {
  const tipo = cardType(state);
  const result = state.resultado;
  const side = (key) => {
    const data = state[key];
    const res = result?.[key];
    return {
      key,
      nome: data.nome,
      aberto: !data.actorUuid,
      papel: papelOf(data),
      ataque: papelOf(data) === 'ataque',
      defesa: papelOf(data) === 'defesa',
      esquiva: Boolean(data.esquiva),
      esquivaNome: data.esquivaNome ?? '',
      armaNome: data.arma?.nome ?? '',
      skillLabel: data.skillLabel,
      rolou: Boolean(data.testId),
      total: res?.total ?? null,
      // Total 0 (o pavor anulou tudo) também aparece: o template não pode testar `total`
      temTotal: Number.isFinite(res?.total),
      highRoll: res?.highRoll ?? null,
      criticalSuccess: Boolean(res?.criticalSuccess),
      criticalFailure: Boolean(res?.criticalFailure),
      vencedor: result?.winner === key,
      perdedor: Boolean(result) && result.winner !== 'empate' && result.winner !== key,
    };
  };
  // Acertos com dano (só nos cartões de combate)
  const hits = SIDES.filter((key) => state.dano?.[key]).map((key) => ({
    key,
    atacante: state[key].nome,
    alvo: state[other(key)].nome,
    valor: state.dano[key].valor,
    naoLetal: state.dano[key].naoLetal,
    aplicado: state.dano[key].estado === 'aplicado',
    // «Alvo: Rowan (Guardião)» quando alguém assumiu o ataque
    guardiaoNome: state.dano[key].guardiao?.nome ?? '',
    guardiaoHabilidade: state.dano[key].guardiao?.habilidade ?? '',
  }));
  const attackSide = SIDES.find((key) => papelOf(state[key]) === 'ataque' && tipo === 'defesa');
  const defenseSide = attackSide ? other(attackSide) : null;
  const decidedBy = result?.decidedBy;
  const defesaVenceu = Boolean(result) && tipo === 'defesa' && result.winner === defenseSide;
  return {
    tipo,
    tipoKey: `DESORDEM.Oposto.Tipo.${tipo}`,
    tipoSimples: tipo === 'simples',
    tipoCorpo: tipo === 'corpo',
    tipoDefesa: tipo === 'defesa',
    estado: state.estado,
    descricao: state.descricao,
    a: side('a'),
    b: side('b'),
    aberto: state.estado === 'aberto',
    resolvido: state.estado === 'resolvido',
    empate: state.estado === 'empate',
    cancelado: state.estado === 'cancelado',
    repetido: state.estado === 'repetido',
    // No simples, «X vence»; no combate, as linhas de acerto dizem o que aconteceu
    vencedorNome:
      result && result.winner !== 'empate' && tipo === 'simples' ? state[result.winner].nome : '',
    defesaVenceu,
    defensorNome: defenseSide ? state[defenseSide].nome : '',
    acertos: hits,
    // «Ninguém acerta» só quando nenhum ataque passou e a defesa não venceu (aí ela já explica)
    ninguemAcerta:
      state.estado === 'resolvido' && tipo !== 'simples' && !hits.length && !defesaVenceu,
    margem: result?.margin ?? 0,
    temMargem: (result?.margin ?? 0) > 0 && tipo === 'simples',
    porCritico: decidedBy === 'critical',
    porRA: decidedBy === 'ra',
    porSegunda: decidedBy === 'segunda',
    porDefesa: decidedBy === 'defesa',
    // Defender-se com Luta contra ataque à distância: a regra não deixa (o mestre decide)
    lutaContraDistancia:
      Boolean(defenseSide) &&
      state[defenseSide].skill === 'luta' &&
      state[attackSide].arma?.tipo === 'distancia',
  };
}
