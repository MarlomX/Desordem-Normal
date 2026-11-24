/**
 * Teste estendido pela janela pré-teste: escolhas, DT, registro do teste, ganho, falha,
 * queda e as barras dos cartões.
 * Parte de `challenge.js` (v0.28.7). Lógica pura, sem Foundry.
 */
import {
  CLIMB_APPROACHES,
  MAX_DT,
  MIN_DT,
  ON_FAIL,
  REACH_APPROACHES,
  REACH_TARGET,
  RISKY_DT_BONUS,
  adjustPoints,
  pick,
  setPoints,
  storedInt,
} from './model.js';
import { climbHeight, targetVisible } from './view.js';

// ---------------------------------------------------------------------------------------------
// Teste estendido pela janela pré-teste (0.18.1). O teste marcado como «usar no desafio»
// guarda na mensagem do chat um registro (flag `desafio`). O valor do botão não fica guardado: é
// recalculado dos dados atuais do cartão a cada vez (a Análise e a Prontidão mudam o resultado até
// o clique). O que somar ao passar e ao falhar é guardado na hora da rolagem, para uma mudança na
// configuração do desafio não mudar um teste já rolado. O botão é de uso único (a reserva contra
// o duplo clique é a mesma do avanço da perseguição: reserveAdvance/finishAdvanceFlag).
// ---------------------------------------------------------------------------------------------

/**
 * Desafios que a janela pré-teste oferece ao personagem: os testes estendidos ativos de que ele
 * participa, na ordem da guia.
 * @returns {{id: string, nome: string, tipo: string, dt: number, dtRapida: number,
 *   dtCautelosa: number}[]}
 */
export function challengeTestChoices(data, actorId, { isGM = false } = {}) {
  if (!actorId) return [];
  return data.desafios
    .filter(
      (challenge) =>
        challenge.ativo &&
        // Escondido só para o mestre: o jogador ainda não sabe do desafio
        (isGM || challenge.visibilidade !== 'mestre') &&
        challenge.participantes.some((entry) => entry.actorId === actorId),
    )
    .map((challenge) => ({
      id: challenge.id,
      nome: challenge.nome,
      tipo: challenge.tipo,
      dt: challenge.dt,
      dtRapida: challenge.dtRapida,
      dtCautelosa: challenge.dtCautelosa,
      // Sustentar: uma redução de passo (nos dois dados) por rodada já sustentada
      passos: sustainSteps(challenge, actorId),
    }));
}

/** Escada dos dados base para a redução do sustentar (o d20 paranormal fica acima do d12). */
const SUSTAIN_LADDER = [4, 6, 8, 10, 12, 20];

/**
 * Como as reduções do sustentar se dividem entre os dois dados: uma de cada vez, sempre no dado
 * mais forte naquele momento (no empate, o do atributo), até os dois chegarem a d4.
 * Ex.: d8 + d10 com 3 reduções → d8 + d8 → d6 + d8 → d6 + d6 (atributo 2, perícia 1).
 * @param {number} attrDie Dado do atributo (já com os passos da ficha).
 * @param {number} skillDie Dado da perícia (já com os passos da ficha).
 * @param {number} passos Rodadas já sustentadas.
 * @returns {{attribute: number, skill: number}} Reduções de passo em cada dado.
 */
export function sustainReduction(attrDie, skillDie, passos) {
  const rank = (sides) => Math.max(0, SUSTAIN_LADDER.indexOf(sides));
  let attr = rank(attrDie);
  let skill = rank(skillDie);
  const result = { attribute: 0, skill: 0 };
  for (let i = 0; i < Math.max(0, Math.trunc(passos) || 0); i += 1) {
    if (attr === 0 && skill === 0) break;
    if (attr >= skill) {
      attr -= 1;
      result.attribute += 1;
    } else {
      skill -= 1;
      result.skill += 1;
    }
  }
  return result;
}

/** Passos do `planDice` para uma redução do sustentar (sem entradas zeradas). */
export function sustainStepMods(reduction) {
  const mods = [];
  if (reduction?.attribute > 0) mods.push({ target: 'attribute', steps: -reduction.attribute });
  if (reduction?.skill > 0) mods.push({ target: 'skill', steps: -reduction.skill });
  return mods;
}

/** Reduções de passo do próximo teste de sustentar (rodadas já sustentadas); 0 nos outros. */
export function sustainSteps(challenge, actorId) {
  if (challenge?.tipo !== 'sustentar') return 0;
  return challenge.participantes.find((entry) => entry.actorId === actorId)?.pontos ?? 0;
}

/**
 * DT de um desafio para um teste: na escalada, a da abordagem; no alcançar, a do ambiente (forma
 * segura) ou ela +3 (forma arriscada); nos demais, a DT do desafio.
 */
