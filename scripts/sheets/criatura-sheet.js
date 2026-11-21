/**
 * Ficha da criatura (ApplicationV2), em três abas: Ficha (atributos, perícias e efeitos), Ações
 * (ataques e habilidades especiais) e Notas (estratégia e descrição). Os elementos, o PV e a
 * redução de dano ficam no cabeçalho.
 *
 * Reaproveita da ficha de personagem os construtores de linhas (`context.js`), a janela pré-teste
 * e o ataque com arma. Não há PD, pavor, relações, lesões nem traumas.
 */
import { SYSTEM_ID, ATRIBUTOS, PERICIAS } from '../config.js';
import { rollSkill, rollExtraSkill, testDicePreview } from '../rolls/chat.js';
import { attackWithWeapon, weaponCompanionDice } from '../rolls/equipment-chat.js';
import { useAbilityEffect } from '../rolls/abilities-chat.js';
import { weaponTestKind } from '../rolls/ability-effects.js';
import { weaponSkill } from '../rolls/equipment.js';
import { askRollChoices } from '../rolls/roll-dialog-chat.js';
import { proposeOpposed } from '../opposed/opposed-chat.js';
import { attributeChoiceUpdate } from '../rolls/attribute.js';
import { addEffect, removeEffect, updateEffect } from '../rolls/effects.js';
import { setSteps, stepBy, stepIndicator, stepLimits } from '../rolls/steps.js';
import { addExtra, canAddExtra, removeExtra, updateExtra } from '../rolls/extras.js';
import {
  MAX_THREAT_SKILLS,
  buildElementRows,
  secondaryElementChoices,
  setPrimaryElement,
  toggleSecondaryElement,
} from '../rolls/threat.js';
import {
  addRowAttributes,
  buildAttributeRows,
  buildEffectRows,
  buildExtraRows,
  buildSkillRows,
  buildTabs,
  isResourceLow,
  nextOpenIds,
  resolveActiveTab,
  resourcePercent,
  stepResource,
} from './context.js';
import {
  CREATURE_TABS,
  buildAttackRows,
  buildCreatureAbilityRows,
  creatureStatusTags,
  creatureTabForItemType,
  visibleSkillRows,
} from './creature-context.js';

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

const TEMPLATES = `systems/${SYSTEM_ID}/templates/criatura`;
const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

/** Campo da ficha que guarda as perícias próprias (grupo `pericia` das áreas extras). */
const EXTRA_FIELD = 'periciasExtras';

