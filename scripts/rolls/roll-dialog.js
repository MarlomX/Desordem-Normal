/**
 * Janela pré-teste: o que o jogador pode escolher antes de rolar (dados bônus, habilidades,
 * controlar ou abraçar o pavor), com custos e uma prévia dos dados. Lógica pura, sem Foundry.
 */
import { COSTS, SNEAK_SKILLS } from './abilities.js';
import { NON_LETHAL_BONUS_DIE } from './injury.js';
import { BONUS_SLOTS, bonusDice, normalizeBonus } from './bonus.js';
import { CONTROL_FEAR_COST, EMBRACE_FEAR_COST, FEAR_MIN_DIE, fearStepShift } from './fear.js';
import { DEFAULT_DT, MAX_COUNTED, planDice } from './test.js';

/** Espaços de dado extra de um teste: o limite de 4 dados rolados menos atributo e perícia. */
export const EXTRA_SLOTS = BONUS_SLOTS;

const MAX_DT = 99;

/** DT válida (inteiro de 1 a 99); valores inválidos viram o padrão. */
export function normalizeDt(value, fallback = DEFAULT_DT) {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, MAX_DT);
}

/**
 * Monta as opções disponíveis para um teste.
 * @param {Object} input
 * @param {string} input.skillKey Perícia (ou aptidão) do teste.
 * @param {number} input.attrDie Dado do atributo já com passos e contusão.
 * @param {number} input.skillDie Dado da perícia já com passos.
 * @param {number[]} [input.baseExtraDice] Dados extras fixos do teste (companheiro, não letal...).
 * @param {{impeto?: boolean, sorrateiro?: boolean, naoLetal?: boolean}} input.has Habilidades que
 *   o personagem tem; `naoLetal` só no teste de lesão (+d6, sem custo).
 * @param {{impeto: number, pd: number}} input.resources Espaços de ímpeto e PD atuais.
 * @param {number} [input.fearDie=0] Dado de pavor guardado na ficha.
 * @param {boolean} [input.ignoreFear=false] Testes que não sofrem o dado de pavor.
 * @param {number} [input.dt=7] DT padrão do teste.
 * @param {boolean} [input.showDt=true] Falso em testes sem DT (por exemplo, a esquiva).
 */
export function buildRollModel({
  skillKey,
  attrDie,
  skillDie,
  baseExtraDice = [],
  has = {},
  resources,
  fearDie = 0,
  ignoreFear = false,
  dt = DEFAULT_DT,
  showDt = true,
}) {
  const abilities = [];
  if (has.impeto) {
    const ok = resources.impeto >= COSTS.impetoDado;
    abilities.push({
      key: 'impetoDado',
      die: 4,
      cost: { impeto: COSTS.impetoDado, pd: 0 },
      available: ok,
      reason: ok ? null : 'impeto',
    });
  }
  if (has.sorrateiro && SNEAK_SKILLS.includes(skillKey)) {
    const ok = resources.pd >= COSTS.sorrateiro;
    abilities.push({
      key: 'sorrateiro',
      die: 8,
      cost: { impeto: 0, pd: COSTS.sorrateiro },
      available: ok,
      reason: ok ? null : 'pd',
    });
  }
  if (has.naoLetal) {
    abilities.push({
      key: 'naoLetal',
      die: NON_LETHAL_BONUS_DIE,
      cost: { impeto: 0, pd: 0 },
      available: true,
      reason: null,
    });
  }
  const fear =
    fearDie && !ignoreFear
      ? {
          die: fearDie,
          controlPossible: fearDie > FEAR_MIN_DIE,
          controlledDie: fearDie > FEAR_MIN_DIE ? fearStepShift(fearDie, -1) : fearDie,
          controlCost: CONTROL_FEAR_COST,
          embraceCost: EMBRACE_FEAR_COST,
        }
      : null;
  return { skillKey, attrDie, skillDie, baseExtraDice, abilities, fear, resources, dt, showDt };
}

/** Escolha inicial: nada marcado e a DT padrão do teste. */
export function emptySelection(dt) {
  return {
    bonus: normalizeBonus([]),
    active: [],
    controlFear: false,
    embraceFear: false,
    dt,
  };
}

