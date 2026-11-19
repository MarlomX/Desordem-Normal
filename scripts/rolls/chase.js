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
  return {
    ativa: false,
    rodadaAtual: 0,
    dt: ADVANCE_DT,
    pontos: [],
    revelarProximo: false,
    revelarFinal: false,
  };
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

/** Fôlego inicial pelo Vigor: no máximo 6 dados (Vigor d12). */
export const MAX_BREATH = 6;

/**
 * Teto técnico do fôlego ao recuperar ou ajustar à mão. A regra não fala em fôlego máximo, então
 * os dados podem passar de 6; o teto só evita números absurdos.
 */
export const MAX_BREATH_DICE = 99;

/** Dados de fôlego devolvidos pela ação «recuperar fôlego». */
export const BREATH_RECOVERY = 2;

/** Rodadas aceitas ao mudar a rodada atual na mão (o mesmo teto dos pontos de checagem). */
export const MAX_ROUND = 99;

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
  return Math.min(field === 'folego' ? MAX_BREATH_DICE : MAX_POINTS, next);
}

/** Maior PA que a janela aceita (o mesmo limite que o socket aceita de um jogador). */
export const MAX_POINTS = 10_000;

/**
 * Valida um valor digitado na janela da perseguição (campos `pa`, `folego` ou `dt`).
 * Vazio, texto ou número com vírgula/decimal inválido não valem (`valid: false`: o campo volta ao
 * valor anterior). Decimais são cortados (4,7 vira 4); os limites são os mesmos dos botões −/+:
 * PA de 0 a 10 000, fôlego de 0 a 99, DT de 1 a 40 e rodada de 1 a 99.
 * @param {'pa'|'folego'|'dt'|'rodada'} field
 * @param {string|number} raw O que a pessoa digitou.
 * @returns {{valid: boolean, value?: number}}
 */