export default class CriaturaSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  /** Aba aberta de cada criatura (id do ator -> id da aba); vale até recarregar a página. */
  static #activeTabs = new Map();

  /** Criaturas com todas as perícias à mostra (ids); sem estar aqui, só as treinadas aparecem. */
  static #showAllSkills = new Set();

  /** Habilidades abertas de cada criatura (id do ator -> ids dos itens). */
  static #openAbilities = new Map();

  static DEFAULT_OPTIONS = {
    classes: ['desordem-normal', 'criatura'],
    position: { width: 640, height: 720 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      setTab: CriaturaSheet.#onSetTab,
      proposeOpposed: CriaturaSheet.#onProposeOpposed,
      rollSkill: CriaturaSheet.#onRollSkill,
      rollExtraSkill: CriaturaSheet.#onRollExtraSkill,
      toggleAllSkills: CriaturaSheet.#onToggleAllSkills,
      addExtra: CriaturaSheet.#onAddExtra,
      removeExtra: CriaturaSheet.#onRemoveExtra,
      adjustResource: CriaturaSheet.#onAdjustResource,
      stepSteps: CriaturaSheet.#onStepSteps,
      addEffect: CriaturaSheet.#onAddEffect,
      removeEffect: CriaturaSheet.#onRemoveEffect,
      createItem: CriaturaSheet.#onCreateItem,
      editItem: CriaturaSheet.#onEditItem,
      deleteItem: CriaturaSheet.#onDeleteItem,
      useEffect: CriaturaSheet.#onUseEffect,
      attackWeapon: CriaturaSheet.#onAttackWeapon,
      toggleAbilities: CriaturaSheet.#onToggleAbilities,
      toggleElementPicker: CriaturaSheet.#onToggleElementPicker,
      addSecondaryElement: CriaturaSheet.#onSecondaryElement,
      removeSecondaryElement: CriaturaSheet.#onSecondaryElement,
    },
    // Itens podem ser arrastados da barra lateral ou de outra ficha para esta
    dragDrop: [{ dragSelector: '[data-item-id]', dropSelector: null }],
  };

  /** Cabeçalho e navegação ficam fixos; cada aba é uma parte que rola sozinha. */
  static PARTS = {
    cabecalho: { template: `${TEMPLATES}/cabecalho.hbs` },
    abas: { template: `systems/${SYSTEM_ID}/templates/actor/ficha-abas.hbs` },
    ficha: { template: `${TEMPLATES}/ficha.hbs`, scrollable: [''] },
    acoes: { template: `${TEMPLATES}/acoes.hbs`, scrollable: [''] },
    notas: { template: `${TEMPLATES}/notas.hbs`, scrollable: [''] },
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const { system } = actor;
    const activeTab = resolveActiveTab(CriaturaSheet.#activeTabs.get(actor.id), CREATURE_TABS);
    const tabs = buildTabs(activeTab, (id) => t(`DESORDEM.Criatura.Abas.${id}`), CREATURE_TABS);
    const showAll = CriaturaSheet.#showAllSkills.has(actor.id);

    // Passos temporários (manuais + efeitos) de cada atributo e do dado geral das perícias
    const data = actor.toObject().system;
    const attrStepOf = (key) => stepIndicator({ steps: data.passos, effects: data.efeitos, key });
    const skillStep = stepIndicator({ steps: data.passos, effects: [], key: 'pericias' });
    const attrFieldOptions = {
      attrLabel: (key) => t(`DESORDEM.Atributos.${key}`),
      defaultLabel: (key) =>
        t('DESORDEM.Ficha.AtributoPadrao', { atributo: t(`DESORDEM.Atributos.${key}`) }),
      attributeDice: system.atributos,
      attrStepOf,
    };
    const skills = buildSkillRows(system.pericias, PERICIAS, {
      ...attrFieldOptions,
      skillLabel: (key) => t(`DESORDEM.Pericias.${key}`),
      skillStep,
      attrChoices: system.atributosPericias,
    });
    const items = actor.items.map((item) => ({
      id: item.id,
      name: item.name,
      type: item.type,
      system: item.system,
    }));

    return {
      ...context,
      actor,
      system,
      editable: this.isEditable,
      sheetTabs: tabs.list,
      tabState: tabs.state,
      pvPercent: resourcePercent(system.pv.value, system.pv.max),
      pvLow: isResourceLow(system.pv.value, system.pv.max),
      statusTags: creatureStatusTags(system, (key) => t(`DESORDEM.Criatura.Estado.${key}`)),
      elements: buildElementRows(system.elementos, (key) => t(`DESORDEM.Elementos.${key}`)),
      secondary: secondaryElementChoices(system.elementos, (key) => t(`DESORDEM.Elementos.${key}`)),
      attributes: buildAttributeRows(
        system.atributos,
        ATRIBUTOS,
        (key) => t(`DESORDEM.Atributos.${key}`),
        attrStepOf,
      ),
      skillStep,
      skills: visibleSkillRows(skills, showAll),
      showAllSkills: showAll,
      hiddenSkills: skills.length - visibleSkillRows(skills, false).length,
      extraSkills: addRowAttributes(
        buildExtraRows(system.periciasExtras, 'pericia', {
          emptyLabel: t('DESORDEM.Ficha.ExtraSemNome.pericia'),
          skillStep,
        }),
        { ...attrFieldOptions, chosenOf: (row) => row.atributo },
      ),
      canAddExtraSkill: canAddExtra(system.periciasExtras, MAX_THREAT_SKILLS),
      maxExtraSkills: MAX_THREAT_SKILLS,
      effects: buildEffectRows(system.efeitos, {
        attrLabel: (key) => t(`DESORDEM.Atributos.${key}`),
        noAttrLabel: t('DESORDEM.Ficha.EfeitoSemAtributo'),
        allAttrLabel: t('DESORDEM.Ficha.EfeitoTodosAtributos'),
        attributes: ATRIBUTOS,
        editable: this.isEditable,
      }),
      attacks: buildAttackRows(items, {
        kindLabel: (kind) => t(`DESORDEM.Item.Tipo.${kind}`),
        skillLabel: (key) => t(`DESORDEM.Pericias.${key}`),
        diceOf: (skillKey) => testDicePreview(actor, skillKey),
        editable: this.isEditable,
      }),
      abilities: buildCreatureAbilityRows(items, {
        openIds: CriaturaSheet.#openAbilities.get(actor.id) ?? [],
        editable: this.isEditable,
        t: (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key)),
        skill: (key) => (PERICIAS[key] ? t(`DESORDEM.Pericias.${key}`) : key),
      }),
    };
  }

  /** Liga os campos sem `name` (fora do formulário): atributo-base, perícias próprias, efeitos, elementos. */
  async _onRender(context, options) {
    await super._onRender(context, options);
    const bind = (selector, handler) => {
      for (const field of this.element.querySelectorAll(selector)) {
        field.addEventListener('change', (event) => handler.call(this, event.currentTarget));
      }
    };
    bind('[data-attr-campo]', this.#onAttributeField);
    bind('[data-extra-campo]', this.#onExtraField);
    bind('[data-efeito-campo]', this.#onEffectField);
    bind('[data-elemento-principal]', this.#onPrimaryElement);
    for (const details of this.element.querySelectorAll('details[data-habilidade]')) {
      details.addEventListener('toggle', () => this.#rememberAbility(details));
    }
  }

  /**
   * A criatura só recebe armas (ataques) e habilidades; outros itens arrastados são recusados.
   * Depois de aceitar, abre a aba de ações.
   */
  async _onDropItem(event, item) {
    const tab = creatureTabForItemType(item?.type);
    if (!tab) {
      ui.notifications.warn(t('DESORDEM.Criatura.ItemRecusado'));
      return false;
    }
    const result = await super._onDropItem?.(event, item);
    this.#setTab(tab);
    return result;
  }

  /**
   * Abre a janela pré-teste e rola com a escolha (Shift+clique rola direto). A criatura não tem
   * pavor nem habilidades automáticas: a janela mostra só os dados, a DT e os dados bônus.
   */
  async #rollWithChoices(event, config, run) {
    const options = await askRollChoices(this.document, { ...config, shift: event?.shiftKey });
    if (options) await run(options);
  }

  /** Mostra a aba pedida e a lembra; troca só as classes, sem renderizar a ficha de novo. */
  #setTab(requested) {
    const tab = resolveActiveTab(requested, CREATURE_TABS);
    CriaturaSheet.#activeTabs.set(this.document.id, tab);
    for (const panel of this.element.querySelectorAll('[data-tab-panel]')) {
      panel.classList.toggle('is-active', panel.dataset.tabPanel === tab);
    }
    for (const button of this.element.querySelectorAll('[data-action="setTab"]')) {
      const active = button.dataset.tab === tab;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    }
  }

  /** Guarda se uma habilidade está aberta, para ela continuar assim depois de renderizar. */
  #rememberAbility(details) {
    const id = details.dataset.habilidade;
    const current = CriaturaSheet.#openAbilities.get(this.document.id) ?? [];
    CriaturaSheet.#openAbilities.set(this.document.id, nextOpenIds(current, id, details.open));
  }

  /** Troca do atributo-base de uma perícia (do livro ou própria) pela etiqueta do atributo. */
  async #onAttributeField(field) {
    const change = attributeChoiceUpdate(
      this.document.toObject().system,
      field.dataset.key,
      field.value,
    );
    if (change) await this.document.update({ [`system.${change.path}`]: change.value });
  }

  /** Edição do nome ou do dado de uma perícia própria. */
  async #onExtraField(field) {
    const { id, extraCampo } = field.dataset;
    const value = extraCampo === 'dado' ? Number(field.value) : field.value;
    const list = this.document.toObject().system[EXTRA_FIELD];
    await this.document.update({
      [`system.${EXTRA_FIELD}`]: updateExtra(list, id, { [extraCampo]: value }),
    });
  }

  /** Edição de um campo de um efeito temporário (nome, descrição, atributo, passos, fim de cena). */
  async #onEffectField(field) {
    const value = field.type === 'checkbox' ? field.checked : field.value;
    const effects = this.document.toObject().system.efeitos;
    await this.document.update({
      'system.efeitos': updateEffect(effects, Number(field.dataset.index), {
        [field.dataset.efeitoCampo]: value,
      }),
    });
  }

  /** Escolha do elemento principal (deixa de ser secundário, se era). */
  async #onPrimaryElement(field) {
    const next = setPrimaryElement(this.document.toObject().system.elementos, field.value);
    await this.document.update({ 'system.elementos': next });
  }

  /**
   * Botão «+» dos elementos secundários: mostra ou esconde as opções (só troca a classe, sem
   * redesenhar a ficha).
   */
  static #onToggleElementPicker(event, target) {
    const options = target.parentElement?.querySelector('[data-elemento-opcoes]');
    if (!options) return;
    const open = options.classList.toggle('is-oculta') === false;
    target.setAttribute('aria-expanded', String(open));
  }

  /** Acrescenta (opção do «+») ou tira (× da etiqueta) um elemento secundário. */
  static async #onSecondaryElement(event, target) {
    const next = toggleSecondaryElement(
      this.document.toObject().system.elementos,
      target.dataset.elemento,
    );
    await this.document.update({ 'system.elementos': next });
  }

  /** Propõe um teste oposto: escolhe a perícia e publica o cartão (o token mirado é o oponente). */
  static async #onProposeOpposed() {
    await proposeOpposed(this.document);
  }

  /** Clique em uma aba. */
  static #onSetTab(event, target) {
    this.#setTab(target.dataset.tab);
  }

  /** Clique no nome de uma perícia do livro: janela pré-teste e teste no chat. */
  static async #onRollSkill(event, target) {
    const skillKey = target.dataset.skill;
    await this.#rollWithChoices(event, { skillKey }, (options) =>
      rollSkill(this.document, skillKey, options),
    );
  }

  /** Clique no dado de uma perícia própria. */
  static async #onRollExtraSkill(event, target) {
    const skillKey = target.dataset.skill;
    await this.#rollWithChoices(event, { skillKey }, (options) =>
      rollExtraSkill(this.document, skillKey, options),
    );
  }

  /** Mostra todas as perícias do livro ou só as treinadas (d6 ou mais). */
  static #onToggleAllSkills() {
    const id = this.document.id;
    if (CriaturaSheet.#showAllSkills.has(id)) CriaturaSheet.#showAllSkills.delete(id);
    else CriaturaSheet.#showAllSkills.add(id);
    this.render({ parts: ['ficha'] });
  }

  /** Cria uma perícia própria (d4, sem nome), se ainda couber (máximo 10). */
  static async #onAddExtra() {
    const list = this.document.toObject().system[EXTRA_FIELD];
    if (!canAddExtra(list, MAX_THREAT_SKILLS)) return;
    const next = addExtra(list, { id: foundry.utils.randomID() }, MAX_THREAT_SKILLS);
    await this.document.update({ [`system.${EXTRA_FIELD}`]: next });
  }

  /** Remove uma perícia própria, depois de confirmar (o dado dela se perde). */
  static async #onRemoveExtra(event, target) {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: t('DESORDEM.Ficha.RemoverExtra.pericia') },
      content: `<p>${t('DESORDEM.Ficha.ConfirmarRemoverExtra')}</p>`,
      rejectClose: false,
      modal: true,
    });
    if (confirmed !== true) return;
    const list = this.document.toObject().system[EXTRA_FIELD];
    await this.document.update({
      [`system.${EXTRA_FIELD}`]: removeExtra(list, target.dataset.id),
    });
  }

  /** Botões −/+ do PV: edição crua (a criatura não faz teste de lesão). */
  static async #onAdjustResource(event, target) {
    const value = stepResource(this.document.system.pv, Number(target.dataset.delta));
    await this.document.update({ 'system.pv.value': value });
  }

  /** Botões −/+ de passo temporário de um atributo ou do dado geral das perícias. */
  static async #onStepSteps(event, target) {
    const key = target.dataset.key;
    const data = this.document.toObject().system;
    const current = data.passos;
    const limits =
      key === 'pericias'
        ? undefined
        : stepLimits(
            data.atributos[key],
            stepIndicator({ steps: current, effects: data.efeitos, key }).effects,
          );
    const next = target.dataset.reset
      ? setSteps(current, key, 0)
      : stepBy(current, key, Number(target.dataset.delta), limits);
    await this.document.update({ [`system.passos.${key}`]: next[key] });
  }

  /** Acrescenta um efeito temporário vazio (caído, atordoado...). */
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

  /** Botão de um efeito de habilidade (ação com aviso): avisa no chat. */
  static async #onUseEffect(event, target) {
    await useAbilityEffect(this.document, target.dataset.itemId, target.dataset.efeitoId);
  }

  /** Cria um ataque (arma natural) ou uma habilidade e abre a ficha do item. */
  static async #onCreateItem(event, target) {
    const { type } = target.dataset;
    if (!creatureTabForItemType(type)) return;
    const name = t(
      type === 'arma' ? 'DESORDEM.Criatura.NovoAtaque' : 'DESORDEM.Item.Novo.habilidade',
    );
    const data = { name, type, ...(type === 'arma' ? { system: { natural: true } } : {}) };
    const [item] = await this.document.createEmbeddedDocuments('Item', [data]);
    item?.sheet.render(true);
  }

  /** Abre a ficha do item. */
  static #onEditItem(event, target) {
    this.document.items.get(target.dataset.itemId)?.sheet.render(true);
  }

  /** Remove o item da ficha, depois de confirmar. */
  static async #onDeleteItem(event, target) {
    const item = this.document.items.get(target.dataset.itemId);
    if (!item) return;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: t('DESORDEM.Item.Remover') },
      content: `<p>${t('DESORDEM.Item.ConfirmarRemover')}</p>`,
      rejectClose: false,
      modal: true,
    });
    if (confirmed === true) await item.delete();
  }

  /** Ataca: teste da perícia do ataque (DT 7) e, se acertar, cartão com o dano e o botão. */
  static async #onAttackWeapon(event, target) {
    const weapon = this.document.items.get(target.dataset.itemId);
    if (!weapon) return;
    await this.#rollWithChoices(
      event,
      {
        skillKey: weaponSkill(weapon.system),
        testKind: weaponTestKind(weapon.system),
        // Companheiro da criatura (efeito): o dado dele aparece na prévia do ataque
        baseExtraDice: weaponCompanionDice(this.document, weapon),
      },
      (options) => attackWithWeapon(this.document, weapon, options),
    );
  }

  /** Abre todas as habilidades ou, se todas já estiverem abertas, recolhe todas. */
  static #onToggleAbilities() {
    const all = [...this.element.querySelectorAll('details[data-habilidade]')];
    const open = all.some((details) => !details.open);
    for (const details of all) details.open = open;
  }
}
