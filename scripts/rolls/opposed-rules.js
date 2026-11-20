/**
 * Regras de comparação dos testes opostos iniciados pela ficha. Lógica pura.
 *
 * - Simples (perícia × perícia): vence o maior total (críticos primeiro, como em
 *   `resolveOpposed`); total igual, vence a maior rolagem alta (RA); RA igual, é empate e os dois
 *   repetem (p. 11).
 * - Corpo a corpo (ataque × ataque, p. 19): quem tiver o maior resultado acerta o outro; empate,
 *   os dois se acertam. Em todos os casos o ataque precisa atingir a DT básica 7 (um sucesso
 *   crítico passa sozinho; uma falha crítica nunca passa).
 * - Defesa (ataque × Defender-se, p. 18): o ataque só acerta se vencer e atingir a DT 7. Total
 *   igual: decide a maior RA, depois a segunda maior rolagem; empate completo, a defesa vence.
 */
import { resolveOpposed } from './opposed.js';

/** DT básica dos ataques. */
export const ATTACK_DT = 7;

/**
 * O ataque atinge a DT básica? Sucesso crítico sempre; falha crítica nunca.
 * @param {{total: number, criticalSuccess: boolean, criticalFailure: boolean}} result
 */
export function attackPasses(result) {
  if (result.criticalSuccess) return true;
  if (result.criticalFailure) return false;
  return result.total >= ATTACK_DT;
}

/**
 * Rolagens do teste da maior para a menor (as 3 maiores, como a RA e a RB do teste). A primeira é
 * a RA; a segunda, a «segunda maior rolagem» do desempate.
 * @param {{dice?: {value: number}[], highRoll?: number}} result
 * @returns {number[]}
 */
export function rollRanking(result) {
  const values = Array.isArray(result.dice) ? result.dice.map((die) => die.value) : [];
  if (!values.length && Number.isFinite(result.highRoll)) return [result.highRoll];
  return values.sort((x, y) => y - x).slice(0, 3);
}

/**
 * Compara as rolagens posição por posição, até `depth` posições.
 * @returns {{winner: 'a'|'b'|'empate', position: number}} `position`: 0 = RA, 1 = segunda maior.
 */
function compareRanking(a, b, depth) {
  const ra = rollRanking(a);
  const rb = rollRanking(b);
  for (let i = 0; i < depth; i += 1) {
    const x = ra[i] ?? 0;
    const y = rb[i] ?? 0;
    if (x !== y) return { winner: x > y ? 'a' : 'b', position: i };
  }
  return { winner: 'empate', position: -1 };
}

/** Motivo do desempate pela posição da rolagem. */
const BY_POSITION = ['ra', 'segunda'];

/**
 * Teste oposto simples: total (com críticos); empate, a maior RA; RA igual, empate (repetem).
 * @returns {{winner: 'a'|'b'|'empate', margin: number, decidedBy: string}}
 */
export function resolveSimple(a, b) {
  const outcome = resolveOpposed(a, b);
  if (outcome.winner !== 'empate') return outcome;
  const tie = compareRanking(a, b, 1);
  if (tie.winner === 'empate') return outcome;
  return { winner: tie.winner, margin: 0, decidedBy: BY_POSITION[tie.position] };
}

/**
 * Ataque corpo a corpo contra ataque corpo a corpo.
 * @returns {{winner: 'a'|'b'|'empate', margin: number, decidedBy: string,
 *   hits: {a: boolean, b: boolean}}} `hits.a`: o ataque de A acerta B.
 */
export function resolveMelee(a, b) {
  const outcome = resolveOpposed(a, b);
  const hits = {
    a: outcome.winner !== 'b' && attackPasses(a),
    b: outcome.winner !== 'a' && attackPasses(b),
  };
  return { ...outcome, hits };
}

/**
 * Ataque contra Defender-se.
 * @param {object} attack Resultado do teste de ataque.
 * @param {object} defense Resultado do teste de defesa.
 * @param {'a'|'b'} attackSide Lado do cartão que ataca.
 * @returns {{winner: 'a'|'b', margin: number, decidedBy: string, hits: {a: boolean, b: boolean}}}
 */
export function resolveDefense(attack, defense, attackSide) {
  const defenseSide = attackSide === 'a' ? 'b' : 'a';
  let outcome = resolveOpposed(attack, defense);
  if (outcome.winner === 'empate') {
    const tie = compareRanking(attack, defense, 2);
    outcome =
      tie.winner === 'empate'
        ? { winner: 'b', margin: 0, decidedBy: 'defesa' }
        : { winner: tie.winner, margin: 0, decidedBy: BY_POSITION[tie.position] };
  }
  // `outcome.winner` está na ordem (ataque, defesa): 'a' = o ataque venceu
  const attackWon = outcome.winner === 'a';
  const winner = attackWon ? attackSide : defenseSide;
  return {
    winner,
    margin: outcome.margin,
    decidedBy: outcome.decidedBy,
    hits: { [attackSide]: attackWon && attackPasses(attack), [defenseSide]: false },
  };
}
