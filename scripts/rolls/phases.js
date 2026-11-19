/**
 * Combate por fases (regras p. 18): a rodada não tem iniciativa; tem três fases, nesta ordem —
 * geral, ataques à distância e ataques corpo a corpo. Quem age numa fase não age nas seguintes,
 * salvo efeitos como Prontidão. Lógica pura, sem dependência do Foundry.
 *
 * O que fica guardado (flags do Foundry, gravadas só pelo mestre):
 * - no combate: `{fase, rodada}` — a fase atual e a rodada em que ela foi escolhida;
 * - em cada combatente: `{rodada, fases}` — em que fases ele agiu nessa rodada, na ordem.
 *
 * Os dois registros levam a rodada: quando o combate passa de rodada, o que foi gravado na rodada
 * anterior deixa de valer sozinho. Assim «Próxima rodada» devolve todos a «Não agiu» e a fase a
 * «geral» sem nenhuma gravação extra.
 */

/** Fases da rodada, na ordem. */
export const PHASES = Object.freeze(['geral', 'distancia', 'corpo']);

/** Área de quem ainda não agiu na rodada. */
export const NOT_ACTED = 'nenhuma';

/** Áreas do rastreador, na ordem em que aparecem. */
export const AREAS = Object.freeze([...PHASES, NOT_ACTED]);

/** Tipos de combate que têm regras próprias e não usam as fases (cenas da aba de combate). */
export const NON_PHASE_COMBAT_TYPES = Object.freeze(['perseguicao', 'furtividade']);

/** O combate (pelo tipo) usa as fases? Perseguição e furtividade, não. */
export function isPhaseCombat(type) {
  return !NON_PHASE_COMBAT_TYPES.includes(type);
}

/** Rodada como número inteiro não negativo (0 = combate ainda não iniciado). */
const roundOf = (round) => (Number.isInteger(round) && round > 0 ? round : 0);

/**
 * Fase atual do combate. Sem registro, ou com registro de outra rodada, é a fase geral.
 * @param {{fase?: string, rodada?: number}|undefined} flag Registro do combate.
 * @param {number} round Rodada atual do combate.
 */
export function currentPhase(flag, round) {
  if (!flag || flag.rodada !== roundOf(round)) return PHASES[0];
  return PHASES.includes(flag.fase) ? flag.fase : PHASES[0];
}

/**
 * Registro da fase do combate depois de avançar ou voltar (`delta` +1 ou −1), sem passar das
 * pontas (a geral é a primeira; corpo a corpo, a última).
 * @returns {{fase: string, rodada: number}}
 */
export function shiftPhase(flag, round, delta) {
  const index = PHASES.indexOf(currentPhase(flag, round));
  const next = Math.min(PHASES.length - 1, Math.max(0, index + Math.sign(delta)));
  return { fase: PHASES[next], rodada: roundOf(round) };
}

/**
 * Fases em que o combatente agiu nesta rodada, na ordem das fases e sem repetir. Registro de outra
 * rodada (ou estranho) vale como «não agiu».
 * @param {{rodada?: number, fases?: string[]}|undefined} entry
 * @param {number} round
 */
export function actedPhases(entry, round) {
  if (!entry || entry.rodada !== roundOf(round) || !Array.isArray(entry.fases)) return [];
  return PHASES.filter((phase) => entry.fases.includes(phase));
}

/** Área do combatente no rastreador: a última fase em que agiu, ou «não agiu». */
export function areaOf(entry, round) {
  const acted = actedPhases(entry, round);
  return acted.length ? acted[acted.length - 1] : NOT_ACTED;
}

/**
 * Novo registro do combatente depois de um botão do mestre.
 * - Sem `add`: o combatente passa a ter agido só na fase escolhida (mover ou corrigir).
 * - Com `add` (Shift+clique, por exemplo Prontidão): soma a fase às que ele já tinha.
 * - `target` = «não agiu» limpa a rodada.
 * Uma fase desconhecida não muda nada (devolve o registro desta rodada como está).
 * @param {{rodada?: number, fases?: string[]}|undefined} entry
 * @param {number} round
 * @param {string} target Uma das fases ou NOT_ACTED.
 * @param {{add?: boolean}} [options]
 * @returns {{rodada: number, fases: string[]}}
 */
export function movePhase(entry, round, target, { add = false } = {}) {
  const rodada = roundOf(round);
  const current = actedPhases(entry, round);
  if (target === NOT_ACTED) return { rodada, fases: [] };
  if (!PHASES.includes(target)) return { rodada, fases: current };
  const fases = add ? [...current, target] : [target];
  return { rodada, fases: PHASES.filter((phase) => fases.includes(phase)) };
}

/**
 * Agiu numa fase anterior à escolhida? (Pela regra, só com um efeito como Prontidão; o sistema só
 * avisa, quem decide é o mestre.)
 */
export function actedBefore(entry, round, target) {
  const index = PHASES.indexOf(target);
  if (index < 0) return false;
  return actedPhases(entry, round).some((phase) => PHASES.indexOf(phase) < index);
}

/**
 * Separa os combatentes pelas áreas do rastreador, mantendo a ordem recebida dentro de cada área.
 * Quem agiu em mais de uma fase fica na área da última e leva as anteriores em `earlier` (o selo
 * «também agiu na fase X»).
 * @param {{id: string, entry?: object}[]} combatants
 * @param {number} round
 * @returns {{areas: Record<string, string[]>, earlier: Record<string, string[]>}}
 */
export function groupByArea(combatants, round) {
  const areas = Object.fromEntries(AREAS.map((area) => [area, []]));
  const earlier = {};
  for (const { id, entry } of combatants) {
    const acted = actedPhases(entry, round);
    const area = acted.length ? acted[acted.length - 1] : NOT_ACTED;
    areas[area].push(id);
    if (acted.length > 1) earlier[id] = acted.slice(0, -1);
  }
  return { areas, earlier };
}