/**
 * Efeito de uma escolha: custos, dado de pavor resultante, espaços de dado extra e erros.
 *
 * Todo dado extra ocupa um dos dois espaços (limite de 4 dados rolados com atributo e perícia),
 * nesta ordem: dados fixos do teste (companheiro, não letal), habilidades marcadas, pavor abraçado
 * e, por último, os bônus escolhidos à mão. O que não cabe é ignorado. O dado de pavor normal
 * não ocupa espaço.
 * @returns {{
 *   selection: object, dt: number|null, pdCost: number, impetoCost: number, pdLeft: number,
 *   impetoLeft: number, fear: {die: number|null, bonusDie: number|null}|null,
 *   slots: {kind: string, sides: number, locked: boolean}[], blocked: {abilities: string[],
 *   embrace: boolean}, rolledSides: number[], summedDice: number, errors: string[], valid: boolean
 * }}
 */
export function evaluateSelection(model, selection = emptySelection(model.dt)) {
  const usable = new Map(model.abilities.filter((a) => a.available).map((a) => [a.key, a]));
  const wanted = new Set(selection.active ?? []);
  const control = Boolean(selection.controlFear) && Boolean(model.fear?.controlPossible);

  // Dados que ocupam espaço sem escolha manual, em ordem
  const locked = model.baseExtraDice.map((sides) => ({ kind: 'base', sides, locked: true }));
  const active = [];
  for (const [key, ability] of usable) {
    if (!wanted.has(key) || locked.length >= EXTRA_SLOTS) continue;
    active.push(key);
    locked.push({ kind: key, sides: ability.die, locked: true });
  }
  let fear = null;
  let embrace = false;
  if (model.fear) {
    const die = control ? model.fear.controlledDie : model.fear.die;
    embrace = Boolean(selection.embraceFear) && locked.length < EXTRA_SLOTS;
    fear = embrace ? { die: null, bonusDie: die } : { die, bonusDie: null };
    if (embrace) locked.push({ kind: 'pavor', sides: die, locked: true });
  }

  // O que sobra de espaço é dos bônus escolhidos à mão
  const free = Math.max(0, EXTRA_SLOTS - locked.length);
  const manual = bonusDice(selection.bonus).slice(0, free);
  const slots = [
    ...locked,
    ...manual.map((sides) => ({ kind: 'manual', sides, locked: false })),
    ...Array.from({ length: free - manual.length }, () => ({
      kind: 'vazio',
      sides: 0,
      locked: false,
    })),
  ].slice(0, Math.max(EXTRA_SLOTS, locked.length));
  const roomLeft = free - manual.length > 0;

  let pdCost = 0;
  let impetoCost = 0;
  for (const key of active) {
    pdCost += usable.get(key).cost.pd;
    impetoCost += usable.get(key).cost.impeto;
  }
  if (model.fear) {
    if (control) pdCost += model.fear.controlCost;
    if (embrace) pdCost += model.fear.embraceCost;
  }

  const lockedSides = (kinds) => locked.filter((d) => kinds(d.kind)).map((d) => d.sides);
  const plan = planDice({
    attrDie: model.attrDie,
    skillDie: model.skillDie,
    extraDice: [
      ...lockedSides((kind) => kind === 'base'),
      ...manual,
      ...lockedSides((kind) => kind !== 'base'),
    ],
  });
  const errors = [];
  if (pdCost > model.resources.pd) errors.push('pd');
  if (impetoCost > model.resources.impeto) errors.push('impeto');

  return {
    selection: {
      bonus: normalizeBonus(manual),
      active,
      controlFear: control,
      embraceFear: embrace,
      dt: model.showDt ? normalizeDt(selection.dt, model.dt) : null,
    },
    dt: model.showDt ? normalizeDt(selection.dt, model.dt) : null,
    pdCost,
    impetoCost,
    pdLeft: model.resources.pd - pdCost,
    impetoLeft: model.resources.impeto - impetoCost,
    fear,
    slots,
    blocked: {
      abilities: [...usable.keys()].filter((key) => !active.includes(key) && !roomLeft),
      embrace: Boolean(model.fear) && !embrace && !roomLeft,
    },
    rolledSides: plan.rolledSides,
    summedDice: Math.min(plan.rolledSides.length, MAX_COUNTED),
    errors,
    valid: errors.length === 0,
  };
}

/**
 * Converte a escolha nas opções que as rolagens já aceitam: `extraDice` (só os bônus manuais),
 * `active` (habilidades), `controlFear`, `embraceFear` e, se o teste tem DT, `dt`.
 */
export function selectionToOptions(model, selection) {
  const evaluated = evaluateSelection(model, selection);
  const options = {
    extraDice: bonusDice(evaluated.selection.bonus),
    active: evaluated.selection.active,
    controlFear: evaluated.selection.controlFear,
    embraceFear: evaluated.selection.embraceFear,
  };
  if (evaluated.dt !== null) options.dt = evaluated.dt;
  return options;
}
