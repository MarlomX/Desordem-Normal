/**
 * Desafios (lógica pura, sem Foundry): o teste estendido e, nas próximas versões, os desafios de
 * acesso. Os desafios ficam numa configuração do mundo (veja scripts/challenges/store.js) como uma
 * lista de objetos simples; estas funções limpam o que vem de lá, aplicam as edições do mestre e
 * montam o que a guia, a janela e a ficha mostram.
 *
 * Teste estendido: o mestre dá um nome, uma pontuação alvo (PA) e uma DT. Em modo «individual»
 * cada participante tem a sua pontuação; em modo «grupo» todos enchem uma pontuação só. O que
 * somar ao passar (RA ou RB) e ao falhar (nada, RB ou RA) é configurável. Não há rodadas: a
 * ferramenta é para o mestre improvisar, não controla quem já tentou.
 */

/**
 * Tipos de desafio. «arrombar» é um teste estendido com outros padrões (RA ao passar, nada ao
 * falhar, 1 PV por teste), tudo editável. «escalar» tem regra própria: é sempre individual, cada
 * teste escolhe rápida (DT 8, soma a RA) ou cautelosa (DT 6, soma a RB) e falhar é uma queda.
 */
export const CHALLENGE_TYPES = Object.freeze([
  'estendido',
  'arrombar',
  'escalar',
  'alcancar',
  'sustentar',
  'equilibrio',
]);

/**
 * Tipos sempre individuais (cada um por si): escalar, alcançar e sustentar. No alcançar a PA é
 * fixa em 2 (as duas ações da forma segura); no sustentar os pontos contam as rodadas sustentadas
 * e só cabe um participante (os outros ajudam pela ajuda da janela pré-teste).
 */
export const INDIVIDUAL_TYPES = Object.freeze(['escalar', 'alcancar', 'sustentar', 'equilibrio']);

/** Equilíbrio: rodadas para atravessar (a PA) e o limite da reserva de dados de equilíbrio. */
export const DEFAULT_BALANCE_ROUNDS = 3;
export const MAX_BALANCE_DICE = 20;

/** Ações da forma segura do alcançar (a forma arriscada chega direto). */
export const REACH_TARGET = 2;

/** Formas do alcançar. */
export const REACH_APPROACHES = Object.freeze(['segura', 'arriscada']);

/** Quanto a forma arriscada aumenta a DT da segura. */
export const RISKY_DT_BONUS = 3;

/** Ícone de cada tipo de desafio (Font Awesome), na guia e na janela. */
export const TYPE_ICONS = Object.freeze({
  estendido: 'fa-flag-checkered',
  arrombar: 'fa-hammer',
  escalar: 'fa-mountain',
  alcancar: 'fa-hand',
  sustentar: 'fa-dumbbell',
  equilibrio: 'fa-scale-balanced',
});

/** Abordagens da escalada. */
export const CLIMB_APPROACHES = Object.freeze(['rapida', 'cautelosa']);

/** Modos do teste estendido. */
export const CHALLENGE_MODES = Object.freeze(['individual', 'grupo']);

/** O que o teste soma ao passar. */
export const ON_PASS = Object.freeze(['ra', 'rb']);

/** O que o teste soma ao falhar. */
export const ON_FAIL = Object.freeze(['nada', 'rb', 'ra']);

/** Limites (para a lista não crescer sem fim e os números não saírem da tela). */
export const MAX_CHALLENGES = 30;
export const MAX_PARTICIPANTS = 30;
export const MAX_NAME = 80;
export const MAX_TARGET = 999;
export const MAX_POINTS = 9999;
export const MIN_DT = 1;
export const MAX_DT = 40;

/** Valores padrão de um desafio novo. */
export const DEFAULT_TARGET = 10;
export const DEFAULT_DT = 7;
export const DEFAULT_FAST_DT = 8;
export const DEFAULT_CAREFUL_DT = 6;

/** Custo por teste em PV (0 = sem custo), cobrado por botão no cartão do teste. */
export const MAX_COST = 20;

const clampInt = (value, min, max) => Math.min(max, Math.max(min, Math.trunc(value)));

/** Número inteiro válido ou `null` (texto vazio NÃO vira 0: `Number('')` daria 0). */
export function parseInteger(raw) {
  const text = String(raw ?? '').trim();
  if (text === '' || !/^-?\d+$/.test(text)) return null;
  return Number(text);
}

