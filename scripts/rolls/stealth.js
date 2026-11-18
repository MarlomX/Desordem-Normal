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

// ---------------------------------------------------------------------------------------------
// Teste de esconderijo (0.17.1)
//
// É uma opção da janela pré-teste («usar como teste de esconderijo»), oferecida só a quem ainda
// está «sem esconderijo». O teste não tem DT, não sofre o dado de pavor e vai para o chat como
// rolagem privada (só quem rolou vê). O resultado não é somado: os dados viram dados de
// esconderijo quando o jogador aperta o botão do cartão. Até lá, a Análise e a Prontidão podem
// mudar os valores, porque o botão lê os dados como o cartão os mostra no momento do clique.
// ---------------------------------------------------------------------------------------------

/** Quantos dados do teste viram dados de esconderijo (a norma do sistema: 3 valem). */
export const HIDE_TEST_KEEP = 3;

/** Tempo (ms) até uma reserva de clique parada deixar de bloquear o botão. */
export const HIDE_CLAIM_TIMEOUT_MS = 30_000;

/**
 * A janela pré-teste deve oferecer o teste de esconderijo? Só com a cena em andamento, para um
 * participante que ainda não se escondeu, num personagem que a pessoa controla.
 * @param {{ativa: boolean, isParticipant: boolean, isOwner: boolean, escondeu: boolean}} params
 */
export function canOfferHideTest({ ativa, isParticipant, isOwner, escondeu }) {
  return Boolean(ativa && isParticipant && isOwner && !escondeu);
}

/** Registro guardado na mensagem do teste de esconderijo (flag `esconderijo`). */
export function createHideFlag({ combatantId }) {
  return {
    combatantId,
    estado: 'pendente',
    reservadoEm: null,
    // Preenchidos quando os dados são guardados (só quantidades e valores do próprio cartão)
    dados: null,
    extra: null,
  };
}

const isStaleHideClaim = (flag, now) =>
  flag.estado === 'aplicando' && now - (flag.reservadoEm ?? 0) > HIDE_CLAIM_TIMEOUT_MS;

/** O botão pode ser usado agora? (pendente, ou reserva parada há tempo demais) */
export const isHideClaimable = (flag, now) =>
  flag?.estado === 'pendente' || isStaleHideClaim(flag ?? {}, now);

/** Reserva o clique (contra o duplo clique). `null` se já foi usado ou está em uso. */
export function reserveHide(flag, now) {
  if (!isHideClaimable(flag, now)) return null;
  return { ...flag, estado: 'aplicando', reservadoEm: now };
}

/** Conclui o clique: guarda os dados que viraram esconderijo e o dado extra do crítico. */
export function finishHide(flag, { dados, extra }) {
  return { ...flag, estado: 'aplicado', reservadoEm: null, dados, extra: extra ?? null };
}

/** Desfaz a reserva quando a gravação falhou, para o jogador poder tentar de novo. */
export function releaseHide(flag) {
  return { ...flag, estado: 'pendente', reservadoEm: null };
}

/**
 * Índices dos dados que ficam por padrão: todos, se o teste rolou até 3; com 4, os 3 maiores
 * valores (no empate, o que veio primeiro).
 * @param {number[]} values Valores rolados.
 * @returns {number[]} Índices em ordem crescente.
 */
export function defaultHideKeep(values) {
  const indices = values.map((_, index) => index);
  if (values.length <= HIDE_TEST_KEEP) return indices;
  return indices
    .sort((a, b) => values[b] - values[a] || a - b)
    .slice(0, HIDE_TEST_KEEP)
    .sort((a, b) => a - b);
}

/**
 * Confere a escolha do jogador de quais dados ficam. Até 3 dados rolados: ficam todos (a escolha é
 * ignorada). Com 4: precisa ser exatamente 3 índices diferentes e válidos.
 * @returns {number[]|null} Índices em ordem crescente, ou `null` se a escolha não vale.
 */
export function normalizeHideKeep(values, keep) {
  if (values.length <= HIDE_TEST_KEEP) return values.map((_, index) => index);
  if (!Array.isArray(keep)) return null;
  const chosen = [
    ...new Set(
      keep.filter((index) => index !== null && index !== '' && index !== undefined).map(Number),
    ),
  ];
  if (chosen.length !== HIDE_TEST_KEEP) return null;
  if (!chosen.every((index) => Number.isInteger(index) && index >= 0 && index < values.length)) {
    return null;
  }
  return chosen.sort((a, b) => a - b);
}

/** Dados de esconderijo a partir dos dados escolhidos do teste. */
export function hideDiceFromTest({ sides, values, keep }) {
  return keep.map((index) => ({ lados: sides[index], valor: values[index] })).map(normalizeHideDie);
}

/**
 * Lados do dado extra do crítico: o maior dado do teste (mecanicamente, sempre a melhor escolha).
 * Esse dado é uma exceção às regras de limite: entra mesmo que o teste já tenha rolado 4 dados.
 */
export function critExtraSides(sides) {
  const valid = sides.filter((value) => HIDE_DIE_SIDES.includes(value));
  return valid.length ? Math.max(...valid) : 0;
}

/**
 * O que a barra do cartão mostra.
 * @param {object} flag Registro do esconderijo da mensagem.
 * @param {{sides: number[], values: number[], critical: boolean}} test Dados como o cartão os
 *   mostra agora e se o teste é um sucesso crítico.
 * @param {{canApply: boolean, alreadyHidden: boolean, now: number}} viewer
 */
export function hideBarView(flag, { sides, values, critical }, { canApply, alreadyHidden, now }) {
  const applied = flag?.estado === 'aplicado';
  return {
    applied,
    appliedCount: applied ? (flag.dados?.length ?? 0) + (flag.extra ? 1 : 0) : 0,
    extra: applied ? flag.extra : null,
    busy: flag?.estado === 'aplicando' && !isStaleHideClaim(flag, now),
    mustChoose: values.length > HIDE_TEST_KEEP,
    keepCount: Math.min(values.length, HIDE_TEST_KEEP),
    critical: Boolean(critical),
    critSides: critical ? critExtraSides(sides) : 0,
    alreadyHidden: !applied && Boolean(alreadyHidden),
    showButton: Boolean(canApply) && !alreadyHidden && isHideClaimable(flag, now),
  };
}

/** Patch do participante ao guardar o teste de esconderijo (substitui a lista e marca escondeu). */
export function hideTestPatch(dice) {
  return { esconderijo: cleanHideDice(dice), escondeu: true };
}
