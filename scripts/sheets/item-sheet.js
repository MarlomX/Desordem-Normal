import { SYSTEM_ID, PERICIAS } from '../config.js';
import { WEAPON_KINDS } from '../rolls/equipment.js';
import { buildChoices } from './context.js';

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
      kindChoices: buildChoices(WEAPON_KINDS, item.system.tipo, (kind) =>
        t(`DESORDEM.Item.Tipo.${kind}`),
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