/** Lê um número de um valor guardado (já número ou texto); `fallback` se não for válido. */
function storedInt(value, min, max, fallback) {
  const number = typeof value === 'number' ? value : parseInteger(value);
  return Number.isFinite(number) ? clampInt(number, min, max) : fallback;
}

const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);

const cleanName = (value) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME);

/** Limpa a lista de participantes: ids de texto, sem repetição, pontos dentro dos limites. */
function normalizeParticipants(list) {
  const seen = new Set();
  const result = [];
  for (const entry of Array.isArray(list) ? list : []) {
    const actorId = typeof entry?.actorId === 'string' ? entry.actorId.trim() : '';
    if (!actorId || seen.has(actorId) || result.length >= MAX_PARTICIPANTS) continue;
    seen.add(actorId);
    // Equilíbrio: d4 que ainda restam na travessia (sem o campo = reserva cheia, ainda não usada)
    const reserva = storedInt(entry.reserva, 0, MAX_BALANCE_DICE, null);
    result.push({
      actorId,
      pontos: storedInt(entry.pontos, 0, MAX_POINTS, 0),
      ...(reserva === null ? {} : { reserva }),
    });
  }
  return result;
}

/**
 * Um desafio limpo (ou `null` se não tiver id). Campos desconhecidos são descartados e campos
 * inválidos voltam ao padrão, para uma configuração estragada nunca quebrar a guia.
 */
export function normalizeChallenge(entry) {
  const id = typeof entry?.id === 'string' ? entry.id.trim() : '';
  if (!id) return null;
  const tipo = pick(entry.tipo, CHALLENGE_TYPES, 'estendido');
  return {
    id,
    tipo,
    nome: cleanName(entry.nome),
    // Alcançar: a PA é sempre 2 (as duas ações da forma segura)
    pa: tipo === 'alcancar' ? REACH_TARGET : storedInt(entry.pa, 1, MAX_TARGET, DEFAULT_TARGET),
    dt: storedInt(entry.dt, MIN_DT, MAX_DT, DEFAULT_DT),
    // Escalar, alcançar e sustentar são sempre individuais: cada um tenta (e falha) sozinho
    modo: INDIVIDUAL_TYPES.includes(tipo)
      ? 'individual'
      : pick(entry.modo, CHALLENGE_MODES, 'individual'),
    dtRapida: storedInt(entry.dtRapida, MIN_DT, MAX_DT, DEFAULT_FAST_DT),
    dtCautelosa: storedInt(entry.dtCautelosa, MIN_DT, MAX_DT, DEFAULT_CAREFUL_DT),
    custoPv: storedInt(entry.custoPv, 0, MAX_COST, 0),
    somaPassar: pick(entry.somaPassar, ON_PASS, 'ra'),
    somaFalhar: pick(entry.somaFalhar, ON_FAIL, 'nada'),
    revelarPa: entry.revelarPa !== false,
    ativo: entry.ativo !== false,
    total: storedInt(entry.total, 0, MAX_POINTS, 0),
    participantes: normalizeParticipants(entry.participantes).slice(
      0,
      tipo === 'sustentar' ? 1 : MAX_PARTICIPANTS,
    ),
  };
}

/** A configuração inteira limpa: `{desafios: [...]}`, sem ids repetidos. */
export function normalizeChallenges(raw) {
  const seen = new Set();
  const desafios = [];
  for (const entry of Array.isArray(raw?.desafios) ? raw.desafios : []) {
    const challenge = normalizeChallenge(entry);
    if (!challenge || seen.has(challenge.id) || desafios.length >= MAX_CHALLENGES) continue;
    seen.add(challenge.id);
    desafios.push(challenge);
  }
  return { desafios };
}

/** Padrões de cada tipo (o resto vem de `normalizeChallenge`). */
const TYPE_PRESETS = {
  estendido: {},
  arrombar: { somaPassar: 'ra', somaFalhar: 'nada', custoPv: 1 },
  escalar: { modo: 'individual', pa: DEFAULT_TARGET },
  alcancar: { modo: 'individual', pa: REACH_TARGET },
  sustentar: { modo: 'individual', custoPv: 1 },
  equilibrio: { modo: 'individual', pa: DEFAULT_BALANCE_ROUNDS },
};

