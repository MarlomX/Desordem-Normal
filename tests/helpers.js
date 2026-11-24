import { dialogDiceOptions, legacyEffects } from '../scripts/rolls/ability-effects.js';

/** Gerador determinístico: devolve os valores na ordem e registra os dados pedidos. */
export function fixedRng(values) {
  const queue = [...values];
  const rng = (sides) => {
    rng.calls.push(sides);
    if (queue.length === 0) throw new Error('fixedRng: sem valores restantes');
    return queue.shift();
  };
  rng.calls = [];
  return rng;
}

/**
 * Dados extras do ímpeto e do sorrateiro como a janela pré-teste os recebe (`diceOptions`). Até a
 * v0.27.x a janela montava esta lista sozinha pelo atalho `has: {impeto, sorrateiro}`; os testes
 * passam a lista pronta, com os mesmos efeitos antigos.
 * @param {string} skillKey Perícia do teste (o sorrateiro só vale em Crime e Furtividade).
 * @param {{impeto?: boolean, sorrateiro?: boolean}} [has]
 */
export function legacyDice(skillKey, { impeto = true, sorrateiro = true } = {}) {
  return dialogDiceOptions(
    [
      ...(impeto ? legacyEffects('impeto') : []),
      ...(sorrateiro ? legacyEffects('sorrateiro') : []),
    ],
    { skillKey },
  );
}
