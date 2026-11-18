/**
 * Perseguição: lógica pura (sem dependência do Foundry).
 *
 * Nesta versão (esqueleto) só existe o ciclo de vida da perseguição e as regras de quem pode
 * ver e abrir a janela. Avançar, fôlego e consequências chegam nas próximas versões 0.16.x.
 *
 * Ciclo de vida:  preparação (ativa: false, rodada 0) --iniciar--> em andamento (ativa: true,
 * rodada 1) --encerrar--> volta à preparação. Só pode existir uma perseguição por vez.
 */

/** Subtipo do encontro (Combat) e do participante (Combatant) registrados no system.json. */
export const CHASE_COMBAT_TYPE = 'perseguicao';
export const CHASE_COMBATANT_TYPE = 'participante';

/** Estado de uma perseguição recém-criada: em preparação, sem rodada. */
export function initialChaseState() {
  return { ativa: false, rodadaAtual: 0, dt: ADVANCE_DT };
}

/** Estado ao iniciar a perseguição: ativa, na rodada 1. */
export function startState() {
  return { ativa: true, rodadaAtual: 1 };
}

/** Estado ao encerrar a perseguição: volta à preparação. */
export function endState() {
  return { ativa: false, rodadaAtual: 0 };
}

/**
 * Atores que ainda podem ser adicionados: remove os que já participam e ordena pelo nome.
 * @param {{id: string, name: string}[]} candidates
 * @param {string[]} currentActorIds Ids dos atores que já participam.
 * @returns {{id: string, name: string}[]}
 */
