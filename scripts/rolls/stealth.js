/**
 * Furtividade: lógica pura (sem dependência do Foundry).
 *
 * Nesta versão (0.17.0, esqueleto) existem o ciclo de vida da cena, a lista de participantes e os
 * dados de esconderijo de cada um, editados à mão (acrescentar um dado, descartar um dado). O
 * teste de esconderijo, a procura das criaturas e as ações especiais chegam nas próximas versões.
 *
 * Ciclo de vida (igual ao da perseguição): preparação (ativa: false, rodada 0) --iniciar--> em
 * andamento (ativa: true, rodada 1) --encerrar--> volta à preparação. Só uma cena por vez.
 *
 * As regras de acesso (quem cria, quem abre, quando a janela abre sozinha) são as mesmas da
 * perseguição: `chaseAccess`, `trackerAction`, `shouldAutoOpen` e `addableActors` de chase.js
 * servem às duas cenas.
 */

/** Subtipos do encontro (Combat) e do participante (Combatant) registrados no system.json. */
export const STEALTH_COMBAT_TYPE = 'furtividade';
export const STEALTH_COMBATANT_TYPE = 'furtivo';

/** Lados aceitos num dado de esconderijo (os dados que um teste pode rolar). */
export const HIDE_DIE_SIDES = Object.freeze([4, 6, 8, 10, 12, 20]);

/**
 * Teto técnico de dados de esconderijo por personagem. Um teste rola no máximo 4 dados, mas
 * esconder-se e distrair acrescentam outros; 12 cobre qualquer cena sem permitir números absurdos.
 */
export const MAX_HIDE_DICE = 12;

/** Rodada máxima aceita ao mudar a rodada na mão. */
export const STEALTH_MAX_ROUND = 99;

/** Estado de uma cena recém-criada: em preparação, sem rodada. */
export function initialStealthState() {
  return { ativa: false, rodadaAtual: 0 };
}

/** Estado ao iniciar a cena: ativa, na rodada 1. */
export function stealthStartState() {
  return { ativa: true, rodadaAtual: 1 };
}

/** Estado ao encerrar a cena: volta à preparação. */
export function stealthEndState() {
  return { ativa: false, rodadaAtual: 0 };
}

/** Situação de um participante ao iniciar ou encerrar a cena: sem dados e sem teste feito. */
export function stealthParticipantReset() {
  return { esconderijo: [], escondeu: false };
}

/** Próxima rodada (sem passar do teto). */
export function stealthNextRound(round) {
  return { rodadaAtual: Math.min(STEALTH_MAX_ROUND, Math.max(0, Math.trunc(round) || 0) + 1) };
}

/**
 * Rodada escolhida na mão (botões −/+ ou valor digitado). Vazio, texto ou fora de 1..99 não vale.
 * @param {number} current Rodada atual.
 * @param {{raw?: string|number, delta?: number}} change
 * @returns {{valid: boolean, value?: number}}
 */
export function stealthRoundChange(current, { raw, delta } = {}) {
  if (delta !== undefined) {
    const value = Math.min(STEALTH_MAX_ROUND, Math.max(1, (Math.trunc(current) || 0) + delta));
    return { valid: true, value };
  }
  // Texto vazio viraria 0 em Number(''): é tratado à parte, como inválido
  if (raw === null || raw === undefined || String(raw).trim() === '') return { valid: false };
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > STEALTH_MAX_ROUND) return { valid: false };
  return { valid: true, value };
}

/**
 * Um dado de esconderijo válido ({lados, valor}) ou `null`. Os lados precisam ser um dos dados do
 * jogo e o valor um inteiro de 1 até os lados. Aceita texto vindo de campos (`"8"`).
 */
export function normalizeHideDie(die) {
  if (!die || typeof die !== 'object') return null;
  if (die.lados === '' || die.valor === '' || die.lados == null || die.valor == null) return null;
  const lados = Number(die.lados);
  const valor = Number(die.valor);
  if (!HIDE_DIE_SIDES.includes(lados)) return null;
  if (!Number.isInteger(valor) || valor < 1 || valor > lados) return null;
  return { lados, valor };
}

/** Só os dados válidos de uma lista (dados guardados mal formados são ignorados). */
export function cleanHideDice(list) {
  if (!Array.isArray(list)) return [];
  return list.map(normalizeHideDie).filter(Boolean).slice(0, MAX_HIDE_DICE);
}

/**
 * Aplica uma operação sobre os dados de esconderijo de um participante. Nunca altera a lista
 * recebida. As operações vêm da janela (ou de um jogador, pelo socket), então tudo é conferido.
 * - `{type: 'add', lados, valor}`: acrescenta um dado (até o teto).
 * - `{type: 'remove', index}`: descarta o dado daquela posição.
 * @param {{lados: number, valor: number}[]} list Dados atuais.
 * @param {object} op
 * @returns {{valid: boolean, list: {lados: number, valor: number}[], reason?: string}}
 *   `reason`: 'dado' (dado inválido), 'cheio' (teto atingido), 'indice' ou 'operacao'.
 */
