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

// Desde a v0.28.7 o código mora em `challenge/`; este arquivo só reexporta (os imports de
// fora continuam iguais).
export {
  CHALLENGE_TYPES,
  INDIVIDUAL_TYPES,
  DEFAULT_BALANCE_ROUNDS,
  MAX_BALANCE_DICE,
  REACH_TARGET,
  REACH_APPROACHES,
  RISKY_DT_BONUS,
  TYPE_ICONS,
  CHALLENGE_VISIBILITY,
  CLIMB_APPROACHES,
  CLIMB_DIRECTIONS,
  CHALLENGE_MODES,
  ON_PASS,
  ON_FAIL,
  MAX_CHALLENGES,
  MAX_PARTICIPANTS,
  MAX_NAME,
  MAX_TARGET,
  MAX_POINTS,
  MIN_DT,
  MAX_DT,
  DEFAULT_TARGET,
  DEFAULT_DT,
  DEFAULT_FAST_DT,
  DEFAULT_CAREFUL_DT,
  MAX_COST,
  parseInteger,
  pointsCap,
  normalizeChallenge,
  normalizeChallenges,
  newChallenge,
  replaceChallenge,
  removeChallenge,
  appendChallenge,
  updateChallengeField,
  participantIds,
  addParticipants,
  removeParticipant,
  currentPoints,
  setPoints,
  adjustPoints,
  typePoints,
} from './challenge/model.js';
export {
  isDescent,
  climbHeight,
  shownPoints,
  unitKey,
  typeShownPoints,
  adjustShownPoints,
  isCompleted,
  visibleChallenges,
  challengeVisibleTo,
  targetVisible,
  challengeView,
  sheetChallenges,
  addableChallengeActors,
  sidebarOrder,
} from './challenge/view.js';
export {
  challengeTestChoices,
  sustainReduction,
  sustainStepMods,
  sustainSteps,
  challengeDtFor,
  reachApproach,
  approachFor,
  climbApproach,
  createChallengeTestFlag,
  failureKind,
  challengeTestSuccess,
  challengeTestGain,
  applyChallengeFailure,
  applyChallengeTest,
  applyFall,
  loseHitPoints,
  challengeBarView,
  costBarView,
} from './challenge/test.js';
export {
  balanceReserveSize,
  participantReserve,
  setReserve,
  typeReserve,
  spendBalanceDie,
  registerBalanceRound,
  applyBalanceFall,
  withLock,
} from './challenge/balance.js';
