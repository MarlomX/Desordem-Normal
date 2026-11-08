import { SYSTEM_ID, ATRIBUTOS, PERICIAS, APTIDOES } from '../config.js';
import { rollSkill, rollAptitude } from '../rolls/chat.js';
import { damageActor, rollInjuryTest } from '../rolls/health.js';
import { injuryDT } from '../rolls/injury.js';
import { emotionalDamage, rollTraumaTest } from '../rolls/mind.js';
import { traumaDT } from '../rolls/emotional.js';
import { invokeRelation } from '../rolls/relation-chat.js';
import { attackWithWeapon, useItem } from '../rolls/equipment-chat.js';
import { addEffect, removeEffect, updateEffect } from '../rolls/effects.js';
import {
  toggleActive,
  impetoStep,
  impetoAction,
  gainAnalysisMarkers,
  rollDodge,
  healAlly,
  endScene,
} from '../rolls/abilities-chat.js';
import {
  addRelation,
  removeRelation,
  updateRelation,
  setRelationDegree,
} from '../rolls/relation.js';
import {
  buildAttributeRows,
  buildSkillRows,
  buildAptitudeRows,
  buildLesionRows,
  buildFearChoices,
  buildRelationRows,
  buildEffectRows,
  buildEquipmentRows,
  buildAbilityRows,
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
      addRelation: PersonagemSheet.#onAddRelation,
      removeRelation: PersonagemSheet.#onRemoveRelation,
      setRelationDegree: PersonagemSheet.#onSetRelationDegree,
      invokeRelation: PersonagemSheet.#onInvokeRelation,
      createItem: PersonagemSheet.#onCreateItem,
      editItem: PersonagemSheet.#onEditItem,
      deleteItem: PersonagemSheet.#onDeleteItem,
      attackWeapon: PersonagemSheet.#onAttackWeapon,
      useItem: PersonagemSheet.#onUseItem,
      addEffect: PersonagemSheet.#onAddEffect,
      removeEffect: PersonagemSheet.#onRemoveEffect,
      impetoStep: PersonagemSheet.#onImpetoStep,
      impetoAction: PersonagemSheet.#onImpetoAction,
      gainAnalysis: PersonagemSheet.#onGainAnalysis,
      dodge: PersonagemSheet.#onDodge,
      healAlly: PersonagemSheet.#onHealAlly,
      newScene: PersonagemSheet.#onNewScene,
    },
    // Itens podem ser arrastados da barra lateral ou de outra ficha para esta
    dragDrop: [{ dragSelector: '[data-item-id]', dropSelector: null }],
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
      traumas: buildLesionRows(
        system.traumas,
        (key) => t(`DESORDEM.Traumas.${key}.Nome`),
        (key) => t(`DESORDEM.Traumas.${key}.Descricao`),
      ),
      fearChoices: buildFearChoices(system.estado.pavor, t('DESORDEM.Ficha.SemPavor')),
      lesions: buildLesionRows(
        system.lesoes,
        (key) => t(`DESORDEM.Lesoes.${key}.Nome`),
        (key) => t(`DESORDEM.Lesoes.${key}.Descricao`),
      ),
      effects: buildEffectRows(system.efeitos, {
        attrLabel: (key) => t(`DESORDEM.Atributos.${key}`),
        noAttrLabel: t('DESORDEM.Ficha.EfeitoSemAtributo'),
        attributes: ATRIBUTOS,
        editable: this.isEditable,
      }),
      abilities: buildAbilityRows(
        this.document.items
          .filter((item) => item.type === 'habilidade')
          .map((item) => ({ id: item.id, name: item.name, system: item.system })),
        {
          active: system.ativas,
          resources: system.recursos,
          hurtCompanion: system.cena.animalFerido,
          editable: this.isEditable,
        },
      ),
      equipment: buildEquipmentRows(
        this.document.items.map((item) => ({
          id: item.id,
          name: item.name,
          type: item.type,
          system: item.system,
        })),
        {
          kindLabel: (kind) => t(`DESORDEM.Item.Tipo.${kind}`),
          handsLabel: (hands) => t(`DESORDEM.Item.Maos.${hands}`),
          skillLabel: (key) => t(`DESORDEM.Pericias.${key}`),
          editable: this.isEditable,
        },
      ),
      relations: buildRelationRows(system.relacoes, {
        degreeLabel: (key) => t(`DESORDEM.Relacao.Grau.${key}`),
        editable: this.isEditable,
      }),
    };
  }

  /** Liga os campos de texto e a caixa "usada" das relações (sem `name`, fora do formulário). */
  async _onRender(context, options) {
    await super._onRender(context, options);
    for (const field of this.element.querySelectorAll('[data-relacao-campo]')) {
      field.addEventListener('change', (event) => this.#onRelationField(event.currentTarget));
    }
    for (const field of this.element.querySelectorAll('[data-efeito-campo]')) {
      field.addEventListener('change', (event) => this.#onEffectField(event.currentTarget));
    }
    for (const field of this.element.querySelectorAll('[data-ativa]')) {
      field.addEventListener('change', (event) =>
        toggleActive(this.document, event.currentTarget.dataset.ativa),
      );
    }
    for (const field of this.element.querySelectorAll('[data-item-campo]')) {
      field.addEventListener('change', (event) => this.#onItemField(event.currentTarget));
    }
  }

  /** Edição de um campo de um efeito temporário (nome, descrição, atributo ou passos). */
  async #onEffectField(field) {
    const value = field.type === 'checkbox' ? field.checked : field.value;
    const changes = { [field.dataset.efeitoCampo]: value };
    const effects = this.document.toObject().system.efeitos;
    await this.document.update({
      'system.efeitos': updateEffect(effects, Number(field.dataset.index), changes),
    });
  }

  /** Edição rápida de um campo do item na ficha (empunhada, vestida, quantidade, usos). */
  async #onItemField(field) {
    const item = this.document.items.get(field.dataset.itemId);
    if (!item) return;
    const value = field.type === 'checkbox' ? field.checked : Number(field.value);
    await item.update({ [`system.${field.dataset.itemCampo}`]: value });
  }

  /** Lista de relações como dados simples, pronta para ser alterada e regravada. */
  #relations() {
    return this.document.toObject().system.relacoes;
  }

  /** Grava a nova lista de relações. */
  async #saveRelations(relations) {
    await this.document.update({ 'system.relacoes': relations });
  }

  /** Edição de um campo de uma relação (pessoa, descrição ou "usada"). */
  async #onRelationField(field) {
    const value = field.type === 'checkbox' ? field.checked : field.value;
    const changes = { [field.dataset.relacaoCampo]: value };
    const index = Number(field.dataset.index);
    await this.#saveRelations(updateRelation(this.#relations(), index, changes));
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

  /** Acrescenta uma relação nova (grau 1) à ficha. */
  static async #onAddRelation() {
    await this.#saveRelations(addRelation(this.#relations()));
  }

  /** Remove a relação clicada. */
  static async #onRemoveRelation(event, target) {
    await this.#saveRelations(removeRelation(this.#relations(), Number(target.dataset.index)));
  }

  /** Clique em uma bolinha: muda o grau da relação. */
  static async #onSetRelationDegree(event, target) {
    const index = Number(target.dataset.index);
    const degree = Number(target.dataset.degree);
    await this.#saveRelations(setRelationDegree(this.#relations(), index, degree));
  }

  /** Invoca a relação: marca como usada e avisa a mesa no chat (o cartão traz o botão de motivar). */
  static async #onInvokeRelation(event, target) {
    await invokeRelation(this.document, Number(target.dataset.index));
  }

  /** Cria um item novo do tipo clicado e abre a ficha dele. */
  static async #onCreateItem(event, target) {
    const { type } = target.dataset;
    const [item] = await this.document.createEmbeddedDocuments('Item', [
      { name: game.i18n.localize(`DESORDEM.Item.Novo.${type}`), type },
    ]);
    item?.sheet.render(true);
  }

  /** Abre a ficha do item. */
  static async #onEditItem(event, target) {
    this.document.items.get(target.dataset.itemId)?.sheet.render(true);
  }

  /** Remove o item da ficha, depois de confirmar. */
  static async #onDeleteItem(event, target) {
    const item = this.document.items.get(target.dataset.itemId);
    if (!item) return;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize('DESORDEM.Item.Remover') },
      content: `<p>${game.i18n.localize('DESORDEM.Item.ConfirmarRemover')}</p>`,
      rejectClose: false,
      modal: true,
    });
    if (confirmed === true) await item.delete();
  }

  /** Ataca com a arma: teste da perícia da arma e, se acertar, cartão com o dano. */
  static async #onAttackWeapon(event, target) {
    const weapon = this.document.items.get(target.dataset.itemId);
    if (weapon) await attackWithWeapon(this.document, weapon, takeFearOptions(this.element));
  }

  /** Usa o item (gasta um uso ou uma unidade) e avisa no chat. */
  static async #onUseItem(event, target) {
    const item = this.document.items.get(target.dataset.itemId);
    if (item) await useItem(this.document, item);
  }

  /** Acrescenta um efeito temporário vazio à ficha. */
  static async #onAddEffect() {
    const effects = this.document.toObject().system.efeitos;
    await this.document.update({ 'system.efeitos': addEffect(effects) });
  }

  /** Remove o efeito temporário clicado. */
  static async #onRemoveEffect(event, target) {
    const effects = this.document.toObject().system.efeitos;
    await this.document.update({
      'system.efeitos': removeEffect(effects, Number(target.dataset.index)),
    });
  }

  /** Ímpeto: gasta 3 espaços para subir um atributo um passo até o fim da cena. */
  static async #onImpetoStep() {
    await impetoStep(this.document);
  }

  /** Ímpeto: gasta 3 espaços para uma ação extra (avisa o mestre no chat). */
  static async #onImpetoAction() {
    await impetoAction(this.document);
  }

  /** Análise: gasta uma ação para ganhar 2 marcadores. */
  static async #onGainAnalysis() {
    await gainAnalysisMarkers(this.document);
  }

  /** Esquiva livre: teste de Acrobacia oposto ao ataque. */
  static async #onDodge() {
    await rollDodge(this.document, takeFearOptions(this.element));
  }

  /** Cura o aliado mirado (Medicina DT 7, 2 PD). */
  static async #onHealAlly() {
    await healAlly(this.document);
  }

  /** Nova cena: reinicia contadores, recursos e efeitos de cena deste personagem. */
  static async #onNewScene() {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize('DESORDEM.Habilidade.NovaCena') },
      content: `<p>${game.i18n.localize('DESORDEM.Habilidade.NovaCenaConfirmar')}</p>`,
      rejectClose: false,
      modal: true,
    });
    if (confirmed === true) await endScene(this.document);
  }
}