/**
 * Um desafio novo com os padrões do tipo. Teste estendido: PA 10, DT 7, individual, RA ao passar.
 * Arrombar: o mesmo, com 1 PV por teste. Escalar: PA 10, rápida DT 8 e cautelosa DT 6.
 * Alcançar: DT 7 (a arriscada, 10). Sustentar: DT 7 e 1 PV para começar. Equilíbrio: 3 rodadas
 * para atravessar.
 */
export function newChallenge(id, nome, tipo = 'estendido') {
  const kind = pick(tipo, CHALLENGE_TYPES, 'estendido');
  return normalizeChallenge({ id, nome, tipo: kind, ...TYPE_PRESETS[kind] });
}

/** Troca um desafio da lista pela versão nova (mesmo id). */
export function replaceChallenge(data, challenge) {
  return {
    desafios: data.desafios.map((entry) => (entry.id === challenge.id ? challenge : entry)),
  };
}

/** Tira um desafio da lista. */
export function removeChallenge(data, id) {
  return { desafios: data.desafios.filter((entry) => entry.id !== id) };
}

/** Acrescenta um desafio (no fim), se ainda couber. */
export function appendChallenge(data, challenge) {
  if (data.desafios.length >= MAX_CHALLENGES) return data;
  return { desafios: [...data.desafios, challenge] };
}

/**
 * Edita um campo de configuração digitado ou escolhido pelo mestre. Valor inválido (texto vazio,
 * opção desconhecida) devolve o desafio sem mudança.
 * @param {object} challenge Desafio limpo.
 * @param {string} campo nome, pa, dt, dtRapida, dtCautelosa, custoPv, modo, somaPassar, somaFalhar,
 *   revelarPa ou ativo. Na escalada o modo não muda (é sempre individual).
 * @param {unknown} raw Valor do campo (texto, ou booleano nas caixas de marcar).
 */
export function updateChallengeField(challenge, campo, raw) {
  switch (campo) {
    case 'nome':
      return { ...challenge, nome: cleanName(raw) };
    case 'pa': {
      if (challenge.tipo === 'alcancar') return challenge;
      const value = parseInteger(raw);
      return value === null ? challenge : { ...challenge, pa: clampInt(value, 1, MAX_TARGET) };
    }
    case 'dt': {
      const value = parseInteger(raw);
      return value === null ? challenge : { ...challenge, dt: clampInt(value, MIN_DT, MAX_DT) };
    }
    case 'dtRapida':
    case 'dtCautelosa': {
      const value = parseInteger(raw);
      return value === null
        ? challenge
        : { ...challenge, [campo]: clampInt(value, MIN_DT, MAX_DT) };
    }
    case 'custoPv': {
      const value = parseInteger(raw);
      return value === null ? challenge : { ...challenge, custoPv: clampInt(value, 0, MAX_COST) };
    }
    case 'modo':
      if (INDIVIDUAL_TYPES.includes(challenge.tipo)) return challenge;
      return CHALLENGE_MODES.includes(raw) ? { ...challenge, modo: raw } : challenge;
    case 'somaPassar':
      return ON_PASS.includes(raw) ? { ...challenge, somaPassar: raw } : challenge;
    case 'somaFalhar':
      return ON_FAIL.includes(raw) ? { ...challenge, somaFalhar: raw } : challenge;
    case 'revelarPa':
    case 'ativo':
      return typeof raw === 'boolean' ? { ...challenge, [campo]: raw } : challenge;
    default:
      return challenge;
  }
}

/** Ids dos atores que já participam. */
export const participantIds = (challenge) => challenge.participantes.map((entry) => entry.actorId);

/** Acrescenta participantes (ignora os repetidos e o que passar do limite), com 0 pontos. */
export function addParticipants(challenge, actorIds) {
  const taken = new Set(participantIds(challenge));
  const participantes = [...challenge.participantes];
  // Sustentar: um só segura o objeto
  const limit = challenge.tipo === 'sustentar' ? 1 : MAX_PARTICIPANTS;
  for (const raw of Array.isArray(actorIds) ? actorIds : []) {
    const actorId = typeof raw === 'string' ? raw.trim() : '';
    if (!actorId || taken.has(actorId) || participantes.length >= limit) continue;
    taken.add(actorId);
    participantes.push({ actorId, pontos: 0 });
  }
  return { ...challenge, participantes };
}

/** Tira um participante. */
export function removeParticipant(challenge, actorId) {
  return {
    ...challenge,
    participantes: challenge.participantes.filter((entry) => entry.actorId !== actorId),
  };
}

