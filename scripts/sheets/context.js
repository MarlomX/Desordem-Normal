/**
 * Preparação de dados para a ficha. Funções puras (sem Foundry), testadas em Node.
 */

// Desde a v0.28.7 o código mora em `context/`; este arquivo só reexporta (os imports de
// fora continuam iguais).
export {
  dieOptions,
  shiftDirection,
  buildAttributeRows,
  buildAttributeFields,
  buildSkillRows,
  addRowAttributes,
  buildAreaRows,
  buildExtraRows,
  buildFearChoices,
  buildRelationRows,
  buildEffectRows,
  matchesSearch,
  buildEffectPicker,
} from './context/rows.js';
export {
  DEFAULT_ITEM_ICON,
  itemThumb,
  buildEquipmentRows,
  buildChoices,
  buildAbilityRows,
} from './context/equipment.js';
export {
  SHEET_TABS,
  resolveActiveTab,
  buildTabs,
  tabForItemType,
  resourcePercent,
  stepResource,
  stepCounter,
  togglePip,
  buildStatusTags,
  isResourceLow,
  normalizeSearch,
  rowMatches,
  filterSkillRows,
  SKILL_SORT_MODES,
  DEFAULT_SKILL_SORT,
  normalizeSkillSort,
  skillRowOrder,
  nextOpenIds,
} from './context/tabs.js';
