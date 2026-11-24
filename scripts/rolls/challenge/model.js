/**
 * Desafios: tipos, limites, limpeza dos dados guardados, edições do mestre e pontos.
 * Parte de `challenge.js` (v0.28.7). Lógica pura, sem Foundry.
 */
import { normalizeLock } from '../lock.js';

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
  'destrancar',
]);

/**
 * Tipos sempre individuais (cada um por si): escalar, alcançar e sustentar. No alcançar a PA é
 * fixa em 2 (as duas ações da forma segura); no sustentar os pontos contam as rodadas sustentadas
 * e só cabe um participante (os outros ajudam pela ajuda da janela pré-teste).
 */
export const INDIVIDUAL_TYPES = Object.freeze([
  'escalar',
  'alcancar',
  'sustentar',
  'equilibrio',
  'destrancar',
]);

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
  destrancar: 'fa-key',
});

/**
 * Quem vê o desafio na guia: «todos» os jogadores, «participantes» (só quem controla um
 * personagem do desafio) ou «mestre» (ninguém além do mestre: para preparar antes da sessão).
 * Desafios novos começam em «participantes»; os das versões antigas, sem o campo, ficam em «todos».
 */
export const CHALLENGE_VISIBILITY = Object.freeze(['todos', 'participantes', 'mestre']);

/** Abordagens da escalada. */
export const CLIMB_APPROACHES = Object.freeze(['rapida', 'cautelosa']);

/**
 * Sentido da escalada (v0.27.1): «subir» (de 0 até a PA) ou «descer» (começa na altura, a PA, e
 * desce até 0). Os pontos guardados são sempre o progresso feito; na descida, a altura que falta
 * é a PA menos o progresso (`climbHeight`), e é ela que as telas mostram.
 */
export const CLIMB_DIRECTIONS = Object.freeze(['subir', 'descer']);

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

/** Inteiro entre `min` e `max` (uso interno de `challenge/`, não sai pelo barril). */
export const clampInt = (value, min, max) => Math.min(max, Math.max(min, Math.trunc(value)));

/** Número inteiro válido ou `null` (texto vazio NÃO vira 0: `Number('')` daria 0). */
export function parseInteger(raw) {
  const text = String(raw ?? '').trim();
  if (text === '' || !/^-?\d+$/.test(text)) return null;
  return Number(text);
}

/**
 * Lê um número de um valor guardado (já número ou texto); `fallback` se não for válido. Uso
 * interno de `challenge/`.
 */
export function storedInt(value, min, max, fallback) {
  const number = typeof value === 'number' ? value : parseInteger(value);
  return Number.isFinite(number) ? clampInt(number, min, max) : fallback;
}

/** O valor, se estiver entre os permitidos; senão `fallback` (uso interno de `challenge/`). */
export const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);

const cleanName = (value) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME);

/**
 * Teto dos pontos de um participante: no alcançar, 2 (alcançou); no escalar, a PA (subindo ou
 * descendo, ninguém passa da altura; v0.27.2); nos outros, o limite geral.
 */
export function pointsCap(challenge) {
  if (challenge.tipo === 'alcancar') return REACH_TARGET;
  if (challenge.tipo === 'escalar') return challenge.pa;
  return MAX_POINTS;
}

/** Limpa a lista de participantes: ids de texto, sem repetição, pontos dentro dos limites. */
function normalizeParticipants(list, cap = MAX_POINTS) {
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
      pontos: storedInt(entry.pontos, 0, cap, 0),
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
    visibilidade: pick(entry.visibilidade, CHALLENGE_VISIBILITY, 'todos'),
    ativo: entry.ativo !== false,
    total: storedInt(entry.total, 0, MAX_POINTS, 0),
    // Escalar: os pontos guardados nunca passam da PA (dados antigos ou PA diminuída depois)
    participantes: normalizeParticipants(
      entry.participantes,
      tipo === 'escalar' ? storedInt(entry.pa, 1, MAX_TARGET, DEFAULT_TARGET) : MAX_POINTS,
    ).slice(0, tipo === 'sustentar' ? 1 : MAX_PARTICIPANTS),
    // Escalar: subir ou descer (desafios antigos, sem o campo, sobem)
    ...(tipo === 'escalar' ? { sentido: pick(entry.sentido, CLIMB_DIRECTIONS, 'subir') } : {}),
    // Destrancar: a fechadura (dados, faces, tentativas; a senha fica num sussurro ao mestre)
    ...(tipo === 'destrancar' ? { fechadura: normalizeLock(entry.fechadura) } : {}),
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
  destrancar: { modo: 'individual' },
};

/**
 * Um desafio novo com os padrões do tipo. Teste estendido: PA 10, DT 7, individual, RA ao passar.
 * Arrombar: o mesmo, com 1 PV por teste. Escalar: PA 10, rápida DT 8 e cautelosa DT 6.
 * Alcançar: DT 7 (a arriscada, 10). Sustentar: DT 7 e 1 PV para começar. Equilíbrio: 3 rodadas
 * para atravessar.
 */
export function newChallenge(id, nome, tipo = 'estendido') {
  const kind = pick(tipo, CHALLENGE_TYPES, 'estendido');
  return normalizeChallenge({
    id,
    nome,
    tipo: kind,
    visibilidade: 'participantes',
    ...TYPE_PRESETS[kind],
  });
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
 *   sentido (só na escalada), revelarPa ou ativo. Na escalada o modo não muda (é sempre individual).
 * @param {unknown} raw Valor do campo (texto, ou booleano nas caixas de marcar).
 */
export function updateChallengeField(challenge, campo, raw) {
  switch (campo) {
    case 'nome':
      return { ...challenge, nome: cleanName(raw) };
    case 'pa': {
      if (challenge.tipo === 'alcancar') return challenge;
      const value = parseInteger(raw);
      if (value === null) return challenge;
      const next = { ...challenge, pa: clampInt(value, 1, MAX_TARGET) };
      // Escalar: diminuir a PA puxa para baixo quem já tinha mais pontos que a altura nova
      return challenge.tipo === 'escalar' ? normalizeChallenge(next) : next;
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
    case 'visibilidade':
      return CHALLENGE_VISIBILITY.includes(raw) ? { ...challenge, visibilidade: raw } : challenge;
    case 'sentido':
      // Só a escalada tem sentido (subir ou descer)
      return challenge.tipo === 'escalar' && CLIMB_DIRECTIONS.includes(raw)
        ? { ...challenge, sentido: raw }
        : challenge;
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
  // Alcançar: no máximo 2 (alcançou); escalar: no máximo a PA (a altura; v0.27.2)
  const next = clampInt(value, 0, pointsCap(challenge));
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