/**
 * Pontos atuais de quem soma: no modo grupo é o total compartilhado (o ator não importa); no
 * modo individual são os pontos do participante (ou `null` se ele não participa).
 */
export function currentPoints(challenge, actorId) {
  if (challenge.modo === 'grupo') return challenge.total;
  return challenge.participantes.find((entry) => entry.actorId === actorId)?.pontos ?? null;
}

/**
 * Grava uma pontuação nova (já calculada). No modo grupo muda o total; no individual, os pontos
 * do participante. Fica sempre entre 0 e o limite.
 * @param {object} challenge
 * @param {string|null} actorId Participante (ignorado no modo grupo).
 * @param {number} value
 */
export function setPoints(challenge, actorId, value) {
  if (!Number.isFinite(value)) return challenge;
  // Alcançar: no máximo 2 (alcançou)
  const next = clampInt(value, 0, challenge.tipo === 'alcancar' ? REACH_TARGET : MAX_POINTS);
  if (challenge.modo === 'grupo') return { ...challenge, total: next };
  if (!challenge.participantes.some((entry) => entry.actorId === actorId)) return challenge;
  return {
    ...challenge,
    participantes: challenge.participantes.map((entry) =>
      entry.actorId === actorId ? { ...entry, pontos: next } : entry,
    ),
  };
}

/** Soma (ou subtrai) pontos: botões −/+ e, na próxima versão, o botão do cartão do teste. */
export function adjustPoints(challenge, actorId, delta) {
  const current = currentPoints(challenge, actorId);
  if (current === null || !Number.isFinite(delta)) return challenge;
  return setPoints(challenge, actorId, current + Math.trunc(delta));
}

/** Pontos digitados pelo mestre (texto vazio ou inválido não muda nada). */
export function typePoints(challenge, actorId, raw) {
  const value = parseInteger(raw);
  return value === null ? challenge : setPoints(challenge, actorId, value);
}

/**
 * O desafio está concluído? No modo grupo, quando o total chega à PA; no individual, quando todos
 * os participantes (pelo menos um) chegam.
 */
export function isCompleted(challenge) {
  // Sustentar não termina por pontos: dura enquanto o personagem aguentar
  if (challenge.tipo === 'sustentar') return false;
  if (challenge.modo === 'grupo') return challenge.total >= challenge.pa;
  return (
    challenge.participantes.length > 0 &&
    challenge.participantes.every((entry) => entry.pontos >= challenge.pa)
  );
}

/** Desafios que a pessoa vê: o mestre vê todos; o jogador, só os ativos. */
export function visibleChallenges(data, { isGM }) {
  return data.desafios.filter((challenge) => isGM || challenge.ativo);
}

/** A pessoa pode ver a PA alvo? (o mestre sempre; o jogador, se o mestre revelou) */
export const targetVisible = (challenge, { isGM }) => Boolean(isGM || challenge.revelarPa);

/**
 * O que a guia e a janela mostram de um desafio.
 * @param {object} challenge Desafio limpo.
 * @param {{isGM: boolean, actorInfo: (id: string) => ({name: string, img?: string}|null)}} options
 *   `actorInfo` devolve o nome (e a imagem) de um ator, ou `null` se ele não existe mais.
 */
