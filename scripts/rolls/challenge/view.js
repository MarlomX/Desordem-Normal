/**
 * Descida da escalada, conclusão, visibilidade e o que a guia, a janela e a ficha mostram.
 * Parte de `challenge.js` (v0.28.7). Lógica pura, sem Foundry.
 */
import {
  attemptsLeft,
  lockComposition,
  lockStatus,
  maximumVisible,
  unlimitedAttempts,
} from '../lock.js';
import {
  INDIVIDUAL_TYPES,
  MAX_DT,
  RISKY_DT_BONUS,
  adjustPoints,
  currentPoints,
  parseInteger,
  participantIds,
  setPoints,
  typePoints,
} from './model.js';

// ---------- Descida (v0.27.1) ----------

/** O desafio é uma escalada para baixo? */
export const isDescent = (challenge) =>
  challenge?.tipo === 'escalar' && challenge.sentido === 'descer';

/** Altura que ainda falta na descida: a PA menos o progresso (nunca abaixo de 0). */
export const climbHeight = (challenge, pontos) =>
  Math.max(0, challenge.pa - Math.max(0, Math.trunc(Number(pontos) || 0)));

/**
 * O número que as telas mostram para um participante. Na descida, a altura que falta, se a pessoa
 * pode ver a PA (`targetVisible`); senão, quanto ele já desceu (a altura entregaria a PA). Nos
 * outros desafios, os pontos guardados.
 * @param {object} challenge
 * @param {number} pontos Progresso guardado do participante.
 * @param {{isGM: boolean}} viewer
 */
export function shownPoints(challenge, pontos, { isGM }) {
  if (!isDescent(challenge) || !targetVisible(challenge, { isGM })) return pontos;
  return climbHeight(challenge, pontos);
}

/**
 * Chave da unidade mostrada ao lado dos pontos (`DESORDEM.Desafio.Unidade.<chave>`): o tipo do
 * desafio; na descida, «descer» (altura que falta) ou, com a PA escondida, «descerOculto» (quanto
 * já desceu).
 */
export function unitKey(challenge, { isGM }) {
  if (!isDescent(challenge)) return challenge.tipo;
  return targetVisible(challenge, { isGM }) ? 'descer' : 'descerOculto';
}

/**
 * Pontos digitados pelo mestre na janela do desafio. Na descida ele digita a altura que falta
 * (é o número que a janela mostra), convertida em progresso (PA − altura).
 */
export function typeShownPoints(challenge, actorId, raw) {
  if (!isDescent(challenge)) return typePoints(challenge, actorId, raw);
  const value = parseInteger(raw);
  return value === null ? challenge : setPoints(challenge, actorId, challenge.pa - value);
}

/** Botões −/+ da janela: na descida, agem na altura mostrada (− desce, + sobe de volta). */
export function adjustShownPoints(challenge, actorId, delta) {
  return adjustPoints(challenge, actorId, isDescent(challenge) ? -delta : delta);
}

/**
 * O desafio está concluído? No modo grupo, quando o total chega à PA; no individual, quando todos
 * os participantes (pelo menos um) chegam.
 */
export function isCompleted(challenge) {
  // Sustentar não termina por pontos: dura enquanto o personagem aguentar
  if (challenge.tipo === 'sustentar') return false;
  // Destrancar: quando a senha certa foi tentada
  if (challenge.tipo === 'destrancar') return lockStatus(challenge.fechadura) === 'destrancada';
  if (challenge.modo === 'grupo') return challenge.total >= challenge.pa;
  return (
    challenge.participantes.length > 0 &&
    challenge.participantes.every((entry) => entry.pontos >= challenge.pa)
  );
}

/** Desafios que a pessoa vê: o mestre vê todos; o jogador, só os ativos. */
export function visibleChallenges(data, { isGM, ownedActorIds = [] }) {
  return data.desafios.filter((challenge) =>
    challengeVisibleTo(challenge, { isGM, ownedActorIds }),
  );
}

/**
 * O desafio aparece para esta pessoa? O mestre vê todos. O jogador vê só os ativos, e conforme a
 * visibilidade: «todos»; «participantes», se controla algum personagem do desafio; nunca «mestre».
 * @param {{isGM: boolean, ownedActorIds?: string[]}} viewer `ownedActorIds`: ids dos atores
 *   de que o jogador é dono.
 */
