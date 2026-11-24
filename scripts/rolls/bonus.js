/**
 * Dados bônus escolhidos na janela pré-teste: até dois dados extras que entram só neste teste. Não
 * ficam gravados no personagem. Lógica pura, sem dependência do Foundry.
 */
export const BONUS_SLOTS = 2;
export const BONUS_SIDES = Object.freeze([4, 6, 8, 10, 12]);

/** Normaliza uma lista qualquer para os espaços válidos (dados inválidos viram 0). */
export function normalizeBonus(bonus) {
  const list = Array.isArray(bonus) ? bonus : [];
  return Array.from({ length: BONUS_SLOTS }, (_, i) => {
    const sides = Number(list[i]);
    return BONUS_SIDES.includes(sides) ? sides : 0;
  });
}

/** Dados que entram no teste (só os espaços preenchidos, na ordem). */
export function bonusDice(bonus) {
  return normalizeBonus(bonus).filter((sides) => sides > 0);
}
