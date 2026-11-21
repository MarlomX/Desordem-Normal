/**
 * Assumir ataque (efeito `interceptar`) no cartão de ataque comum: quem tem a habilidade pronta
 * assume o ataque enquanto o dano não foi aplicado, e o dano do cartão passa a ir para ele.
 * A marca do cartão (`danoArma`) é {amount, naoLetal, guardiao?, aplicado?}; guardiao =
 * {actorUuid, nome, habilidade}. Lógica pura, sem dependência do Foundry.
 */

/**
 * Dados de quem assume o ataque, no formato gravado no cartão.
 * @param {{uuid: string, name: string}} actor
 * @param {{itemName?: string}} entry Efeito `interceptar` usado (o nome da habilidade).
 */
export function guardianData(actor, entry) {
  return {
    actorUuid: String(actor?.uuid ?? ''),
    nome: String(actor?.name ?? ''),
    habilidade: String(entry?.itemName ?? ''),
  };
}

/** Ainda dá para assumir o ataque deste cartão (há dano, ninguém assumiu e não foi aplicado)? */
export function canGuardWeaponCard(flag) {
  return Boolean(flag) && !flag.guardiao && !flag.aplicado;
}

/**
 * Marca do cartão com o Guardião. Devolve null se não dá mais para assumir, se falta o ator ou se
 * o Guardião é quem atacou.
 * @param {object} flag `danoArma` do cartão.
 * @param {{actorUuid: string, nome: string, habilidade: string}} guardian
 * @param {string} [attackerUuid] Quem atacou (não pode assumir o próprio ataque).
 */
export function guardWeaponCard(flag, guardian, attackerUuid = '') {
  if (!canGuardWeaponCard(flag) || !guardian?.actorUuid) return null;
  if (attackerUuid && guardian.actorUuid === attackerUuid) return null;
  return { ...flag, guardiao: { ...guardian } };
}