export function challengeVisibleTo(challenge, { isGM, ownedActorIds = [] }) {
  if (isGM) return true;
  if (!challenge?.ativo || challenge.visibilidade === 'mestre') return false;
  if (challenge.visibilidade !== 'participantes') return true;
  const owned = new Set(ownedActorIds);
  return challenge.participantes.some((entry) => owned.has(entry.actorId));
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
  // Sustentar não tem PA (conta rodadas); destrancar conta tentativas (mostradas à parte)
  const showTarget =
    !['sustentar', 'destrancar'].includes(challenge.tipo) && targetVisible(challenge, { isGM });
  const grupo = challenge.modo === 'grupo';
  return {
    id: challenge.id,
    tipo: challenge.tipo,
    escalar: challenge.tipo === 'escalar',
    // Escalada para baixo: a janela mostra a altura que falta (v0.27.1)
    descer: isDescent(challenge),
    sentido: challenge.sentido ?? null,
    // Chave da unidade dos pontos (`DESORDEM.Desafio.Unidade.<chave>`)
    unidadeChave: unitKey(challenge, { isGM }),
    alcancar: challenge.tipo === 'alcancar',
    sustentar: challenge.tipo === 'sustentar',
    equilibrio: challenge.tipo === 'equilibrio',
    // A janela mostra a PA editável (não no alcançar, fixa em 2, nem no sustentar, sem PA) e os
    // campos livres de modo e soma (só no teste estendido e no arrombar)
    temPa: !['alcancar', 'sustentar', 'destrancar'].includes(challenge.tipo),
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
    visibilidade: challenge.visibilidade,
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
        // Na descida, a altura que falta (ou o quanto desceu, com a PA escondida)
        pontos: shownPoints(challenge, entry.pontos, { isGM }),
        // Equilíbrio: d4 que restam (`null` = reserva cheia, calculada da Acrobacia ao usar)
        reserva: entry.reserva ?? null,
        reservaCheia: entry.reserva === undefined,
        chegou:
          showTarget && !grupo && challenge.tipo !== 'sustentar' && entry.pontos >= challenge.pa,
      };
    }),
    // Sustentar só tem um participante: o botão de acrescentar some quando ele já está lá
    lotado: challenge.tipo === 'sustentar' && challenge.participantes.length >= 1,
    // Destrancar: os participantes não têm pontos (as tentativas são do grupo)
    semPontos: challenge.tipo === 'destrancar',
    destrancar: challenge.tipo === 'destrancar',
    fechadura:
      challenge.tipo === 'destrancar'
        ? {
            ...challenge.fechadura,
            status: lockStatus(challenge.fechadura),
            restantes: attemptsLeft(challenge.fechadura),
            temSenha: challenge.fechadura.senhaMsg !== '',
            composicao: lockComposition(challenge.fechadura),
            infinito: unlimitedAttempts(challenge.fechadura),
            // Máximo escondido dos jogadores (ou infinito): só as tentativas usadas aparecem
            maximoVisivel: maximumVisible(challenge.fechadura, { isGM }),
          }
        : null,
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
        challenge.ativo &&
        (isGM || challenge.visibilidade !== 'mestre') &&
        challenge.participantes.some((entry) => entry.actorId === actorId),
    )
    .map((challenge) => {
      const showTarget = targetVisible(challenge, { isGM });
      const pontos = currentPoints(challenge, actorId) ?? 0;
      const sustentar = challenge.tipo === 'sustentar';
      const base = {
        id: challenge.id,
        nome: challenge.nome,
        semNome: challenge.nome === '',
        tipo: challenge.tipo,
        alcancar: challenge.tipo === 'alcancar',
        equilibrio: challenge.tipo === 'equilibrio',
        destrancar: challenge.tipo === 'destrancar',
        sustentar,
        grupo: challenge.modo === 'grupo',
        unidadeChave: challenge.tipo,
      };
      if (challenge.tipo === 'destrancar') {
        // Destrancar: as tentativas do grupo (usadas / máximo) e o botão de tentar enquanto aberta
        const status = lockStatus(challenge.fechadura);
        return {
          ...base,
          pontos: challenge.fechadura.usadas,
          pa: maximumVisible(challenge.fechadura, { isGM }) ? challenge.fechadura.maximo : null,
          chegou: status === 'destrancada',
          estragou: status === 'estragada',
          podeTentar: status === 'aberta',
        };
      }
      return {
        ...base,
        // Na descida, a altura que falta (ou o quanto desceu, com a PA escondida)
        pontos: shownPoints(challenge, pontos, { isGM }),
        pa: showTarget && !sustentar ? challenge.pa : null,
        chegou: showTarget && !sustentar && pontos >= challenge.pa,
        unidadeChave: unitKey(challenge, { isGM }),
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
