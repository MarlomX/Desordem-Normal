/**
 * Equilíbrio: a reserva de dados de cada participante e o fim de cada rodada.
 * Parte de `challenge.js` (v0.28.7). Lógica pura, sem Foundry.
 */
import {
  MAX_BALANCE_DICE,
  adjustPoints,
  clampInt,
  currentPoints,
  parseInteger,
  setPoints,
} from './model.js';

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

/** Troca a fechadura de um desafio de destrancar (nos outros tipos, nada muda). */
export function withLock(challenge, change) {
  if (challenge?.tipo !== 'destrancar') return challenge;
  const next = change(challenge.fechadura);
  return next && next !== challenge.fechadura ? { ...challenge, fechadura: next } : challenge;
}
