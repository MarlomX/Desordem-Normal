import { SYSTEM_ID, ATRIBUTOS, PERICIAS, APTIDOES } from '../config.js';
import { rollSkill, rollAptitude } from '../rolls/chat.js';
import { damageActor, rollInjuryTest } from '../rolls/health.js';
import { injuryDT } from '../rolls/injury.js';
import {
  buildAttributeRows,
  buildSkillRows,
  buildAptitudeRows,
  buildLesionRows,
} from './context.js';

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
      rollAptitude: PersonagemSheet.#onRollAptitude,
      applyDamage: PersonagemSheet.#onApplyDamage,
      rollInjury: PersonagemSheet.#onRollInjury,
      removeLesion: PersonagemSheet.#onRemoveLesion,
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
      aptitudes: buildAptitudeRows(system.aptidoes, APTIDOES, (key) =>
        t(`DESORDEM.Aptidoes.${key}`),
      ),
      aptitudeAttrLabel: t('DESORDEM.Atributos.mente'),
      nextInjuryDT: injuryDT(system.cena.testesLesao),
      lesions: buildLesionRows(system.lesoes, (key) => t(`DESORDEM.Lesoes.${key}.Nome`)),
    };
  }

  /** Clique no nome de uma perícia: faz o teste e publica no chat. */
  static async #onRollSkill(event, target) {
    await rollSkill(this.document, target.dataset.skill);
  }

  /** Clique no nome de uma área de Aptidão: faz o teste (Mente + área) e publica no chat. */
  static async #onRollAptitude(event, target) {
    await rollAptitude(this.document, target.dataset.aptitude);
  }

  /** Aplica o dano digitado (e o teste de lesão, se o PV chegar a 0). */
  static async #onApplyDamage() {
    const amount = Math.trunc(Number(this.element.querySelector('[data-dano]').value));
    const nonLethal = this.element.querySelector('[data-nao-letal]').checked;
    if (!(amount > 0)) return;
    await damageActor(this.document, amount, { nonLethal });
  }

  /** Teste de lesão manual (por exemplo, o do moribundo no fim da rodada). */
  static async #onRollInjury() {
    const nonLethal = this.element.querySelector('[data-nao-letal]').checked;
    await rollInjuryTest(this.document, { nonLethal });
  }

  /** Remove uma lesão da lista (uma ocorrência, se ela se repete). */
  static async #onRemoveLesion(event, target) {
    const lesoes = [...this.document.system.lesoes];
    const index = lesoes.indexOf(target.dataset.lesion);
    if (index < 0) return;
    lesoes.splice(index, 1);
    await this.document.update({ 'system.lesoes': lesoes });
  }
}