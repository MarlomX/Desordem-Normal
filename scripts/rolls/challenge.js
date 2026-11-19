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

/** Tipos de desafio (só o teste estendido nesta versão). */
export const CHALLENGE_TYPES = Object.freeze(['estendido']);

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
    result.push({ actorId, pontos: storedInt(entry.pontos, 0, MAX_POINTS, 0) });
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
  return {
    id,
    tipo: pick(entry.tipo, CHALLENGE_TYPES, 'estendido'),
    nome: cleanName(entry.nome),
    pa: storedInt(entry.pa, 1, MAX_TARGET, DEFAULT_TARGET),
    dt: storedInt(entry.dt, MIN_DT, MAX_DT, DEFAULT_DT),
    modo: pick(entry.modo, CHALLENGE_MODES, 'individual'),
    somaPassar: pick(entry.somaPassar, ON_PASS, 'ra'),
    somaFalhar: pick(entry.somaFalhar, ON_FAIL, 'nada'),
    revelarPa: entry.revelarPa !== false,
    ativo: entry.ativo !== false,
    total: storedInt(entry.total, 0, MAX_POINTS, 0),
    participantes: normalizeParticipants(entry.participantes),
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

/** Um teste estendido novo com os padrões (PA 10, DT 7, individual, RA ao passar). */
export function newChallenge(id, nome) {
  return normalizeChallenge({ id, nome, tipo: 'estendido' });
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
 * @param {string} campo nome, pa, dt, modo, somaPassar, somaFalhar, revelarPa ou ativo.
 * @param {unknown} raw Valor do campo (texto, ou booleano nas caixas de marcar).
 */
export function updateChallengeField(challenge, campo, raw) {
  switch (campo) {
    case 'nome':
      return { ...challenge, nome: cleanName(raw) };
    case 'pa': {
      const value = parseInteger(raw);
      return value === null ? challenge : { ...challenge, pa: clampInt(value, 1, MAX_TARGET) };
    }
    case 'dt': {
      const value = parseInteger(raw);
      return value === null ? challenge : { ...challenge, dt: clampInt(value, MIN_DT, MAX_DT) };
    }
    case 'modo':
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
  for (const raw of Array.isArray(actorIds) ? actorIds : []) {
    const actorId = typeof raw === 'string' ? raw.trim() : '';
    if (!actorId || taken.has(actorId) || participantes.length >= MAX_PARTICIPANTS) continue;
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
  const next = clampInt(value, 0, MAX_POINTS);
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
  const showTarget = targetVisible(challenge, { isGM });
  const grupo = challenge.modo === 'grupo';
  return {
    id: challenge.id,
    tipo: challenge.tipo,
    nome: challenge.nome,
    semNome: challenge.nome === '',
    pa: showTarget ? challenge.pa : null,
    mostrarPa: showTarget,
    dt: challenge.dt,
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
        chegou: showTarget && !grupo && entry.pontos >= challenge.pa,
      };
    }),
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
      return {
        id: challenge.id,
        nome: challenge.nome,
        semNome: challenge.nome === '',
        grupo: challenge.modo === 'grupo',
        pontos,
        pa: showTarget ? challenge.pa : null,
        chegou: showTarget && pontos >= challenge.pa,
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
