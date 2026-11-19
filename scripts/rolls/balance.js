/**
 * Equilíbrio (lógica pura, sem Foundry). Não é um teste de atributo + perícia: rola 2d10 e compara
 * os dois (não soma). Diferença de 0 ou 1: equilibra; de 2 ou mais: começa a cair. Caindo, o
 * personagem pode rolar um dado de equilíbrio (d4) da reserva e somar o valor a qualquer um dos
 * d10 — um de cada vez, podendo passar do outro e desequilibrar para o lado oposto. Não há pavor
 * nem crítico; a Análise e a Prontidão mudam os d10 rolados.
 *
 * O cartão do chat guarda um registro (flag `equilibrio`):
 *   base     os dois d10 rolados (a Análise e a Prontidão mudam estes valores);
 *   somas    o que os d4 já somaram a cada d10;
 *   pendente o valor de um d4 rolado que ainda não foi somado a nenhum d10 (ou `null`);
 *   estado   'aberto' (cliques valendo), 'aplicando' (o mestre está gravando), 'registrado'
 *            (rodada equilibrada somada) ou 'caiu'.
 * Toda mudança passa pelo mestre (as funções abaixo só calculam o registro novo); cada uma devolve
 * `null` quando o passo não vale agora, e o mestre não grava nada.
 */

/** Faces dos dados do equilíbrio. */
export const BALANCE_SIDES = 10;
export const BALANCE_BONUS_SIDES = 4;

/** Diferença máxima entre os d10 para continuar equilibrado. */
export const BALANCE_TOLERANCE = 1;

/** Validade da reserva contra o duplo clique (a mesma dos outros cartões). */
export const BALANCE_CLAIM_MS = 30_000;

/** Máximo de notas guardadas no cartão (Análise, Prontidão). */
const MAX_NOTES = 6;

const isDie = (value, sides) => Number.isInteger(value) && value >= 1 && value <= sides;

/** Registro de uma rolagem de equilíbrio recém-feita. */
export function createBalanceFlag({ desafioId, actorId, values }) {
  if (!Array.isArray(values) || values.length !== 2) return null;
  if (!values.every((value) => isDie(value, BALANCE_SIDES))) return null;
  return {
    desafioId,
    actorId,
    base: [...values],
    somas: [0, 0],
    dados: [],
    pendente: null,
    prontidao: false,
    notas: [],
    estado: 'aberto',
    reservadoEm: null,
  };
}

/** Valores atuais dos dois d10 (rolado + o que os d4 somaram). */
export const balanceValues = (flag) => [flag.base[0] + flag.somas[0], flag.base[1] + flag.somas[1]];

/** Situação de agora: os dois valores, a diferença e se está equilibrado. */
export function balanceState(flag) {
  const values = balanceValues(flag);
  const diff = Math.abs(values[0] - values[1]);
  return { values, diff, balanced: diff <= BALANCE_TOLERANCE };
}

/** O cartão ainda aceita cliques? (aberto, ou com a reserva do mestre já vencida) */
export function balanceOpen(flag, now) {
  if (flag?.estado === 'aberto') return true;
  return flag?.estado === 'aplicando' && now - (flag.reservadoEm ?? 0) > BALANCE_CLAIM_MS;
}

/** Reserva o cartão para o mestre gravar (contra o duplo clique). `null` se não está aberto. */
export function reserveBalance(flag, now) {
  if (!balanceOpen(flag, now)) return null;
  return { ...flag, estado: 'aplicando', reservadoEm: now };
}

/** Devolve o cartão a «aberto» (o passo não valeu ou deu erro). */
export const releaseBalance = (flag) => ({ ...flag, estado: 'aberto', reservadoEm: null });

const withNote = (flag, note) =>
  note ? [...(flag.notas ?? []), String(note).slice(0, 200)].slice(-MAX_NOTES) : flag.notas;

/**
 * Rolou um dado de equilíbrio: guarda o valor até ser somado a um d10. Só vale caindo, sem outro
 * d4 esperando. (O mestre desconta o d4 da reserva do desafio.)
 */
export function rollBonusDie(flag, value) {
  if (!isDie(value, BALANCE_BONUS_SIDES) || flag.pendente !== null) return null;
  if (balanceState(flag).balanced) return null;
  return { ...flag, pendente: value, dados: [...(flag.dados ?? []), value] };
}