export function challengeView(challenge, { isGM, actorInfo }) {
  // Sustentar não tem PA (conta rodadas)
  const showTarget = challenge.tipo !== 'sustentar' && targetVisible(challenge, { isGM });
  const grupo = challenge.modo === 'grupo';
  return {
    id: challenge.id,
    tipo: challenge.tipo,
    escalar: challenge.tipo === 'escalar',
    alcancar: challenge.tipo === 'alcancar',
    sustentar: challenge.tipo === 'sustentar',
    equilibrio: challenge.tipo === 'equilibrio',
    // A janela mostra a PA editável (não no alcançar, fixa em 2, nem no sustentar, sem PA) e os
    // campos livres de modo e soma (só no teste estendido e no arrombar)
    temPa: !['alcancar', 'sustentar'].includes(challenge.tipo),
    livre: !INDIVIDUAL_TYPES.includes(challenge.tipo),
    nome: challenge.nome,
    semNome: challenge.nome === '',
    pa: showTarget ? challenge.pa : null,
    mostrarPa: showTarget,
    dt: challenge.dt,
    dtRapida: challenge.dtRapida,
    dtCautelosa: challenge.dtCautelosa,
    custoPv: challenge.custoPv,
    dtArriscada: Math.min(MAX_DT, challenge.dt + RISKY_DT_BONUS),
    modo: challenge.modo,
    grupo,
    somaPassar: challenge.somaPassar,
    somaFalhar: challenge.somaFalhar,
    revelarPa: challenge.revelarPa,
    ativo: challenge.ativo,
    total: challenge.total,
    totalChegou: grupo && challenge.total >= challenge.pa,
    // Só o mestre sabe que terminou quando a PA está escondida (o selo entregaria o alvo)
    concluido: showTarget && isCompleted(challenge),
    participantes: challenge.participantes.map((entry) => {
      const info = actorInfo(entry.actorId);
      return {
        actorId: entry.actorId,
        name: info?.name ?? '',
        img: info?.img ?? '',
        missing: !info,
        pontos: entry.pontos,
        // Equilíbrio: d4 que restam (`null` = reserva cheia, calculada da Acrobacia ao usar)
        reserva: entry.reserva ?? null,
        reservaCheia: entry.reserva === undefined,
        chegou:
          showTarget && !grupo && challenge.tipo !== 'sustentar' && entry.pontos >= challenge.pa,
      };
    }),
    // Sustentar só tem um participante: o botão de acrescentar some quando ele já está lá
    lotado: challenge.tipo === 'sustentar' && challenge.participantes.length >= 1,
  };
}

/**
 * Cartão da ficha: os desafios ativos de que este personagem participa (lista vazia = cartão
 * escondido).
 * @returns {{id: string, nome: string, semNome: boolean, grupo: boolean, pontos: number,
 *   pa: number|null, chegou: boolean}[]}
 */
export function sheetChallenges(data, actorId, { isGM }) {
  if (!actorId) return [];
  return data.desafios
    .filter(
      (challenge) =>
        challenge.ativo && challenge.participantes.some((entry) => entry.actorId === actorId),
    )
    .map((challenge) => {
      const showTarget = targetVisible(challenge, { isGM });
      const pontos = currentPoints(challenge, actorId) ?? 0;
      const sustentar = challenge.tipo === 'sustentar';
      return {
        id: challenge.id,
        nome: challenge.nome,
        semNome: challenge.nome === '',
        tipo: challenge.tipo,
        alcancar: challenge.tipo === 'alcancar',
        equilibrio: challenge.tipo === 'equilibrio',
        sustentar,
        grupo: challenge.modo === 'grupo',
        pontos,
        pa: showTarget && !sustentar ? challenge.pa : null,
        chegou: showTarget && !sustentar && pontos >= challenge.pa,
      };
    });
}