export function challengeDtFor(challenge, abordagem) {
  if (challenge.tipo === 'alcancar') {
    return abordagem === 'arriscada'
      ? Math.min(MAX_DT, challenge.dt + RISKY_DT_BONUS)
      : challenge.dt;
  }
  if (challenge.tipo !== 'escalar') return challenge.dt;
  return abordagem === 'cautelosa' ? challenge.dtCautelosa : challenge.dtRapida;
}

/** Forma válida do alcançar (segura, se não vier nada). */
export const reachApproach = (value) => pick(value, REACH_APPROACHES, 'segura');

/** Abordagem guardada para o tipo (escalar: rápida/cautelosa; alcançar: segura/arriscada). */
export function approachFor(tipo, value) {
  if (tipo === 'escalar') return climbApproach(value);
  if (tipo === 'alcancar') return reachApproach(value);
  return null;
}

/** Abordagem válida da escalada (rápida, se não vier nada). */
export const climbApproach = (value) => pick(value, CLIMB_APPROACHES, 'rapida');

/**
 * Registro de um teste estendido recém-rolado: nada somado ainda. Na escalada, a abordagem decide
 * o que soma ao passar (rápida: RA; cautelosa: RB) e falhar é uma queda (`queda: true`). Com custo
 * por teste, o registro leva também `custo` (o botão «pagar PV», que tem a sua própria reserva).
 */
export function createChallengeTestFlag({ challenge, actorId, dt, abordagem }) {
  const tipo = challenge.tipo;
  const approach = approachFor(tipo, abordagem);
  const rules = {
    somaPassar: challenge.somaPassar,
    somaFalhar: challenge.somaFalhar,
    falha: null,
    danoRolagem: null,
    zeraAoFalhar: false,
  };
  if (tipo === 'escalar') {
    // Rápida soma a RA, cautelosa a RB; falhar é queda. Subindo, o dano são os pontos acumulados
    // (e eles zeram); descendo, a altura que falta (e ele chega embaixo). O sentido fica no
    // registro: se o mestre trocar no meio, o cartão já rolado aplica a queda que valia
    Object.assign(rules, {
      somaPassar: approach === 'cautelosa' ? 'rb' : 'ra',
      somaFalhar: 'nada',
      falha: 'queda',
      sentido: challenge.sentido === 'descer' ? 'descer' : 'subir',
    });
  } else if (tipo === 'alcancar') {
    // Segura: cada sucesso é uma das duas ações; falhar dá dano = RB e recomeça.
    // Arriscada: um sucesso alcança; falhar dá dano = RA (sem mexer no progresso).
    const safe = approach === 'segura';
    Object.assign(rules, {
      somaPassar: safe ? 'um' : 'tudo',
      somaFalhar: 'nada',
      falha: 'dano',
      danoRolagem: safe ? 'rb' : 'ra',
      zeraAoFalhar: safe,
    });
  } else if (tipo === 'sustentar') {
    // Passar: mais uma rodada sustentada. Falhar: solta o objeto (as rodadas zeram)
    Object.assign(rules, { somaPassar: 'um', somaFalhar: 'nada', falha: 'soltar' });
  }
  const passos = sustainSteps(challenge, actorId);
  // Sustentar: o PV é gasto só para começar (no primeiro teste); nos outros tipos, em todo teste
  const charge = challenge.custoPv > 0 && (tipo !== 'sustentar' || passos === 0);
  return {
    desafioId: challenge.id,
    actorId,
    tipo,
    abordagem: approach,
    dt: storedInt(dt, MIN_DT, MAX_DT, challengeDtFor(challenge, approach)),
    ...rules,
    queda: rules.falha === 'queda',
    passos,
    estado: 'pendente',
    ganho: null,
    dano: null,
    zerou: false,
    custo: charge
      ? { pv: challenge.custoPv, estado: 'pendente', aplicado: null, zerou: false }
      : null,
  };
}

/** O que acontece ao falhar: 'queda', 'dano', 'soltar' ou `null` (soma o «ao falhar»). */
export const failureKind = (flag) => flag?.falha ?? (flag?.queda ? 'queda' : null);

/**
 * O teste passou no desafio? Sucesso crítico passa sempre e falha crítica falha sempre (p. 11);
 * no resto, o total contra a DT guardada no registro.
 * @param {{total: number, criticalSuccess: boolean, criticalFailure: boolean}} result
 */
export function challengeTestSuccess(result, dt) {
  if (result.criticalFailure) return false;
  if (result.criticalSuccess) return true;
  return result.total >= dt;
}

