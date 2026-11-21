/**
 * Janela Resolver dano: lógica pura (sem Foundry). Decide quanto do dano que chega fica depois das
 * escolhas de quem aplica (gastar um ponto de armadura, usar a redução do escudo) e quem pode
 * receber um dano aplicado sem alvo mirado.
 */
import { ARMOR_REDUCTION } from './equipment.js';

/**
 * Redução do escudo num dano vindo de um teste oposto (efeito `reducaoEscudo`): quem recebe o
 * dano perdeu o ataque, mas, se a soma do teste dele chegou à soma mínima do efeito, o dano cai
 * pela rolagem baixa dele.
 * @param {{somaMinima: number}|null} params Parâmetros do efeito do escudo empunhado (ou null).
 * @param {{total?: number, lowRoll?: number}|null} defender Resumo do teste de quem recebe o dano
 *   (do cartão oposto). Cartões antigos não guardam a rolagem baixa.
 * @returns {{applies: boolean, reduction: number, minimum: number, total: number}|null} `null` sem
 *   escudo com o efeito ou sem os números do teste; `applies`: a soma chegou ao mínimo.
 */
export function shieldReduction(params, defender) {
  if (!params || !defender) return null;
  const total = Number(defender.total);
  const low = Number(defender.lowRoll);
  if (!Number.isFinite(total) || !Number.isFinite(low) || low <= 0) return null;
  const minimum = Number(params.somaMinima) || 7;
  return { applies: total >= minimum, reduction: low, minimum, total };
}

/**
 * Dano final de um personagem depois das escolhas da janela. Ordem: armadura (−10, se marcada e
 * houver ponto), depois o escudo (− a rolagem baixa, se marcado e valer). Nunca abaixo de 0.
 * @param {Object} opts
 * @param {number} opts.amount Dano que chega.
 * @param {boolean} [opts.useArmor=false] Gastar 1 ponto de armadura.
 * @param {number} [opts.armorAvailable=0] Pontos de armadura restantes.
 * @param {boolean} [opts.useShield=false] Usar a redução do escudo.
 * @param {{applies: boolean, reduction: number}|null} [opts.shield=null] `shieldReduction`.
 * @returns {{raw: number, final: number, armorUsed: boolean, armorAmount: number,
 *   shieldUsed: boolean, shieldAmount: number}} `armorAmount`/`shieldAmount`: quanto cada um tirou.
 */
export function resolveDamage({
  amount,
  useArmor = false,
  armorAvailable = 0,
  useShield = false,
  shield = null,
}) {
  const raw = Math.max(0, Math.trunc(Number(amount) || 0));
  let value = raw;
  const armorUsed = Boolean(useArmor) && armorAvailable > 0 && raw > 0;
  const armorAmount = armorUsed ? Math.min(value, ARMOR_REDUCTION) : 0;
  value -= armorAmount;
  const shieldUsed = Boolean(useShield) && Boolean(shield?.applies) && value > 0;
  const shieldAmount = shieldUsed ? Math.min(value, shield.reduction) : 0;
  value -= shieldAmount;
  return { raw, final: value, armorUsed, armorAmount, shieldUsed, shieldAmount };
}

/**
 * Quem pode receber um dano aplicado sem alvo mirado (cartão de ataque comum).
 * - Jogador: as fichas de personagem que ele controla; com uma só, ela recebe direto.
 * - Mestre: todos os personagens, sempre pela lista.
 * @param {{id: string, name: string, type: string, isOwner: boolean}[]} actors Atores do mundo.
 * @param {{isGM: boolean}} user
 * @returns {{candidates: object[], direct: object|null}} `direct`: o único candidato do jogador
 *   (aplica sem perguntar); senão `null` e a lista decide.
 */
export function damageCandidates(actors, { isGM }) {
  const candidates = (actors ?? [])
    .filter((actor) => actor.type === 'personagem' && (isGM || actor.isOwner))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const direct = !isGM && candidates.length === 1 ? candidates[0] : null;
  return { candidates, direct };
}
