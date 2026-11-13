/**
 * Dado de pavor: escolha de qual dado rolar em um teste e custos em PD.
 * Lógica pura, sem dependência do Foundry. A mecânica de anular dados está em `resolveTest`.
 */
import { DIE_STEPS } from './dice.js';

export const FEAR_START_DIE = 6; // dado recebido ao ganhar pavor pela primeira vez
export const FEAR_MIN_DIE = 4;
export const FEAR_MAX_DIE = 20; // o pavor nunca passa de d20

/** Escada de passos do dado de pavor: a dos outros dados (d4 a d12) mais o d20 no topo. */
export const FEAR_STEPS = Object.freeze([...DIE_STEPS, FEAR_MAX_DIE]);

/**
 * Move o dado de pavor pela escada de passos (d4 a d12 e d20), sem sair das pontas.
 * @param {number} sides Lados do dado de pavor.
 * @param {number} delta Passos (positivo aumenta, negativo reduz).
 */
export function fearStepShift(sides, delta) {
  const index = FEAR_STEPS.indexOf(sides);
  if (index === -1) throw new RangeError(`Dado de pavor inválido: d${sides}`);
  const target = Math.min(FEAR_STEPS.length - 1, Math.max(0, index + delta));
  return FEAR_STEPS[target];
}
export const CONTROL_FEAR_COST = 1;
export const EMBRACE_FEAR_COST = 5;

/** Dado de pavor depois de receber o efeito: começa em d6 e, se já tem, sobe um passo (até d20). */
export function increaseFear(current) {
  if (!current) return FEAR_START_DIE;
  return fearStepShift(current, 1);
}

/**
 * Define o dado de pavor e os dados extras de um teste, com os custos em PD.
 * - Controlar: gasta 1 PD e reduz o dado um passo, só neste teste (sem efeito em d4, e sem custo).
 * - Abraçar: gasta 5 PD e o dado vira um dado bônus, só neste teste (o pavor continua depois).
 * Se o personagem não tem pavor, ou o teste ignora o pavor, nada disso se aplica.
 *
 * @param {Object} opts
 * @param {number} [opts.fearDie=0] Dado de pavor guardado na ficha (0 = sem pavor).
 * @param {boolean} [opts.ignore=false] Teste que ignora o pavor (ex.: teste de esconderijo inicial).
 * @param {boolean} [opts.control=false]
 * @param {boolean} [opts.embrace=false]
 * @param {number} [opts.pd=Infinity] PD atuais, para validar o custo.
 * @returns {{fearDie: number|null, bonusDie: number|null, pdCost: number}}
 */
export function resolveFearOptions({
  fearDie = 0,
  ignore = false,
  control = false,
  embrace = false,
  pd = Infinity,
} = {}) {
  if (!fearDie || ignore) return { fearDie: null, bonusDie: null, pdCost: 0 };

  let die = fearDie;
  let pdCost = 0;
  if (control && die > FEAR_MIN_DIE) {
    die = fearStepShift(die, -1);
    pdCost += CONTROL_FEAR_COST;
  }
  if (embrace) pdCost += EMBRACE_FEAR_COST;
  if (pdCost > pd) throw new RangeError(`PD insuficientes: custo ${pdCost}, disponíveis ${pd}`);

  return embrace
    ? { fearDie: null, bonusDie: die, pdCost }
    : { fearDie: die, bonusDie: null, pdCost };
}