/** Valor de uma rolagem pelo nome guardado ('ra', 'rb' ou 'nada'). */
function rollPart(result, part) {
  if (part === 'ra') return result.highRoll;
  if (part === 'rb') return result.lowRoll;
  return 0;
}

/** O que o teste soma ao passar: a RA, a RB, uma ação/rodada ('um') ou alcança ('tudo'). */
const PASS_PARTS = ['ra', 'rb', 'um', 'tudo'];

/**
 * Pontos que o teste soma ao desafio.
 * - Sucesso crítico: as duas rolagens mais altas (`highSum`), qualquer que seja o «ao passar».
 * - Passou: a RA ou a RB, como o desafio manda.
 * - Falhou (e falha crítica): nada, a RB ou a RA, como o desafio manda. O efeito da falha crítica
 *   (tabela d8) continua no cartão, como em qualquer teste.
 * @param {{total: number, highRoll: number, lowRoll: number, highSum: number,
 *   criticalSuccess: boolean, criticalFailure: boolean}} result Resultado de `resolveTest`.
 * @param {{dt: number, somaPassar: string, somaFalhar: string}} flag Registro do teste.
 */
export function challengeTestGain(result, flag) {
  if (!challengeTestSuccess(result, flag.dt)) {
    // Queda, dano ou soltar: o botão trata a falha; não soma pontos
    if (failureKind(flag)) return 0;
    return Math.max(0, rollPart(result, pick(flag.somaFalhar, ON_FAIL, 'nada')));
  }
  const part = pick(flag.somaPassar, PASS_PARTS, 'ra');
  // Alcançar e sustentar contam ações e rodadas: o crítico também vale uma (ou alcança)
  if (part === 'um') return 1;
  if (part === 'tudo') return REACH_TARGET;
  if (result.criticalSuccess) return Math.max(0, result.highSum);
  return Math.max(0, rollPart(result, part));
}

/**
 * Falha com consequência (o mestre, ao clicar no botão do cartão):
 * - queda (escalar): dano = pontos acumulados, e eles zeram;
 * - dano (alcançar): dano = RB (segura, e as ações zeram) ou RA (arriscada);
 * - soltar (sustentar): sem dano, as rodadas zeram.
 * `null` se o desafio não está ativo ou o personagem saiu dele.
 * @returns {{challenge: object, dano: number, kind: string}|null}
 */
export function applyChallengeFailure(challenge, flag, result) {
  const kind = failureKind(flag);
  if (!kind || !challenge?.ativo) return null;
  const entry = challenge.participantes.find((item) => item.actorId === flag.actorId);
  if (!entry) return null;
  if (kind === 'queda') return { ...applyFall(challenge, flag.actorId, flag.sentido), kind };
  if (kind === 'soltar') return { challenge: setPoints(challenge, flag.actorId, 0), dano: 0, kind };
  return {
    challenge: flag.zeraAoFalhar ? setPoints(challenge, flag.actorId, 0) : challenge,
    dano: Math.max(0, rollPart(result, flag.danoRolagem)),
    kind,
  };
}

/**
 * Soma os pontos de um teste ao desafio (o mestre, ao clicar no botão). Só vale se o desafio está
 * ativo e o personagem ainda participa; senão devolve `null` (o botão não soma nada).
 */
export function applyChallengeTest(challenge, actorId, gain) {
  if (!challenge?.ativo) return null;
  if (!challenge.participantes.some((entry) => entry.actorId === actorId)) return null;
  return adjustPoints(challenge, actorId, gain);
}

/**
 * Queda da escalada (o mestre, ao clicar em «aplicar queda»). Subindo: o dano é igual aos pontos
 * que o personagem tinha acumulado, e os pontos voltam a 0. Descendo (v0.27.1): o dano é a altura
 * que ainda faltava (começou em 10, desceu 4: cai de 6, −6 PV), e ele chega embaixo (progresso =
 * PA), terminando o desafio. `null` se o desafio não está ativo ou o personagem saiu dele.
 * @param {object} challenge
 * @param {string} actorId
 * @param {string} [sentido] O do registro do teste; sem ele (cartões antigos), «subir».
 * @returns {{challenge: object, dano: number}|null}
 */
export function applyFall(challenge, actorId, sentido = 'subir') {
  if (!challenge?.ativo) return null;
  const entry = challenge.participantes.find((item) => item.actorId === actorId);
  if (!entry) return null;
  if (sentido === 'descer') {
    return {
      challenge: setPoints(challenge, actorId, challenge.pa),
      dano: climbHeight(challenge, entry.pontos),
    };
  }
  return { challenge: setPoints(challenge, actorId, 0), dano: entry.pontos };
}