export function addableActors(candidates, currentActorIds) {
  const taken = new Set(currentActorIds);
  return candidates
    .filter((actor) => !taken.has(actor.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

/**
 * Quem pode fazer o quê com a perseguição.
 * - O mestre cria (se não existir) e administra (se existir) e sempre pode abrir a janela.
 * - O jogador só abre a janela se a perseguição estiver em andamento e ele tiver um personagem
 *   participando.
 * - O cartão da ficha aparece para o personagem que participa: para o jogador só em andamento,
 *   para o mestre também durante a preparação.
 * @param {{isGM: boolean, chase: {ativa: boolean}|null, isParticipant: boolean}} params
 *   `isParticipant`: o jogador tem um personagem na perseguição (para `canOpen`) ou o personagem
 *   da ficha está nela (para `showCard`).
 * @returns {{canCreate: boolean, canManage: boolean, canOpen: boolean, showCard: boolean}}
 */
export function chaseAccess({ isGM, chase, isParticipant }) {
  const exists = Boolean(chase);
  return {
    canCreate: isGM && !exists,
    canManage: isGM && exists,
    canOpen: exists && (isGM || (chase.ativa && isParticipant)),
    showCard: exists && isParticipant && (chase.ativa || isGM),
  };
}

/** Botão da aba de combate: `criar` (mestre, sem perseguição), `abrir` ou nenhum (`null`). */
export function trackerAction(access) {
  if (access.canCreate) return 'criar';
  if (access.canOpen) return 'abrir';
  return null;
}

/**
 * A janela deve abrir sozinha neste cliente?
 * - `created`: o mestre que criou a perseguição.
 * - `started`: os donos de participantes (não mestres) e o mestre que iniciou.
 * - `joined`: o dono de um personagem adicionado com a perseguição já em andamento.
 * @param {'created'|'started'|'joined'} event
 * @param {{isGM: boolean, isAuthor: boolean, ownsParticipant: boolean}} who
 */
export function shouldAutoOpen(event, { isGM, isAuthor, ownsParticipant }) {
  if (event === 'created') return isGM && isAuthor;
  if (event === 'started') return isGM ? isAuthor : ownsParticipant;
  if (event === 'joined') return !isGM && ownsParticipant;
  return false;
}

// ---------------------------------------------------------------------------------------------
// Avançar (0.16.1)
// ---------------------------------------------------------------------------------------------

/** DT padrão do avanço (o mestre pode mudar a DT de cada perseguição). */
export const ADVANCE_DT = 10;

/** Limites da DT da perseguição. */
export const CHASE_DT_MIN = 1;
export const CHASE_DT_MAX = 40;

/** Tempo (ms) até uma reserva de clique parada deixar de bloquear o botão. */
export const ADVANCE_CLAIM_TIMEOUT_MS = 30_000;

/** DT válida da perseguição: inteiro entre 1 e 40; qualquer outra coisa vira a padrão. */
export function normalizeChaseDt(value) {
  if (value === null || value === undefined || value === '') return ADVANCE_DT;
  const dt = Math.trunc(Number(value));
  if (!Number.isFinite(dt)) return ADVANCE_DT;
  return Math.min(CHASE_DT_MAX, Math.max(CHASE_DT_MIN, dt));
}

/** Perícia padrão do teste de avançar. Qualquer outra só pode ser usada uma vez por perseguição. */
export const ADVANCE_SKILL = 'atletismo';

/** Máximo de dados de fôlego gastos num mesmo teste (o teste rola no máximo 4 dados). */
export const MAX_BREATH_PER_TEST = 2;

/** Máximo de dados de fôlego que um participante pode ter. */
export const MAX_BREATH = 6;

/** Campos que o mestre pode ajustar à mão na janela. */
export const ADJUSTABLE_FIELDS = Object.freeze(['pa', 'folego']);

/** Campos do participante que um jogador pode gravar (pelo próprio cliente ou por socket). */
const PARTICIPANT_NUMBER_FIELDS = ['pa', 'folego', 'esforcoExtra', 'ultimaRodada'];

/** O campo pode ser ajustado à mão? */
export const isAdjustableField = (field) => ADJUSTABLE_FIELDS.includes(field);

/**
 * Dados de fôlego pelo dado de Vigor: metade das faces (d4 → 2, d6 → 3, ... d12 → 6), no máximo 6.
 * @param {number} vigorSides Faces do dado de Vigor.
 */
export function breathDice(vigorSides) {
  const dice = Math.floor(Number(vigorSides) / 2);
  return Number.isFinite(dice) ? Math.min(MAX_BREATH, Math.max(0, dice)) : 0;
}

/** Situação de um participante ao iniciar a perseguição (ou ao entrar com ela em andamento). */
export function participantStart(vigorSides) {
  return {
    pa: 0,
    folego: breathDice(vigorSides),
    esforcoExtra: 0,
    ultimaRodada: 0,
    periciasUsadas: [],
    carregadoPor: '',
  };
}

/** Situação de um participante em preparação (nada acumulado). */
export function participantReset() {
  return { ...participantStart(0), folego: 0 };
}

/** O participante já agiu na rodada atual? */
export function hasActed({ ultimaRodada }, rodadaAtual) {
  return rodadaAtual >= 1 && ultimaRodada === rodadaAtual;
}

/** O participante pode avançar agora? (perseguição em andamento e ainda sem ação na rodada) */
export function canAdvance({ ativa, rodadaAtual, participant }) {
  return Boolean(ativa) && rodadaAtual >= 1 && !hasActed(participant, rodadaAtual);
}

/** A perícia pode ser usada para avançar? Atletismo sempre; as outras, uma vez cada. */
export function skillAllowed(skillKey, usedSkills) {
  return skillKey === ADVANCE_SKILL || !usedSkills.includes(skillKey);
}

/** Máximo de dados de fôlego que o jogador pode gastar neste teste. */
export function breathLimit(folego) {
  return Math.max(0, Math.min(MAX_BREATH_PER_TEST, Math.trunc(folego)));
}

/** Dados d4 de PV perdidos pelo esforço extra: 1 na primeira vez, 2 na segunda, e assim por diante. */
export function effortDiceCount(previousUses) {
  return Math.max(0, Math.trunc(previousUses)) + 1;
}

/**
 * O teste conta como sucesso no avanço? O avanço tem a sua DT (a do campo da janela pré-teste, ou a
 * da perseguição em testes sem campo de DT). Sucesso crítico passa sempre e falha crítica falha
 * sempre.
 * @param {{total: number, criticalSuccess: boolean, criticalFailure: boolean}} result Resultado
 *   de `resolveTest`.
 * @param {number} [dt] DT do avanço.
 */
export function advanceSuccess(result, dt = ADVANCE_DT) {
  if (result.criticalFailure) return false;
  if (result.criticalSuccess) return true;
  return result.total >= dt;
}

/**
 * Pontos de avanço de um teste: passou, soma a rolagem alta (no crítico, as duas maiores, que o
 * teste já calcula em `highSum`); falhou, soma a rolagem baixa.
 * @param {{total: number, highSum: number, lowRoll: number, criticalSuccess: boolean,
 *   criticalFailure: boolean}} result Resultado de `resolveTest`.
 * @param {number} [dt] DT do avanço.
 */
export function advanceGain(result, dt = ADVANCE_DT) {
  return advanceSuccess(result, dt) ? result.highSum : result.lowRoll;
}

/**
 * DT mostrada na janela pré-teste ao marcar ou desmarcar "usar como teste de avanço": marcar põe a
 * DT da perseguição e guarda a que estava; desmarcar devolve a guardada.
 * @param {{on: boolean, current: number, saved: number|null, dt?: number}} state `current` é a DT
 *   no campo; `saved` é a DT guardada ao marcar (ou `null`); `dt` é a DT da perseguição.
 * @returns {{value: number, saved: number|null}}
 */
export function advanceDtField({ on, current, saved, dt = ADVANCE_DT }) {
  if (on) return { value: dt, saved: saved ?? current };
  return { value: saved ?? current, saved: null };
}

/**
 * Por que o teste não pode ser usado como avanço agora (ou `null` se pode): `inativa` (perseguição
 * não está em andamento) ou `agiu` (já agiu nesta rodada; o jogador desmarca "já agiu" na janela
 * da perseguição para refazer). Perícia já usada NÃO bloqueia mais (veja `advanceWarning`).
 */
export function advanceBlockReason({ ativa, rodadaAtual, participant }) {
  if (!ativa || rodadaAtual < 1) return 'inativa';
  if (!canAdvance({ ativa, rodadaAtual, participant })) return 'agiu';
  return null;
}

/**
 * Lembrete (não bloqueia) mostrado na janela pré-teste: `pericia` se a perícia, que não é Atletismo,
 * já foi usada para avançar nesta perseguição. Pela regra só vale uma vez, mas o mestre decide.
 */
export function advanceWarning({ participant, skillKey }) {
  return skillAllowed(skillKey, participant.periciasUsadas) ? null : 'pericia';
}

/**
 * O que o avanço custa e registra no participante, na hora da rolagem: gasta o fôlego, conta o
 * esforço extra, marca a rodada ("já agiu") e anota a perícia usada. Os PA ficam de fora: são
 * somados depois, no botão do cartão do teste.
 * @param {{folego: number, esforcoExtra: number, periciasUsadas: string[]}} participant
 * @param {{breathSpent: number, effort: boolean, skillKey: string, rodadaAtual: number}} action
 * @returns {{folego: number, esforcoExtra: number, ultimaRodada: number,
 *   periciasUsadas: string[]}}
 */
export function applyAdvanceCosts(participant, { breathSpent, effort, skillKey, rodadaAtual }) {
  const used = [...participant.periciasUsadas];
  if (skillKey !== ADVANCE_SKILL && !used.includes(skillKey)) used.push(skillKey);
  return {
    folego: Math.max(0, participant.folego - breathSpent),
    esforcoExtra: participant.esforcoExtra + (effort ? 1 : 0),
    ultimaRodada: rodadaAtual,
    periciasUsadas: used,
  };
}

// ---------------------------------------------------------------------------------------------
// Botão "adicionar PA" no cartão do teste
//
// O teste de avanço guarda na mensagem do chat um registro (flag `avanco`). O valor do botão não
// fica guardado: é recalculado dos dados atuais do cartão a cada vez, então trocar um dado (a
// Análise, a Prontidão) antes do clique já muda o valor. O botão é de uso único.
// ---------------------------------------------------------------------------------------------

/** Registro de um teste de avanço recém-rolado: nada adicionado ainda. */
export function createAdvanceFlag({ combatantId, skillKey, dt }) {
  return { combatantId, skillKey, dt: normalizeChaseDt(dt), estado: 'pendente', ganho: null };
}

const isStaleClaim = (flag, now) =>
  flag.estado === 'aplicando' && now - (flag.reservadoEm ?? 0) > ADVANCE_CLAIM_TIMEOUT_MS;

/** O botão pode ser usado agora? (pendente, ou reserva parada há tempo demais) */
export const isAdvanceClaimable = (flag, now) =>
  flag.estado === 'pendente' || isStaleClaim(flag, now);

/** Reserva o clique (contra o duplo clique). `null` se já foi usado ou está em uso. */
export function reserveAdvance(flag, now) {
  if (!isAdvanceClaimable(flag, now)) return null;
  return { ...flag, estado: 'aplicando', reservadoEm: now };
}

/** Conclui o clique: guarda quantos PA foram adicionados. */
export function finishAdvanceFlag(flag, gain) {
  return { ...flag, estado: 'aplicado', ganho: gain, reservadoEm: null };
}

/** Desfaz a reserva quando a gravação falhou, para o jogador poder tentar de novo. */
export function releaseAdvance(flag) {
  return { ...flag, estado: 'pendente', reservadoEm: null };
}

/**
 * O que a barra do cartão mostra. `kind` diz como o valor foi obtido (para o texto): `crit`,
 * `passou`, `falhou` ou `falhaCritica`.
 * @param {object} flag Registro do avanço.
 * @param {object} result Resultado atual do teste (já com os dados que o cartão mostra).
 * @param {{canApply: boolean, now: number}} viewer
 */
export function advanceBarView(flag, result, { canApply, now }) {
  const pa = advanceGain(result, flag.dt);
  let kind = 'passou';
  if (result.criticalFailure) kind = 'falhaCritica';
  else if (result.criticalSuccess) kind = 'crit';
  else if (!advanceSuccess(result, flag.dt)) kind = 'falhou';
  return {
    dt: flag.dt,
    kind,
    pa,
    applied: flag.estado === 'aplicado',
    appliedPa: flag.ganho,
    busy: flag.estado === 'aplicando' && !isStaleClaim(flag, now),
    showButton: canApply && isAdvanceClaimable(flag, now),
  };
}

// ---------------------------------------------------------------------------------------------
// Esforço extra: o PV só é descontado quando o jogador clica no cartão do chat (0.16.6)
// ---------------------------------------------------------------------------------------------

/** Registro de um esforço extra recém-rolado: o PV ainda não foi descontado. */
export function createEffortFlag({ actorUuid, loss, dice }) {
  return {
    actorUuid,
    perda: Math.max(0, Math.trunc(loss)),
    dados: Math.max(1, Math.trunc(dice)),
    estado: 'pendente',
    aplicado: null,
    zerou: false,
  };
}

/** Conclui o clique: guarda quantos PV saíram de fato (nunca abaixo de 0) e se chegou a 0. */
export function finishEffortFlag(flag, { applied, reachedZero }) {
  return { ...flag, estado: 'aplicado', aplicado: applied, zerou: reachedZero, reservadoEm: null };
}

/**
 * O que a barra do esforço extra mostra. O botão é de uso único (a reserva contra o duplo clique é
 * a mesma do botão dos PA).
 * @param {object} flag Registro do esforço (`createEffortFlag`).
 * @param {{canApply: boolean, now: number}} viewer
 */
export function effortBarView(flag, { canApply, now }) {
  return {
    loss: flag.perda,
    applied: flag.estado === 'aplicado',
    appliedLoss: flag.aplicado,
    reachedZero: Boolean(flag.zerou),
    busy: flag.estado === 'aplicando' && !isStaleClaim(flag, now),
    showButton: canApply && isAdvanceClaimable(flag, now),
  };
}

/** PV depois do esforço extra (nunca abaixo de 0) e se chegou a 0 (o jogador faz o teste de lesão). */
export function applyEffortLoss(pv, loss) {
  const next = Math.max(0, pv - loss);
  return { pv: next, reachedZero: loss > 0 && next === 0 };
}

/** Valor de um campo ajustado à mão (nunca abaixo de 0; fôlego e PA têm um máximo). */
export function adjustField(field, value, delta) {
  const next = Math.max(0, Math.trunc(value + delta));
  return Math.min(field === 'folego' ? MAX_BREATH : MAX_POINTS, next);
}

/** Maior PA que a janela aceita (o mesmo limite que o socket aceita de um jogador). */
export const MAX_POINTS = 10_000;

/**
 * Valida um valor digitado na janela da perseguição (campos `pa`, `folego` ou `dt`).
 * Vazio, texto ou número com vírgula/decimal inválido não valem (`valid: false`: o campo volta ao
 * valor anterior). Decimais são cortados (4,7 vira 4); os limites são os mesmos dos botões −/+:
 * PA de 0 a 10 000, fôlego de 0 a 6 e DT de 1 a 40.
 * @param {'pa'|'folego'|'dt'} field
 * @param {string|number} raw O que a pessoa digitou.
 * @returns {{valid: boolean, value?: number}}
 */
export function parseTypedValue(field, raw) {
  if (raw === null || raw === undefined || String(raw).trim() === '') return { valid: false };
  const number = Number(String(raw).trim().replace(',', '.'));
  if (!Number.isFinite(number)) return { valid: false };
  const whole = Math.trunc(number);
  if (field === 'dt') return { valid: true, value: normalizeChaseDt(whole) };
  if (field === 'folego') return { valid: true, value: Math.min(MAX_BREATH, Math.max(0, whole)) };
  if (field === 'pa') return { valid: true, value: Math.min(MAX_POINTS, Math.max(0, whole)) };
  return { valid: false };
}

/** Papel (role) mínimo de um jogador "confiável" no Foundry (CONST.USER_ROLES.TRUSTED). */
export const TRUSTED_ROLE = 2;

/**
 * Quem pode digitar ou ajustar PA e fôlego de um participante: o mestre (de qualquer um) e o
 * jogador confiável (Trusted Player do Foundry), só do próprio personagem. Jogador comum não edita.
 * @param {{isGM: boolean, role: number, isOwner: boolean}} user `role` é `game.user.role`.
 */
export function canEditChaseNumbers({ isGM, role, isOwner }) {
  if (isGM) return true;
  return Boolean(isOwner) && Number(role) >= TRUSTED_ROLE;
}

/** Estado ao passar para a próxima rodada. */
export function nextRoundState(rodadaAtual) {
  return { rodadaAtual: rodadaAtual + 1 };
}

/** Chave de teste válida: letras, números, `_`, `-`, `:` e `.` (inclui as de áreas extras). */
const SKILL_KEY_PATTERN = /^[A-Za-z0-9_.:-]{1,60}$/;

/**
 * Limpa um pedido de gravação vindo de outro cliente: só campos conhecidos, números inteiros
 * não negativos e chaves de teste com formato válido. Tudo o mais é ignorado.
 * @param {object} patch
 */
export function sanitizeParticipantPatch(patch) {
  const clean = {};
  if (!patch || typeof patch !== 'object') return clean;
  for (const field of PARTICIPANT_NUMBER_FIELDS) {
    const value = patch[field];
    if (Number.isInteger(value) && value >= 0 && value <= 10_000) clean[field] = value;
  }
  if (Array.isArray(patch.periciasUsadas)) {
    clean.periciasUsadas = [
      ...new Set(
        patch.periciasUsadas.filter(
          (skill) => typeof skill === 'string' && SKILL_KEY_PATTERN.test(skill),
        ),
      ),
    ].slice(0, 40);
  }
  return clean;
}