/** Soma o d4 que está esperando a um dos d10 (0 = o primeiro, 1 = o segundo). */
export function assignBonusDie(flag, index) {
  if (flag.pendente === null || (index !== 0 && index !== 1)) return null;
  const somas = [...flag.somas];
  somas[index] += flag.pendente;
  return { ...flag, somas, pendente: null };
}

/**
 * Análise: troca os d10 rolados por outros valores (o custo em marcadores é pago por quem usa,
 * como nos testes). Só antes de qualquer d4 esperando.
 */
export function analyseBalance(flag, newBase, note) {
  if (flag.pendente !== null) return null;
  if (!Array.isArray(newBase) || newBase.length !== 2) return null;
  if (!newBase.every((value) => isDie(value, BALANCE_SIDES))) return null;
  return { ...flag, base: [...newBase], notas: withNote(flag, note) };
}

/** Prontidão: rola de novo um d10 cujo resultado não seja 1 (uma vez por cartão). */
export function rerollBalance(flag, index, value, note) {
  if (flag.prontidao || flag.pendente !== null) return null;
  if ((index !== 0 && index !== 1) || flag.base[index] === 1) return null;
  if (!isDie(value, BALANCE_SIDES)) return null;
  const base = [...flag.base];
  base[index] = value;
  return { ...flag, base, prontidao: true, notas: withNote(flag, note) };
}

/** d10 que a Prontidão pode rolar de novo (os que não tiraram 1). */
export const balanceRerollCandidates = (flag) => [0, 1].filter((i) => flag.base[i] !== 1);

/** Fim da rodada: equilibrou (registrado) ou caiu. Guarda as rodadas depois do clique. */
export function finishBalance(flag, estado, depois = null) {
  return { ...flag, estado, reservadoEm: null, depois, pendente: null };
}

/**
 * O que o cartão mostra e quais botões aparecem.
 * @param {object} flag Registro do cartão.
 * @param {object} viewer
 * @param {boolean} viewer.canAct Quem vê é o dono do personagem (ou o mestre).
 * @param {number} viewer.reserve d4 que restam na reserva.
 * @param {number} viewer.rounds Rodadas já atravessadas (antes deste cartão).
 * @param {number} viewer.target Rodadas para atravessar.
 * @param {boolean} viewer.active O desafio está ativo e o personagem participa.
 * @param {number} viewer.now Agora (ms), para a reserva contra o duplo clique.
 * @param {boolean} [viewer.canAnalyse] Tem Análise e marcadores.
 * @param {boolean} [viewer.canReroll] Tem Prontidão e PD (e o cartão ainda não usou).
 */
export function balanceView(flag, viewer) {
  const { values, diff, balanced } = balanceState(flag);
  const open = balanceOpen(flag, viewer.now);
  const live = open && viewer.active;
  const waiting = flag.pendente !== null;
  const can = viewer.canAct && live;
  return {
    base: flag.base,
    somas: flag.somas,
    values,
    diff,
    balanced,
    dados: flag.dados ?? [],
    pendente: flag.pendente,
    notas: flag.notas ?? [],
    estado: flag.estado,
    depois: flag.depois ?? null,
    busy: flag.estado === 'aplicando' && !open,
    fechado: open && !viewer.active,
    reserve: viewer.reserve,
    // Equilibrado: registra a rodada (ou atravessa, se for a última)
    showRegister: can && balanced && !waiting,
    crosses: viewer.rounds + 1 >= viewer.target,
    // Caindo: usa um d4 (se restar) ou cai
    showSpend: can && !balanced && !waiting && viewer.reserve > 0,
    showFall: can && !balanced && !waiting,
    // d4 esperando: escolhe em qual d10 somar
    showAssign: can && waiting,
    assignPreview: waiting ? [values[0] + flag.pendente, values[1] + flag.pendente] : null,
    showAnalyse: Boolean(viewer.canAnalyse) && live && !waiting,
    showReroll:
      Boolean(viewer.canReroll) &&
      live &&
      !waiting &&
      !flag.prontidao &&
      balanceRerollCandidates(flag).length > 0,
  };
}
