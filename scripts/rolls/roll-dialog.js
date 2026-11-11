/**
 * Janela pré-teste: o que o jogador pode escolher antes de rolar (dados bônus, habilidades,
 * controlar ou abraçar o pavor), com custos e uma prévia dos dados. Lógica pura, sem Foundry.
 */
import { COSTS, SNEAK_SKILLS } from './abilities.js';
import { bonusDice, normalizeBonus } from './bonus.js';
import { stepShift } from './dice.js';
import { CONTROL_FEAR_COST, EMBRACE_FEAR_COST, FEAR_MIN_DIE } from './fear.js';
import { MAX_COUNTED, planDice } from './test.js';

/**
 * Monta as opções disponíveis para um teste.
 * @param {Object} input
 * @param {string} input.skillKey Perícia (ou aptidão) do teste.
 * @param {number} input.attrDie Dado do atributo já com passos e contusão.
 * @param {number} input.skillDie Dado da perícia já com passos.
 * @param {number[]} [input.baseExtraDice] Dados extras fixos do teste (companheiro, não letal...).
 * @param {{impeto: boolean, sorrateiro: boolean}} input.has Habilidades que o personagem tem.
 * @param {{impeto: number, pd: number}} input.resources Espaços de ímpeto e PD atuais.
 * @param {number} [input.fearDie=0] Dado de pavor guardado na ficha.
 * @param {boolean} [input.ignoreFear=false] Testes que não sofrem o dado de pavor.
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
  const fear =
    fearDie && !ignoreFear
      ? {
          die: fearDie,
          controlPossible: fearDie > FEAR_MIN_DIE,
          controlledDie: fearDie > FEAR_MIN_DIE ? stepShift(fearDie, -1) : fearDie,
          controlCost: CONTROL_FEAR_COST,
          embraceCost: EMBRACE_FEAR_COST,
        }
      : null;
  return { skillKey, attrDie, skillDie, baseExtraDice, abilities, fear, resources };
}

/** Escolha inicial: nada marcado. */
export function emptySelection() {
  return { bonus: normalizeBonus([]), active: [], controlFear: false, embraceFear: false };
}

/**
 * Efeito de uma escolha: custos, dado de pavor resultante, dados rolados e erros.
 * Escolhas que não se aplicam (habilidade indisponível, controlar sem pavor) são ignoradas.
 * @returns {{
 *   selection: object, pdCost: number, impetoCost: number, pdLeft: number, impetoLeft: number,
 *   fear: {die: number|null, bonusDie: number|null}|null, rolledSides: number[],
 *   discardedExtras: number[], summedDice: number, errors: string[], valid: boolean
 * }}
 */
export function evaluateSelection(model, selection = emptySelection()) {
  const usable = new Map(model.abilities.filter((a) => a.available).map((a) => [a.key, a]));
  const active = [...new Set(selection.active ?? [])].filter((key) => usable.has(key));
  const control = Boolean(selection.controlFear) && Boolean(model.fear?.controlPossible);
  const embrace = Boolean(selection.embraceFear) && Boolean(model.fear);
  const bonus = bonusDice(selection.bonus);

  let pdCost = 0;
  let impetoCost = 0;
  for (const key of active) {
    pdCost += usable.get(key).cost.pd;
    impetoCost += usable.get(key).cost.impeto;
  }
  let fear = null;
  const boostDice = active.map((key) => usable.get(key).die);
  if (model.fear) {
    const die = control ? model.fear.controlledDie : model.fear.die;
    if (control) pdCost += model.fear.controlCost;
    if (embrace) pdCost += model.fear.embraceCost;
    fear = embrace ? { die: null, bonusDie: die } : { die, bonusDie: null };
    if (fear.bonusDie) boostDice.push(fear.bonusDie);
  }

  const plan = planDice({
    attrDie: model.attrDie,
    skillDie: model.skillDie,
    extraDice: [...model.baseExtraDice, ...bonus, ...boostDice],
  });
  const errors = [];
  if (pdCost > model.resources.pd) errors.push('pd');
  if (impetoCost > model.resources.impeto) errors.push('impeto');

  return {
    selection: {
      bonus: normalizeBonus(selection.bonus),
      active,
      controlFear: control,
      embraceFear: embrace,
    },
    pdCost,
    impetoCost,
    pdLeft: model.resources.pd - pdCost,
    impetoLeft: model.resources.impeto - impetoCost,
    fear,
    rolledSides: plan.rolledSides,
    discardedExtras: plan.discardedExtras,
    summedDice: Math.min(plan.rolledSides.length, MAX_COUNTED),
    errors,
    valid: errors.length === 0,
  };
}

/**
 * Converte a escolha nas opções que as rolagens já aceitam: `extraDice` (só os bônus manuais),
 * `active` (habilidades), `controlFear` e `embraceFear`.
 */
export function selectionToOptions(model, selection) {
  const evaluated = evaluateSelection(model, selection);
  return {
    extraDice: bonusDice(evaluated.selection.bonus),
    active: evaluated.selection.active,
    controlFear: evaluated.selection.controlFear,
    embraceFear: evaluated.selection.embraceFear,
  };
}
