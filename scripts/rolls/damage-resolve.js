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
 * Quem pode receber um dano aplicado sem alvo mirado (cartão de ataque comum), separado em
 * personagens e criaturas. A janela «Quem recebe» sempre pergunta (primeiro o tipo, depois qual).
 * - Personagens: o jogador vê as fichas que controla; o mestre, todas.
 * - Criaturas: as da cena atual (tokens); o jogador não vê as escondidas. O jogador não controla
 *   criaturas: o dano nelas é gravado pelo mestre (socket).
 * Cada candidato vem com `uuid` (do ator; nas criaturas, o ator do token) e `name`.
 * @param {{uuid: string, name: string, type: string, isOwner: boolean}[]} actors Atores do mundo.
 * @param {{name: string, hidden: boolean, actor: {uuid: string, type: string}|null}[]} tokens
 *   Tokens da cena atual.
 * @param {{isGM: boolean}} user
 * @returns {{personagens: {uuid: string, name: string}[], criaturas: {uuid: string, name: string}[]}}
 */
export function damageCandidates(actors, tokens, { isGM }) {
  const byName = (a, b) => a.name.localeCompare(b.name, 'pt-BR');
  const personagens = (actors ?? [])
    .filter((actor) => actor.type === 'personagem' && (isGM || actor.isOwner))
    .map(({ uuid, name }) => ({ uuid, name }))
    .sort(byName);
  const seen = new Set();
  const criaturas = [];
  for (const token of tokens ?? []) {
    const actor = token.actor;
    if (actor?.type !== 'criatura' || (!isGM && token.hidden) || seen.has(actor.uuid)) continue;
    seen.add(actor.uuid);
    criaturas.push({ uuid: actor.uuid, name: token.name || actor.name });
  }
  criaturas.sort(byName);
  return { personagens, criaturas };
}
