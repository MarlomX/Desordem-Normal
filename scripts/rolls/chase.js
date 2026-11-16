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
  return { ativa: false, rodadaAtual: 0 };
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

/** Dificuldade do teste de avançar. */
export const ADVANCE_DT = 10;

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
 * O teste conta como sucesso no avanço? O avanço tem DT própria (10), separada da DT do teste
 * usado, para funcionar também em testes sem DT (como o oposto da esquiva). Sucesso crítico
 * passa sempre e falha crítica falha sempre.
 * @param {{total: number, criticalSuccess: boolean, criticalFailure: boolean}} result Resultado
 *   de `resolveTest`.
 */
export function advanceSuccess(result) {
  if (result.criticalFailure) return false;
  if (result.criticalSuccess) return true;
  return result.total >= ADVANCE_DT;
}

/**
 * Pontos de avanço de um teste: passou, soma a rolagem alta (no crítico, as duas maiores, que o
 * teste já calcula em `highSum`); falhou, soma a rolagem baixa.
 * @param {{total: number, highSum: number, lowRoll: number, criticalSuccess: boolean,
 *   criticalFailure: boolean}} result Resultado de `resolveTest`.
 */
export function advanceGain(result) {
  return advanceSuccess(result) ? result.highSum : result.lowRoll;
}

/**
 * Por que o teste não pode ser usado como avanço agora (ou `null` se pode):
 * `inativa` (perseguição não está em andamento), `agiu` (já agiu nesta rodada; o jogador desmarca
 * "já agiu" na janela da perseguição para refazer) ou `pericia` (perícia, que não é Atletismo, já
 * usada).
 */
export function advanceBlockReason({ ativa, rodadaAtual, participant, skillKey }) {
  if (!ativa || rodadaAtual < 1) return 'inativa';
  if (!canAdvance({ ativa, rodadaAtual, participant })) return 'agiu';
  if (!skillAllowed(skillKey, participant.periciasUsadas)) return 'pericia';
  return null;
}

/**
 * Novo estado do participante depois de avançar.
 * @param {{pa: number, folego: number, esforcoExtra: number, periciasUsadas: string[]}} participant
 * @param {{gain: number, breathSpent: number, effort: boolean, skillKey: string,
 *   rodadaAtual: number}} action
 * @returns {{pa: number, folego: number, esforcoExtra: number, ultimaRodada: number,
 *   periciasUsadas: string[]}}
 */
export function applyAdvance(participant, { gain, breathSpent, effort, skillKey, rodadaAtual }) {
  const used = [...participant.periciasUsadas];
  if (skillKey !== ADVANCE_SKILL && !used.includes(skillKey)) used.push(skillKey);
  return {
    pa: participant.pa + gain,
    folego: Math.max(0, participant.folego - breathSpent),
    esforcoExtra: participant.esforcoExtra + (effort ? 1 : 0),
    ultimaRodada: rodadaAtual,
    periciasUsadas: used,
  };
}

/** PV depois do esforço extra (nunca abaixo de 0) e se chegou a 0 (o jogador faz o teste de lesão). */
export function applyEffortLoss(pv, loss) {
  const next = Math.max(0, pv - loss);
  return { pv: next, reachedZero: loss > 0 && next === 0 };
}

/** Valor de um campo ajustado à mão (nunca abaixo de 0; fôlego nunca acima do máximo). */
export function adjustField(field, value, delta) {
  const next = Math.max(0, Math.trunc(value + delta));
  return field === 'folego' ? Math.min(MAX_BREATH, next) : next;
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