/** PV depois de uma perda (nunca abaixo de 0) e se chegou a 0 agora. */
export function loseHitPoints(pv, loss) {
  const next = Math.max(0, Math.trunc(pv) - Math.max(0, Math.trunc(loss)));
  return { pv: next, applied: Math.trunc(pv) - next, reachedZero: loss > 0 && next === 0 };
}

/**
 * O que a barra do cartão do teste mostra. `kind` diz como o valor foi obtido (para o texto):
 * `crit`, `passou`, `falhou` ou `falhaCritica`. `fechado` quando o desafio foi encerrado,
 * excluído, ou o personagem saiu dele (o botão some).
 * @param {object} flag Registro do teste (`createChallengeTestFlag`).
 * @param {object} result Resultado atual do teste (com os dados que o cartão mostra agora).
 * Na escalada, um teste que falhou vira «queda» (`queda: true`): o botão aplica o dano igual aos
 * pontos acumulados (`dano`, os pontos de agora) e zera os pontos.
 * Na descida, o dano é a altura que falta; com a PA escondida, o jogador não vê o número antes do
 * clique (`danoOculto`).
 * @param {{canApply: boolean, claimable: boolean, busy: boolean, challenge: object|null,
 *   isGM?: boolean}} viewer `claimable` e `busy` vêm da reserva do botão (veja
 *   `isAdvanceClaimable` em chase.js); `isGM` decide se a PA escondida aparece.
 */
export function challengeBarView(
  flag,
  result,
  { canApply, claimable, busy, challenge, isGM = false },
) {
  const pontos = challengeTestGain(result, flag);
  const failed = !challengeTestSuccess(result, flag.dt);
  const falha = failed ? failureKind(flag) : null;
  const queda = falha === 'queda';
  // Descida (v0.27.1): o sentido de quando o teste foi rolado
  const descer = flag.sentido === 'descer';
  const atuais = challenge
    ? (challenge.participantes.find((entry) => entry.actorId === flag.actorId)?.pontos ?? 0)
    : 0;
  // Dano mostrado antes do clique: na queda, os pontos de agora (descendo, a altura que falta);
  // no alcançar, a RB ou a RA
  let dano = 0;
  if (falha === 'queda') dano = descer && challenge ? climbHeight(challenge, atuais) : atuais;
  else if (falha === 'dano') dano = Math.max(0, rollPart(result, flag.danoRolagem));
  let kind = 'passou';
  if (result.criticalFailure) kind = 'falhaCritica';
  else if (result.criticalSuccess) kind = 'crit';
  else if (!challengeTestSuccess(result, flag.dt)) kind = 'falhou';
  const applied = flag.estado === 'aplicado';
  const fechado =
    !applied &&
    (!challenge?.ativo || !challenge.participantes.some((entry) => entry.actorId === flag.actorId));
  return {
    dt: flag.dt,
    kind,
    pontos,
    nome: challenge?.nome ?? '',
    tipo: flag.tipo ?? 'estendido',
    abordagem: flag.abordagem ?? null,
    falha,
    queda,
    descer,
    // Descida com a PA escondida: o jogador não vê o dano antes do clique (entregaria a altura)
    danoOculto: queda && descer && Boolean(challenge) && !targetVisible(challenge, { isGM }),
    zera: Boolean(flag.zeraAoFalhar),
    dano,
    passos: flag.passos ?? 0,
    // Falha já aplicada: o registro guarda qual (os registros da 0.18.2 só têm o dano da queda)
    appliedFalha: applied ? (flag.falhaAplicada ?? (flag.dano != null ? 'queda' : null)) : null,
    appliedQueda:
      applied && (flag.falhaAplicada ?? (flag.dano != null ? 'queda' : null)) === 'queda',
    appliedDepois: flag.depois ?? null,
    appliedDano: flag.dano ?? 0,
    appliedZerou: Boolean(flag.zerou),
    applied,
    appliedPontos: flag.ganho,
    busy: !applied && busy,
    fechado,
    showButton: canApply && claimable && !fechado,
  };
}

/**
 * O que a barra do custo por teste mostra (o botão «pagar PV», de uso único). `null` se o teste
 * não tem custo.
 * @param {{pv: number, estado: string, aplicado: number|null, zerou: boolean}|null} custo
 * @param {{canApply: boolean, claimable: boolean, busy: boolean}} viewer
 */
export function costBarView(custo, { canApply, claimable, busy }) {
  if (!custo || !(custo.pv > 0)) return null;
  const applied = custo.estado === 'aplicado';
  return {
    pv: custo.pv,
    applied,
    appliedPv: custo.aplicado ?? 0,
    zerou: Boolean(custo.zerou),
    busy: !applied && busy,
    showButton: canApply && claimable,
  };
}
