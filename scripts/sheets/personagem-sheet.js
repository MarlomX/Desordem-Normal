import { SYSTEM_ID, ATRIBUTOS, PERICIAS, APTIDOES } from '../config.js';
import { rollSkill, rollAptitude } from '../rolls/chat.js';
import { damageActor, rollInjuryTest } from '../rolls/health.js';
import { injuryDT } from '../rolls/injury.js';
import { emotionalDamage, rollTraumaTest } from '../rolls/mind.js';
import { traumaDT } from '../rolls/emotional.js';
import {
  buildAttributeRows,
  buildSkillRows,
  buildAptitudeRows,
  buildLesionRows,
  buildFearChoices,
} from './context.js';

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/** Ficha do personagem (ApplicationV2). */
/**
 * Lê as caixas "controlar" e "abraçar" o pavor (valem só para o próximo teste) e as desmarca.
 * @param {HTMLElement} element Raiz da ficha.
 */
function takeFearOptions(element) {
  const control = element.querySelector('[data-controlar-pavor]');
  const embrace = element.querySelector('[data-abracar-pavor]');
  const options = {
    controlFear: Boolean(control?.checked),
    embraceFear: Boolean(embrace?.checked),
  };
  if (control) control.checked = false;
  if (embrace) embrace.checked = false;
  return options;
}

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
      applyEmotionalDamage: PersonagemSheet.#onApplyEmotionalDamage,
      rollTrauma: PersonagemSheet.#onRollTrauma,
      removeTrauma: PersonagemSheet.#onRemoveTrauma,
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
      nextTraumaDT: traumaDT(system.cena.testesTrauma),
      traumas: buildLesionRows(system.traumas, (key) => t(`DESORDEM.Traumas.${key}.Nome`)),
      fearChoices: buildFearChoices(system.estado.pavor, t('DESORDEM.Ficha.SemPavor')),
      lesions: buildLesionRows(system.lesoes, (key) => t(`DESORDEM.Lesoes.${key}.Nome`)),
    };
  }

  /** Clique no nome de uma perícia: faz o teste e publica no chat. */
  static async #onRollSkill(event, target) {
    await rollSkill(this.document, target.dataset.skill, takeFearOptions(this.element));
  }

  /** Clique no nome de uma área de Aptidão: faz o teste (Mente + área) e publica no chat. */
  static async #onRollAptitude(event, target) {
    await rollAptitude(this.document, target.dataset.aptitude, takeFearOptions(this.element));
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

  /** Aplica o dano emocional digitado (e o teste de trauma, se o PD chegar a 0). */
  static async #onApplyEmotionalDamage() {
    const amount = Math.trunc(Number(this.element.querySelector('[data-dano-emocional]').value));
    if (!(amount > 0)) return;
    await emotionalDamage(this.document, amount);
  }

  /** Teste de trauma manual. */
  static async #onRollTrauma() {
    await rollTraumaTest(this.document);
  }

  /** Remove um trauma da lista (cura manual; uma ocorrência, se ele se repete). */
  static async #onRemoveTrauma(event, target) {
    const traumas = [...this.document.system.traumas];
    const index = traumas.indexOf(target.dataset.trauma);
    if (index < 0) return;
    traumas.splice(index, 1);
    await this.document.update({ 'system.traumas': traumas });
  }
}