import { SYSTEM_ID, PERICIAS } from '../config.js';
import { WEAPON_KINDS } from '../rolls/equipment.js';
import { AUTOMATIONS } from '../rolls/abilities.js';
import { buildChoices } from './context.js';
import { isThreat } from '../rolls/threat.js';
import { DAMAGE_BASES } from '../rolls/damage.js';

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

/** Ficha dos itens (armas, armaduras e itens em geral), uma só para os três tipos. */
export default class ItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ['desordem-normal', 'item'],
    position: { width: 440, height: 'auto' },
    window: { resizable: true },
    form: { submitOnChange: true },
  };

  static PARTS = {
    body: { template: `systems/${SYSTEM_ID}/templates/item/item.hbs` },
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.document;
    const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
    const skills = Object.keys(PERICIAS)
      .map((key) => ({ key, label: t(`DESORDEM.Pericias.${key}`) }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));

    return {
      ...context,
      item,
      system: item.system,
      editable: this.isEditable,
      typeLabel: t(`TYPES.Item.${item.type}`),
      isWeapon: item.type === 'arma',
      isArmor: item.type === 'armadura',
      isOther: item.type === 'item',
      isAbility: item.type === 'habilidade',
      // Habilidade de uma criatura: só nome e texto (sem perfil nem automação)
      ownerIsThreat: isThreat(item.parent),
      automationChoices: [
        {
          value: '',
          label: t('DESORDEM.Item.Automacoes.nenhuma'),
          selected: item.system.automacao === '',
        },
        ...AUTOMATIONS.map((key) => ({
          value: key,
          label: t(`DESORDEM.Item.Automacoes.${key}`),
          selected: item.system.automacao === key,
        })),
      ],
      kindChoices: buildChoices(WEAPON_KINDS, item.system.tipo, (kind) =>
        t(`DESORDEM.Item.Tipo.${kind}`),
      ),
      // Base do dano: RA (normal) ou RB (desarmado)
      baseChoices: buildChoices(DAMAGE_BASES, item.system.baseDano ?? 'ra', (base) =>
        t(`DESORDEM.Item.Base.${base}`),
      ),
      handsChoices: buildChoices([1, 2], item.system.maos, (hands) =>
        t(`DESORDEM.Item.Maos.${hands}`),
      ),
      skillChoices: [
        {
          value: '',
          label: t('DESORDEM.Item.PericiaPadrao'),
          selected: item.system.pericia === '',
        },
        ...skills.map(({ key, label }) => ({
          value: key,
          label,
          selected: item.system.pericia === key,
        })),
      ],
    };
  }
}