export function parseTypedValue(field, raw) {
  if (raw === null || raw === undefined || String(raw).trim() === '') return { valid: false };
  const number = Number(String(raw).trim().replace(',', '.'));
  if (!Number.isFinite(number)) return { valid: false };
  const whole = Math.trunc(number);
  if (field === 'dt') return { valid: true, value: normalizeChaseDt(whole) };
  if (field === 'folego') {
    return { valid: true, value: Math.min(MAX_BREATH_DICE, Math.max(0, whole)) };
  }
  if (field === 'rodada') return { valid: true, value: Math.min(MAX_ROUND, Math.max(1, whole)) };
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

// ---------------------------------------------------------------------------------------------
// Pontos de checagem e penalidade (0.16.7)
//
// O mestre monta uma lista de pontos de checagem: em tal rodada, os participantes devem ter tantos
// PA. O último ponto da lista (a maior rodada) é o PA final, o de chegada. Nada acontece sozinho:
// o sistema só mostra quem está abaixo do alvo (para o mestre) e o mestre decide as consequências.
// ---------------------------------------------------------------------------------------------

/** Máximo de pontos de checagem de uma perseguição. */
export const MAX_CHECKPOINTS = 30;

/** Maior número de rodada aceito num ponto de checagem. */
export const MAX_CHECKPOINT_ROUND = 99;

/** Ponto de checagem válido: `{rodada, pa}` com rodada inteira de 1 a 99 e PA inteiro de 0 a 10 000. */
function cleanCheckpoint(point) {
  const round = Number(point?.rodada);
  const pa = Number(point?.pa);
  if (!Number.isInteger(round) || round < 1 || round > MAX_CHECKPOINT_ROUND) return null;
  if (!Number.isInteger(pa) || pa < 0 || pa > MAX_POINTS) return null;
  return { rodada: round, pa };
}

/**
 * Lista de pontos limpa: descarta pontos inválidos, deixa um só por rodada (o último da lista
 * vence) e ordena por rodada.
 * @param {{rodada: number, pa: number}[]} list
 */
export function normalizeCheckpoints(list) {
  const byRound = new Map();
  for (const point of Array.isArray(list) ? list : []) {
    const clean = cleanCheckpoint(point);
    if (clean) byRound.set(clean.rodada, clean);
  }
  return [...byRound.values()].sort((a, b) => a.rodada - b.rodada).slice(0, MAX_CHECKPOINTS);
}

/**
 * Acrescenta (ou troca, se a rodada já tem ponto) um ponto de checagem. Aceita o texto digitado:
 * vazio, texto, decimal ou fora dos limites (rodada 1 a 99, PA 0 a 10 000) não valem.
 * @returns {{valid: boolean, list: object[]}} `list` é a lista nova (ou a antiga, se inválido).
 */
export function addCheckpoint(list, round, pa) {
  // Texto vazio não vira 0: `Number('')` é 0, então o vazio é tratado à parte
  const toNumber = (value) =>
    typeof value === 'string' ? (value.trim() === '' ? Number.NaN : Number(value.trim())) : value;
  const typedRound = toNumber(round);
  const typedPa = toNumber(pa);
  const clean = cleanCheckpoint({ rodada: typedRound, pa: typedPa });
  const current = normalizeCheckpoints(list);
  if (!clean) return { valid: false, list: current };
  const next = normalizeCheckpoints([...current, clean]);
  // Se a lista estava cheia e o ponto é de uma rodada nova, ele não cabe
  if (!next.some((point) => point.rodada === clean.rodada)) return { valid: false, list: current };
  return { valid: true, list: next };
}

/** Lista sem o ponto da rodada dada. */
export function removeCheckpoint(list, round) {
  return normalizeCheckpoints(list).filter((point) => point.rodada !== round);
}

/** PA final: o ponto da maior rodada (ou `null` sem pontos). */
export function finalCheckpoint(list) {
  const points = normalizeCheckpoints(list);
  return points.length ? points[points.length - 1] : null;
}

/** Próximo ponto a alcançar: o primeiro com rodada igual ou maior que a atual (ou `null`). */
export function nextCheckpoint(list, currentRound) {
  const round = Math.max(1, Math.trunc(currentRound) || 1);
  return normalizeCheckpoints(list).find((point) => point.rodada >= round) ?? null;
}

/** Ponto de checagem da rodada atual (a checagem desta rodada), ou `null`. */
export function checkpointOfRound(list, currentRound) {
  return normalizeCheckpoints(list).find((point) => point.rodada === currentRound) ?? null;
}

/**
 * O que cada pessoa vê dos pontos. O mestre vê tudo; o jogador só vê o próximo alvo se o mestre
 * revelou o próximo, e só vê o PA final se revelou o final (um não revela o outro). A lista
 * inteira nunca vai para o jogador.
 * @returns {{next: object|null, final: object|null, list: object[]|null}}
 */
export function checkpointsView({ pontos, rodadaAtual, revelarProximo, revelarFinal, isGM }) {
  const next = nextCheckpoint(pontos, rodadaAtual);
  const final = finalCheckpoint(pontos);
  if (isGM) return { next, final, list: normalizeCheckpoints(pontos) };
  return {
    next: revelarProximo ? next : null,
    final: revelarFinal ? final : null,
    list: null,
  };
}

/**
 * Selos de um participante: `abaixo` (só o mestre vê) se há checagem nesta rodada e ele está
 * abaixo do alvo; `chegou` se alcançou o PA final (o mestre sempre vê; o jogador, só com o PA
 * final revelado).
 */
export function participantBadges({ pontos, rodadaAtual, pa, isGM, revelarFinal }) {
  const target = checkpointOfRound(pontos, rodadaAtual);
  const final = finalCheckpoint(pontos);
  return {
    abaixo: Boolean(isGM && target && pa < target.pa),
    chegou: Boolean((isGM || revelarFinal) && final && pa >= final.pa),
  };
}

/** Tipos de penalidade: perde PV ou PD. */
export const PENALTY_TYPES = Object.freeze(['pv', 'pd']);

/** Maior valor fixo de uma penalidade. */
export const MAX_PENALTY = 999;

const PENALTY_DICE = /^(\d{1,2})d(\d{1,3})(?:\s*([+-])\s*(\d{1,3}))?$/i;

/**
 * Valor digitado da penalidade: um número inteiro (de 1 a 999) ou uma fórmula simples `NdM`,
 * com `+K` ou `-K` opcional (N de 1 a 20, M de 2 a 100). Qualquer outra coisa não vale.
 * @returns {{valid: boolean, kind?: 'fixed'|'dice', formula?: string, fixed?: number}}
 */
export function parsePenaltyValue(raw) {
  const text = String(raw ?? '')
    .trim()
    .replace(/\s+/g, '');
  if (/^\d{1,3}$/.test(text)) {
    const fixed = Number(text);
    return fixed >= 1 && fixed <= MAX_PENALTY
      ? { valid: true, kind: 'fixed', fixed }
      : { valid: false };
  }
  const match = PENALTY_DICE.exec(text);
  if (!match) return { valid: false };
  const [, count, sides, sign, bonus] = match;
  if (Number(count) < 1 || Number(count) > 20 || Number(sides) < 2 || Number(sides) > 100) {
    return { valid: false };
  }
  const formula = `${Number(count)}d${Number(sides)}${bonus ? `${sign}${Number(bonus)}` : ''}`;
  return { valid: true, kind: 'dice', formula };
}

/**
 * Registro de uma penalidade postada no chat: quem já aplicou fica em `aplicados`.
 * A mesma penalidade serve à cena de furtividade (consequência de estar encontrado): nesse caso o
 * registro guarda `cena: 'furtividade'` e `alvos` (os encontrados quando ela foi postada), e só
 * eles têm o botão. Na perseguição o registro continua igual ao de antes. Num desafio (guia de
 * desafios) o registro guarda `cena: 'desafio'` e `alvos` com os ids dos atores escolhidos.
 */
export function createPenaltyFlag({ tipo, valor, formula = '', cena, alvos }) {
  const flag = {
    tipo: PENALTY_TYPES.includes(tipo) ? tipo : 'pv',
    valor: Math.min(MAX_PENALTY, Math.max(0, Math.trunc(valor))),
    formula: String(formula),
    aplicados: [],
  };
  // Furtividade: ids dos participantes encontrados. Desafio (0.18.0): ids dos atores escolhidos.
  if (cena === 'furtividade' || cena === 'desafio') {
    flag.cena = cena;
    flag.alvos = (Array.isArray(alvos) ? alvos : []).map(String);
  }
  return flag;
}

/** De qual cena é a penalidade ('perseguicao' para os registros antigos, sem `cena`). */
export const penaltyScene = (flag) =>
  flag?.cena === 'furtividade' || flag?.cena === 'desafio' ? flag.cena : 'perseguicao';

/** Esse participante pode aplicar a penalidade? (com `alvos`, só quem está na lista) */
export const penaltyAllows = (flag, combatantId) =>
  !Array.isArray(flag?.alvos) || flag.alvos.includes(combatantId);

/** Esse participante já aplicou esta penalidade? */
export const penaltyApplied = (flag, combatantId) =>
  flag.aplicados.some((entry) => entry.id === combatantId);

/**
 * Registra que um participante aplicou a penalidade. Devolve `null` se ele já tinha aplicado
 * (uso único por participante). O recurso nunca fica abaixo de 0.
 * @param {object} flag Registro da penalidade.
 * @param {string} combatantId
 * @param {number} current Valor atual do recurso (PV ou PD) do personagem.
 * @returns {{flag: object, next: number, applied: number, reachedZero: boolean}|null}
 */
export function applyPenaltyTo(flag, combatantId, current) {
  if (penaltyApplied(flag, combatantId)) return null;
  const next = Math.max(0, current - flag.valor);
  const applied = current - next;
  const reachedZero = flag.valor > 0 && next === 0;
  return {
    flag: {
      ...flag,
      aplicados: [...flag.aplicados, { id: combatantId, perda: applied, zerou: reachedZero }],
    },
    next,
    applied,
    reachedZero,
  };
}

/**
 * O que a barra da penalidade mostra a quem está vendo: uma linha por participante que a pessoa
 * controla. `rows` são os participantes dela (o mestre vê todos).
 * @param {object} flag
 * @param {{combatantId: string, name: string}[]} rows
 */
export function penaltyBarView(flag, rows) {
  const allowed = rows.filter(({ combatantId }) => penaltyAllows(flag, combatantId));
  return {
    valor: flag.valor,
    tipo: flag.tipo,
    multiple: allowed.length > 1,
    rows: allowed.map(({ combatantId, name }) => {
      const entry = flag.aplicados.find((item) => item.id === combatantId);
      return {
        combatantId,
        name,
        applied: Boolean(entry),
        appliedLoss: entry?.perda ?? 0,
        reachedZero: Boolean(entry?.zerou),
        showButton: !entry,
      };
    }),
  };
}

// ---------------------------------------------------------------------------------------------
// Rodada na mão e recuperar fôlego (0.16.8)
// ---------------------------------------------------------------------------------------------

/**
 * Rodada nova ao mudar a rodada atual na mão (botões −/+). Fica entre 1 e 99. Mudar a rodada não
 * mexe em PA, fôlego nem no «já agiu» de ninguém (só «próxima rodada» zera o «já agiu»).
 */
export function adjustRound(current, delta) {
  const next = Math.trunc(Number(current) + Number(delta));
  return Number.isFinite(next) ? Math.min(MAX_ROUND, Math.max(1, next)) : 1;
}

/**
 * Por que o participante não pode recuperar o fôlego agora (ou `null` se pode): `inativa` (a
 * perseguição não está em andamento) ou `agiu` (já agiu nesta rodada: recuperar fôlego é a ação
 * da rodada, no lugar de avançar).
 */
export function breathBlockReason({ ativa, rodadaAtual, participant }) {
  return advanceBlockReason({ ativa, rodadaAtual, participant });
}

/**
 * O que gravar ao recuperar o fôlego: soma 2 dados (sem teto de 6) e marca «já agiu» na rodada.
 * @returns {{folego: number, ultimaRodada: number}} Patch do participante.
 */
export function recoverBreathPatch({ participant, rodadaAtual }) {
  return {
    folego: Math.min(MAX_BREATH_DICE, Math.max(0, participant.folego) + BREATH_RECOVERY),
    ultimaRodada: rodadaAtual,
  };
}