export function applyHideOp(list, op) {
  const current = cleanHideDice(list);
  if (op?.type === 'add') {
    const die = normalizeHideDie(op);
    if (!die) return { valid: false, list: current, reason: 'dado' };
    if (current.length >= MAX_HIDE_DICE) return { valid: false, list: current, reason: 'cheio' };
    return { valid: true, list: [...current, die] };
  }
  if (op?.type === 'remove') {
    // Vazio viraria 0 em Number('') e descartaria o primeiro dado: é tratado à parte
    const blank = op.index === null || op.index === undefined || String(op.index).trim() === '';
    const index = blank ? NaN : Number(op.index);
    if (!Number.isInteger(index) || index < 0 || index >= current.length) {
      return { valid: false, list: current, reason: 'indice' };
    }
    return { valid: true, list: current.filter((_, position) => position !== index) };
  }
  return { valid: false, list: current, reason: 'operacao' };
}

/**
 * Operação limpa para mandar pelo socket: só os campos esperados, como números. O mestre ainda
 * confere tudo de novo em `applyHideOp` antes de gravar.
 * @returns {object|null} `null` se não for uma operação conhecida.
 */
export function sanitizeHideOp(op) {
  if (op?.type === 'add') return { type: 'add', lados: Number(op.lados), valor: Number(op.valor) };
  if (op?.type === 'remove') {
    // Índice vazio vira `null` (inválido), não 0
    const blank = op.index === null || op.index === undefined || String(op.index).trim() === '';
    return { type: 'remove', index: blank ? null : Number(op.index) };
  }
  return null;
}

/**
 * Situação de um participante na cena.
 * - 'preparacao': a cena ainda não começou;
 * - 'aguardando': começou, mas o personagem ainda não registrou dados de esconderijo;
 * - 'escondido': tem pelo menos um dado;
 * - 'encontrado': já se escondeu e perdeu todos os dados.
 * @param {{ativa: boolean, escondeu: boolean, count: number}} params
 */
export function hideStatus({ ativa, escondeu, count }) {
  if (!ativa) return 'preparacao';
  if (count > 0) return 'escondido';
  return escondeu ? 'encontrado' : 'aguardando';
}

/**
 * Quem vê os VALORES dos dados de esconderijo de um participante. O mestre do Foundry é dono de
 * todos os personagens, então "ser dono" não basta: ele só vê depois de revelar (com confirmação
 * e aviso no chat). O jogador dono sempre vê os próprios dados.
 * @param {{isGM: boolean, isOwner: boolean, revealed: boolean}} params
 */
export function canSeeHideValues({ isGM, isOwner, revealed }) {
  if (isGM) return Boolean(revealed);
  return Boolean(isOwner);
}

/**
 * Quem pode acrescentar ou descartar dados à mão: o jogador dono (sempre) e o mestre só com os
 * dados daquele participante revelados (para não mexer às cegas).
 */
export function canEditHideDice({ isGM, isOwner, revealed, ativa }) {
  if (!ativa) return false;
  return canSeeHideValues({ isGM, isOwner, revealed });
}

/**
 * Dados de um participante prontos para a janela. A quantidade e a situação são públicas; os
 * valores só aparecem para quem pode vê-los (lista vazia para os demais).
 * @param {{ativa: boolean, escondeu: boolean, esconderijo: object[], isGM: boolean,
 *   isOwner: boolean, revealed: boolean}} params
 */
export function hideDiceView({ ativa, escondeu, esconderijo, isGM, isOwner, revealed }) {
  const dice = cleanHideDice(esconderijo);
  const visible = canSeeHideValues({ isGM, isOwner, revealed });
  return {
    count: dice.length,
    status: hideStatus({ ativa, escondeu, count: dice.length }),
    visible,
    canEdit: canEditHideDice({ isGM, isOwner, revealed, ativa }),
    dice: visible ? dice.map((die, index) => ({ ...die, index })) : [],
  };
}

/**
 * Patch gravado depois de uma operação: a lista nova e, ao acrescentar, a marca de que o
 * personagem já se escondeu (é ela que separa "aguardando" de "encontrado").
 */
export function hideOpPatch(op, list, escondeu) {
  return { esconderijo: list, escondeu: Boolean(escondeu) || op?.type === 'add' };
}

/**
 * Que mensagem do chat a operação gera: 'adicionou', 'descartou' ou 'encontrado' (descartou o
 * último dado). As mensagens mostram só quantidades, nunca valores.
 */
export function hideOpMessage(op, countAfter) {
  if (op?.type === 'add') return 'adicionou';
  if (op?.type === 'remove') return countAfter === 0 ? 'encontrado' : 'descartou';
  return null;
}
