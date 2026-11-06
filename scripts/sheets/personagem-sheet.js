import { SYSTEM_ID, ATRIBUTOS, PERICIAS } from '../config.js';
import { rollSkill } from '../rolls/chat.js';
import { buildAttributeRows, buildSkillRows } from './context.js';

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/** Ficha do personagem (ApplicationV2). */
export default class PersonagemSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ['desordem-normal', 'personagem'],
    position: { width: 680, height: 760 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      rollSkill: PersonagemSheet.#onRollSkill,
    },
  };

  static PARTS = {
    body: { template: `systems/${SYSTEM_ID}/templates/actor/personagem.hbs` },
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const { system } = this.document;
    const t = (key) => game.i18n.localize(key);

    return {
      ...context,
      actor: this.document,
      system,
      editable: this.isEditable,
      attributes: buildAttributeRows(system.atributos, ATRIBUTOS, (key) =>
        t(`DESORDEM.Atributos.${key}`),
      ),
      skills: buildSkillRows(system.pericias, PERICIAS, {
        skillLabel: (key) => t(`DESORDEM.Pericias.${key}`),
        attrLabel: (key) => t(`DESORDEM.Atributos.${key}`),
      }),
    };
  }

  /** Clique no nome de uma perícia: faz o teste e publica no chat. */
  static async #onRollSkill(event, target) {
    await rollSkill(this.document, target.dataset.skill);
  }
}