/** Personagens que ainda podem entrar no desafio, em ordem alfabética. */
export function addableChallengeActors(candidates, challenge) {
  const taken = new Set(participantIds(challenge));
  return candidates
    .filter((actor) => !taken.has(actor.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

/**
 * Onde a guia nova entra na barra lateral: logo depois de «scenes». Devolve as chaves na ordem
 * nova (sem mexer no objeto). Se «scenes» não existir, a guia vai antes de «settings» (ou no fim).
 */
export function sidebarOrder(keys, newKey, after = 'scenes') {
  const rest = keys.filter((key) => key !== newKey);
  let index = rest.indexOf(after);
  if (index >= 0) index += 1;
  else {
    index = rest.indexOf('settings');
    if (index < 0) index = rest.length;
  }
  return [...rest.slice(0, index), newKey, ...rest.slice(index)];
}

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
export function challengeTestChoices(data, actorId) {
  if (!actorId) return [];
  return data.desafios
    .filter(
      (challenge) =>
        challenge.ativo && challenge.participantes.some((entry) => entry.actorId === actorId),
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
    // Rápida soma a RA, cautelosa a RB; falhar é queda (dano = pontos acumulados, e zera)
    Object.assign(rules, {
      somaPassar: approach === 'cautelosa' ? 'rb' : 'ra',
      somaFalhar: 'nada',
      falha: 'queda',
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
  if (kind === 'queda') return { ...applyFall(challenge, flag.actorId), kind };
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
 * Queda da escalada (o mestre, ao clicar em «aplicar queda»): o dano é igual aos pontos que o
 * personagem tinha acumulado, e os pontos voltam a 0. `null` se o desafio não está ativo ou o
 * personagem saiu dele.
 * @returns {{challenge: object, dano: number}|null}
 */
export function applyFall(challenge, actorId) {
  if (!challenge?.ativo) return null;
  const entry = challenge.participantes.find((item) => item.actorId === actorId);
  if (!entry) return null;
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
 * @param {{canApply: boolean, claimable: boolean, busy: boolean, challenge: object|null}} viewer
 *   `claimable` e `busy` vêm da reserva do botão (veja `isAdvanceClaimable` em chase.js).
 */
export function challengeBarView(flag, result, { canApply, claimable, busy, challenge }) {
  const pontos = challengeTestGain(result, flag);
  const failed = !challengeTestSuccess(result, flag.dt);
  const falha = failed ? failureKind(flag) : null;
  const queda = falha === 'queda';
  const atuais = challenge
    ? (challenge.participantes.find((entry) => entry.actorId === flag.actorId)?.pontos ?? 0)
    : 0;
  // Dano mostrado antes do clique: na queda, os pontos de agora; no alcançar, a RB ou a RA
  let dano = 0;
  if (falha === 'queda') dano = atuais;
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

// ---------------------------------------------------------------------------------------------
// Equilíbrio (0.18.5): a reserva de dados de equilíbrio de cada participante e o fim de cada
// rodada (equilibrou: soma uma; caiu: zera e recarrega). O cartão do chat está em balance.js.
// ---------------------------------------------------------------------------------------------

/** Tamanho da reserva: metade da Acrobacia (d4: 2, d6: 3, d8: 4, d10: 5, d12: 6). */
export function balanceReserveSize(acrobaciaDie) {
  const sides = Math.trunc(Number(acrobaciaDie) || 0);
  return clampInt(Math.floor(sides / 2), 0, MAX_BALANCE_DICE);
}

/** d4 que restam ao participante (a reserva cheia, se ele ainda não gastou nenhum). */
export function participantReserve(challenge, actorId, acrobaciaDie) {
  const entry = challenge?.participantes.find((item) => item.actorId === actorId);
  if (!entry) return 0;
  return entry.reserva ?? balanceReserveSize(acrobaciaDie);
}

/** Grava a reserva (`null` = volta a ficar cheia). */
export function setReserve(challenge, actorId, value) {
  return {
    ...challenge,
    participantes: challenge.participantes.map((entry) => {
      if (entry.actorId !== actorId) return entry;
      const rest = { actorId: entry.actorId, pontos: entry.pontos };
      return value === null ? rest : { ...rest, reserva: clampInt(value, 0, MAX_BALANCE_DICE) };
    }),
  };
}

/** Reserva digitada pelo mestre: número, ou vazio para voltar a ficar cheia. */
export function typeReserve(challenge, actorId, raw) {
  if (String(raw ?? '').trim() === '') return setReserve(challenge, actorId, null);
  const value = parseInteger(raw);
  return value === null ? challenge : setReserve(challenge, actorId, value);
}

/** Gasta um d4 da reserva (o mestre, ao atender o botão). `null` se não há d4 ou participante. */
export function spendBalanceDie(challenge, actorId, acrobaciaDie) {
  if (!challenge?.ativo) return null;
  if (!challenge.participantes.some((entry) => entry.actorId === actorId)) return null;
  const left = participantReserve(challenge, actorId, acrobaciaDie);
  if (left <= 0) return null;
  return setReserve(challenge, actorId, left - 1);
}

/**
 * Rodada equilibrada: soma uma rodada. Ao completar a travessia, a reserva volta a ficar cheia
 * (para a próxima). `null` se o desafio não está ativo ou o personagem saiu dele.
 * @returns {{challenge: object, depois: number, atravessou: boolean}|null}
 */
export function registerBalanceRound(challenge, actorId) {
  if (!challenge?.ativo) return null;
  if (!challenge.participantes.some((entry) => entry.actorId === actorId)) return null;
  const next = adjustPoints(challenge, actorId, 1);
  const depois = currentPoints(next, actorId);
  const atravessou = depois >= challenge.pa;
  return { challenge: atravessou ? setReserve(next, actorId, null) : next, depois, atravessou };
}

/** Caiu: as rodadas zeram e a reserva volta a ficar cheia (a travessia recomeça). */
export function applyBalanceFall(challenge, actorId) {
  if (!challenge?.ativo) return null;
  if (!challenge.participantes.some((entry) => entry.actorId === actorId)) return null;
  return setReserve(setPoints(challenge, actorId, 0), actorId, null);
}
