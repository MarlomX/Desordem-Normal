/**
 * Dados bônus escolhidos na ficha: até dois dados extras que entram no próximo teste e depois são
 * desmarcados. Não ficam gravados no personagem. Lógica pura, sem dependência do Foundry.
 */
export const BONUS_SLOTS = 2;
export const BONUS_SIDES = Object.freeze([4, 6, 8, 10, 12]);

/** Dois espaços vazios (0 = sem dado). */
export function newBonus() {
  return Array.from({ length: BONUS_SLOTS }, () => 0);
}

/** Normaliza uma lista qualquer para os espaços válidos (dados inválidos viram 0). */
export function normalizeBonus(bonus) {
  const list = Array.isArray(bonus) ? bonus : [];
  return Array.from({ length: BONUS_SLOTS }, (_, i) => {
    const sides = Number(list[i]);
    return BONUS_SIDES.includes(sides) ? sides : 0;
  });
}

/** Define o dado de um espaço (devolve uma lista nova; espaço ou dado inválido não muda nada). */
export function setBonusSlot(bonus, slot, sides) {
  const list = normalizeBonus(bonus);
  const index = Math.trunc(Number(slot));
  if (!(index >= 0 && index < BONUS_SLOTS)) return list;
  const value = Number(sides);
  list[index] = BONUS_SIDES.includes(value) ? value : 0;
  return list;
}

/** Dados que entram no teste (só os espaços preenchidos, na ordem). */
export function bonusDice(bonus) {
  return normalizeBonus(bonus).filter((sides) => sides > 0);
}

/**
 * Espaços para a ficha, cada um com a lista do seletor (vazio, d4 a d12).
 * @param {number[]} bonus
 * @param {string} emptyLabel Texto do espaço vazio.
 */
export function buildBonusSlots(bonus, emptyLabel) {
  return normalizeBonus(bonus).map((sides, index) => ({
    index,
    sides,
    options: [0, ...BONUS_SIDES].map((value) => ({
      value,
      label: value === 0 ? emptyLabel : `d${value}`,
      selected: value === sides,
    })),
  }));
}
