/**
 * Efeitos de habilidade: lógica pura (sem Foundry) do catálogo de efeitos.
 *
 * Uma habilidade é um texto mais uma lista de efeitos. Cada efeito tem um `id`, um `tipo`
 * escolhido num catálogo fechado (`EFFECT_TYPES`) e os parâmetros desse tipo (`params`). O tipo
 * já diz onde o efeito aparece (janela pré-teste, cartão do teste, ficha, gatilho); os parâmetros
 * só trazem números, perícias e custos. Não há código livre.
 *
 * Itens antigos (até a 0.19.x) não têm efeitos, só o campo `automacao`: `itemEffects` monta os
 * efeitos equivalentes na hora (`legacyEffects`), com os mesmos números de antes.
 */

// Desde a v0.28.7 o código mora em `ability-effects/`; este arquivo só reexporta (os imports de
// fora continuam iguais).
export {
  DIE_SIDES,
  TRIGGERS,
  TEST_KINDS,
  ATTRIBUTE_CHOICES,
  COST_KINDS,
  OPTION_GROUPS,
  LIMITS,
  ACTION_RESULTS,
  CONDITIONS,
  ATTACK_STEP_WHEN,
  HEAL_RESOURCES,
  TARGET_ATTRIBUTES,
  AMMO_RANGES,
  TOOLS,
  STEP_ATTRIBUTE_CHOICES,
  STEP_TARGETS,
  MODIFIER_TARGETS,
  MAX_RESOURCES,
  CONDITION_TEST_KINDS,
  IMPETO_MAX,
  ANALISE_MAX,
  ANALISE_GAIN,
  COSTS,
  SNEAK_SKILLS,
  normalizeCost,
  EFFECT_TYPES,
  CONDITION_ONLY_TYPES,
  WEAPON_ONLY_TYPES,
  EQUIPMENT_ONLY_TYPES,
  USE_EFFECT_TYPES,
  defaultParams,
  normalizeEffect,
  normalizeEffects,
} from './ability-effects/catalog.js';
export {
  legacyEffects,
  itemEffects,
  ITEM_EFFECT_TYPES,
  itemEffectTypes,
  effectItemType,
  itemInUse,
  ownEffects,
  collectEffects,
  effectsOfType,
  effectKey,
} from './ability-effects/legacy.js';
export {
  resourceDefs,
  resourceValue,
  addResource,
  triggerChanges,
  sceneResources,
  canPay,
  payUpdates,
} from './ability-effects/resources.js';
export {
  emptyCostBag,
  costBag,
  addCostBags,
  bagUpdates,
  costShortfall,
  companionOption,
  companionHurt,
  dialogDiceOptions,
} from './ability-effects/roll-dialog.js';
export {
  hasMartialProficiency,
  weaponAttackEffects,
  itemUsePlan,
  ammoEffectOf,
  ammoOptions,
  hasTool,
  armorExtraPoints,
  firstWeaponAttack,
  markWeaponAttack,
  weaponTestKind,
  conditionHolds,
  conditionalOrigin,
  fromAbility,
  syncConditionalEffects,
  conditionFlips,
  pickBonusDice,
  spendBonusDice,
  roundLimitOk,
  halfOrLess,
  bonusDiceGranted,
  groupBonusDice,
} from './ability-effects/items.js';
