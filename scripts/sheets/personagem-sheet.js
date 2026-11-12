import { SYSTEM_ID, ATRIBUTOS, PERICIAS, APTIDOES, OFICIOS } from '../config.js';
import { rollSkill, rollAptitude, rollCraft } from '../rolls/chat.js';
import { damageActor, rollInjuryTest } from '../rolls/health.js';
import { injuryDT, injuryTestOptions } from '../rolls/injury.js';
import { emotionalDamage, rollTraumaTest } from '../rolls/mind.js';
import { traumaDT } from '../rolls/emotional.js';
import { invokeRelation } from '../rolls/relation-chat.js';
import { attackWithWeapon, useItem, weaponCompanionDice } from '../rolls/equipment-chat.js';
import { weaponSkill } from '../rolls/equipment.js';
import { addEffect, removeEffect, updateEffect } from '../rolls/effects.js';
import { setSteps, shownDie, stepBy, stepIndicator, stepLimits } from '../rolls/steps.js';
import { askRollChoices } from '../rolls/roll-dialog-chat.js';
import {
  EXTRA_GROUPS,
  MAX_EXTRAS,
  addExtra,
  canAddExtra,
  removeExtra,
  updateExtra,
} from '../rolls/extras.js';
import {
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
  buildAreaRows,
  buildExtraRows,
  buildLesionRows,
  buildFearChoices,
  buildRelationRows,
  buildEffectRows,
  buildEquipmentRows,
  buildAbilityRows,
  buildTabs,
  resolveActiveTab,
  tabForItemType,
  resourcePercent,
  stepResource,
  stepCounter,
  PIP_MAX,
  buildPips,
  togglePip,
  buildStatusTags,
  isResourceLow,
  rowMatches,
  normalizeSkillSort,
  skillRowOrder,
  nextOpenIds,
} from './context.js';

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/** Ficha do personagem (ApplicationV2). */
export default class PersonagemSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  /** Aba aberta de cada personagem (id do ator -> id da aba); vale até recarregar a página. */
  static #activeTabs = new Map();

  /** Filtro de perícias de cada personagem (id do ator -> {text}); vale até recarregar. */
  static #skillFilters = new Map();

  /** Ordenação das perícias de cada personagem (id do ator -> `nome` ou `dado`); vale até recarregar. */
  static #skillSorts = new Map();

  /** Habilidades abertas de cada personagem (id do ator -> ids dos itens). */
  static #openAbilities = new Map();

  static DEFAULT_OPTIONS = {
    classes: ['desordem-normal', 'personagem'],
    position: { width: 680, height: 760 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      rollSkill: PersonagemSheet.#onRollSkill,
      rollAptitude: PersonagemSheet.#onRollAptitude,
      rollCraft: PersonagemSheet.#onRollCraft,
      addExtra: PersonagemSheet.#onAddExtra,
      removeExtra: PersonagemSheet.#onRemoveExtra,
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
      setTab: PersonagemSheet.#onSetTab,
      adjustResource: PersonagemSheet.#onAdjustResource,
      adjustSceneTests: PersonagemSheet.#onAdjustSceneTests,
      setPip: PersonagemSheet.#onSetPip,
      stepSteps: PersonagemSheet.#onStepSteps,
      toggleAbilities: PersonagemSheet.#onToggleAbilities,
    },
    // Itens podem ser arrastados da barra lateral ou de outra ficha para esta
    dragDrop: [{ dragSelector: '[data-item-id]', dropSelector: null }],
  };

  /** Cabeçalho e navegação ficam fixos; cada aba é uma parte que rola sozinha. */
  static PARTS = {
    cabecalho: { template: `systems/${SYSTEM_ID}/templates/actor/ficha-cabecalho.hbs` },
    abas: { template: `systems/${SYSTEM_ID}/templates/actor/ficha-abas.hbs` },
    testes: { template: `systems/${SYSTEM_ID}/templates/actor/ficha-testes.hbs`, scrollable: [''] },
    habilidades: {
      template: `systems/${SYSTEM_ID}/templates/actor/ficha-habilidades.hbs`,
      scrollable: [''],
    },
    equipamento: {
      template: `systems/${SYSTEM_ID}/templates/actor/ficha-equipamento.hbs`,
      scrollable: [''],
    },
    condicao: {
      template: `systems/${SYSTEM_ID}/templates/actor/ficha-condicao.hbs`,
      scrollable: [''],
    },
    relacoes: {
      template: `systems/${SYSTEM_ID}/templates/actor/ficha-relacoes.hbs`,
      scrollable: [''],
    },
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const { system } = this.document;
    const t = (key) => game.i18n.localize(key);
    const activeTab = resolveActiveTab(PersonagemSheet.#activeTabs.get(this.document.id));
    const tabs = buildTabs(activeTab, (id) => t(`DESORDEM.Ficha.Abas.${id}`));
    const abilityItems = this.document.items.filter((item) => item.type === 'habilidade');
    const hasAutomation = (key) => abilityItems.some((item) => item.system.automacao === key);
    // Passos temporários (manuais + efeitos) de cada atributo e do dado geral das perícias
    const stepsData = this.document.toObject().system;
    const attrStepOf = (key) =>
      stepIndicator({ steps: stepsData.passos, effects: stepsData.efeitos, key });
    const skillStep = stepIndicator({ steps: stepsData.passos, effects: [], key: 'pericias' });

    return {
      ...context,
      sheetTabs: tabs.list,
      tabState: tabs.state,
      pvPercent: resourcePercent(system.pv.value, system.pv.max),
      pdPercent: resourcePercent(system.pd.value, system.pd.max),
      pvLow: isResourceLow(system.pv.value, system.pv.max),
      pdLow: isResourceLow(system.pd.value, system.pd.max),
      statusTags: buildStatusTags(system.estado, {
        stateLabel: (key) => t(`DESORDEM.Ficha.Estado.${key}`),
        fearLabel: (die) => game.i18n.format('DESORDEM.Ficha.Cab.PavorEtiqueta', { dado: die }),
      }),
      showImpeto: hasAutomation('impeto'),
      showAnalise: hasAutomation('analise'),
      impetoPips: buildPips(system.recursos.impeto, PIP_MAX.impeto),
      analisePips: buildPips(system.recursos.analise, PIP_MAX.analise),
      actor: this.document,
      system,
      editable: this.isEditable,
      attributes: buildAttributeRows(
        system.atributos,
        ATRIBUTOS,
        (key) => t(`DESORDEM.Atributos.${key}`),
        attrStepOf,
      ),
      skillStep,
      skills: buildSkillRows(system.pericias, PERICIAS, {
        skillLabel: (key) => t(`DESORDEM.Pericias.${key}`),
        attrLabel: (key) => t(`DESORDEM.Atributos.${key}`),
        attributeDice: system.atributos,
        attrStepOf,
        skillStep,
      }),
      aptitudes: buildAreaRows(
        system.aptidoes,
        APTIDOES,
        (key) => t(`DESORDEM.Aptidoes.${key}`),
        skillStep,
      ),
      crafts: buildAreaRows(
        system.oficios,
        OFICIOS,
        (key) => t(`DESORDEM.Oficios.${key}`),
        skillStep,
      ),
      aptitudeExtras: buildExtraRows(system.aptidoesExtras, 'aptidao', {
        emptyLabel: t('DESORDEM.Ficha.ExtraSemNome.aptidao'),
        skillStep,
      }),
      craftExtras: buildExtraRows(system.oficiosExtras, 'oficio', {
        emptyLabel: t('DESORDEM.Ficha.ExtraSemNome.oficio'),
        skillStep,
      }),
      canAddAptitude: canAddExtra(system.aptidoesExtras),
      canAddCraft: canAddExtra(system.oficiosExtras),
      maxExtras: MAX_EXTRAS,
      aptitudeAttrLabel: t('DESORDEM.Atributos.mente'),
      aptitudeAttrDie: Number(system.atributos.mente),
      aptitudeAttrShownDie: shownDie(system.atributos.mente, attrStepOf('mente')),
      aptitudeAttrShifted:
        shownDie(system.atributos.mente, attrStepOf('mente')) !== Number(system.atributos.mente),
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
          openIds: PersonagemSheet.#openAbilities.get(this.document.id) ?? [],
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
    for (const field of this.element.querySelectorAll('[data-extra-campo]')) {
      field.addEventListener('change', (event) => this.#onExtraField(event.currentTarget));
    }
    for (const field of this.element.querySelectorAll('[data-efeito-campo]')) {
      field.addEventListener('change', (event) => this.#onEffectField(event.currentTarget));
    }
    for (const field of this.element.querySelectorAll('[data-item-campo]')) {
      field.addEventListener('change', (event) => this.#onItemField(event.currentTarget));
    }
    this.#bindSkillFilter();
    for (const details of this.element.querySelectorAll('details[data-habilidade]')) {
      details.addEventListener('toggle', () => this.#rememberAbility(details));
    }
  }

  /**
   * Abre a janela pré-teste (dados bônus, habilidades e pavor) e faz a rolagem com a escolha.
   * Shift+clique rola direto, sem a janela. Se o jogador cancelar, não rola.
   * @param {MouseEvent} event
   * @param {Object} config Veja `askRollChoices`.
   * @param {(options: object) => Promise<*>} run Faz a rolagem com as opções escolhidas.
   */
  async #rollWithChoices(event, config, run) {
    const options = await askRollChoices(this.document, { ...config, shift: event?.shiftKey });
    if (options) await run(options);
  }

  /**
   * Depois de arrastar um item para a ficha, abre a aba onde ele aparece.
   * (Se a versão do Foundry não tiver este método, o comportamento padrão continua valendo.)
   */
  async _onDropItem(event, item) {
    const result = await super._onDropItem?.(event, item);
    const tab = tabForItemType(item?.type);
    if (tab) this.#setTab(tab);
    return result;
  }

  /** Filtro de perícias atual (lembrado por personagem). */
  #skillFilter() {
    return PersonagemSheet.#skillFilters.get(this.document.id) ?? { text: '' };
  }

  /** Modo de ordenação das perícias atual (lembrado por personagem; padrão: nome). */
  #skillSort() {
    return normalizeSkillSort(PersonagemSheet.#skillSorts.get(this.document.id));
  }

  /** Liga a busca e o seletor de ordem, devolve a eles o que estava escolhido e aplica os dois. */
  #bindSkillFilter() {
    const text = this.element.querySelector('[data-filtro-texto]');
    const sort = this.element.querySelector('[data-ordenar]');
    if (!text || !sort) return;
    text.value = this.#skillFilter().text;
    sort.value = this.#skillSort();
    text.addEventListener('input', () => {
      PersonagemSheet.#skillFilters.set(this.document.id, { text: text.value });
      this.#applySkillFilter();
    });
    sort.addEventListener('change', () => {
      PersonagemSheet.#skillSorts.set(this.document.id, normalizeSkillSort(sort.value));
      this.#applySkillSort();
    });
    this.#applySkillFilter();
    this.#applySkillSort();
  }

  /** Esconde as perícias e aptidões que não passam no filtro (só mexe na tela, sem renderizar). */
  #applySkillFilter() {
    const filter = this.#skillFilter();
    let visible = 0;
    for (const row of this.element.querySelectorAll('[data-busca]')) {
      const show = rowMatches({ search: row.dataset.busca }, filter);
      row.classList.toggle('is-oculta', !show);
      if (show) visible += 1;
    }
    const empty = this.element.querySelector('[data-filtro-vazio]');
    if (empty) empty.hidden = visible > 0;
  }

  /**
   * Ordena as linhas dentro de cada grupo (perícias, aptidões, ofícios), que ficam no lugar.
   * Só muda a propriedade CSS `order` de cada linha: a grade mostra as linhas na ordem dela,
   * sem renderizar a ficha de novo. A ordem no HTML não muda (só a ordem visual).
   */
  #applySkillSort() {
    const mode = this.#skillSort();
    for (const group of this.element.querySelectorAll('.desordem-ficha__pericias')) {
      const rows = [...group.querySelectorAll(':scope > [data-busca]')];
      const order = skillRowOrder(
        rows.map((row) => ({
          label: row.dataset.nome,
          die: Number(row.dataset.dadoFinal),
          attrDie: Number(row.dataset.dadoAttr),
        })),
        mode,
      );
      rows.forEach((row, i) => {
        row.style.order = String(order[i]);
      });
    }
  }

  /** Guarda se uma habilidade está aberta, para ela continuar assim depois de renderizar. */
  #rememberAbility(details) {
    const id = details.dataset.habilidade;
    const current = PersonagemSheet.#openAbilities.get(this.document.id) ?? [];
    PersonagemSheet.#openAbilities.set(this.document.id, nextOpenIds(current, id, details.open));
  }

  /** Mostra a aba pedida e a lembra; troca só as classes, sem renderizar a ficha de novo. */
  #setTab(requested) {
    const tab = resolveActiveTab(requested);
    PersonagemSheet.#activeTabs.set(this.document.id, tab);
    for (const panel of this.element.querySelectorAll('[data-tab-panel]')) {
      panel.classList.toggle('is-active', panel.dataset.tabPanel === tab);
    }
    for (const button of this.element.querySelectorAll('[data-action="setTab"]')) {
      const active = button.dataset.tab === tab;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
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

  /** Lista de áreas extras de um grupo (`aptidao` ou `oficio`) como dados simples. */
  #extras(group) {
    return this.document.toObject().system[EXTRA_GROUPS[group]];
  }

  /** Grava a nova lista de áreas extras de um grupo. */
  async #saveExtras(group, list) {
    await this.document.update({ [`system.${EXTRA_GROUPS[group]}`]: list });
  }

  /** Edição do nome ou do dado de uma área extra (campos sem `name`, fora do formulário). */
  async #onExtraField(field) {
    const { group, id, extraCampo } = field.dataset;
    if (!(group in EXTRA_GROUPS)) return;
    const value = extraCampo === 'dado' ? Number(field.value) : field.value;
    await this.#saveExtras(group, updateExtra(this.#extras(group), id, { [extraCampo]: value }));
  }

  /** Clique em "Adicionar": cria uma área extra nova (d4) no grupo, se ainda couber. */
  static async #onAddExtra(event, target) {
    const group = target.dataset.group;
    if (!(group in EXTRA_GROUPS)) return;
    const list = this.#extras(group);
    if (!canAddExtra(list)) return;
    const id = foundry.utils.randomID();
    await this.#saveExtras(group, addExtra(list, { id }));
  }

  /** Clique em × de uma área extra: remove depois de confirmar (o dado dela se perde). */
  static async #onRemoveExtra(event, target) {
    const { group, id } = target.dataset;
    if (!(group in EXTRA_GROUPS)) return;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize(`DESORDEM.Ficha.RemoverExtra.${group}`) },
      content: `<p>${game.i18n.localize('DESORDEM.Ficha.ConfirmarRemoverExtra')}</p>`,
      rejectClose: false,
      modal: true,
    });
    if (confirmed === true) await this.#saveExtras(group, removeExtra(this.#extras(group), id));
  }

  /** Clique em uma aba. */
  static #onSetTab(event, target) {
    this.#setTab(target.dataset.tab);
  }

  /** Abre todas as habilidades ou, se todas já estiverem abertas, recolhe todas. */
  static #onToggleAbilities() {
    const all = [...this.element.querySelectorAll('details[data-habilidade]')];
    const open = all.some((details) => !details.open);
    for (const details of all) details.open = open;
  }

  /** Botões −/+ do PV e do PD: edição crua, sem teste de lesão ou de trauma. */
  static async #onAdjustResource(event, target) {
    const key = target.dataset.resource;
    if (key !== 'pv' && key !== 'pd') return;
    const value = stepResource(this.document.system[key], Number(target.dataset.delta));
    await this.document.update({ [`system.${key}.value`]: value });
  }

  /** Botões −/+ do contador de testes de lesão ou de trauma da cena (muda a DT do próximo). */
  static async #onAdjustSceneTests(event, target) {
    const field = target.dataset.kind === 'trauma' ? 'testesTrauma' : 'testesLesao';
    const value = stepCounter(this.document.system.cena[field], Number(target.dataset.delta));
    await this.document.update({ [`system.cena.${field}`]: value });
  }

  /** Clique em um marcador de ímpeto ou de análise do cabeçalho. */
  /** Botões −/+ de passo temporário de um atributo ou do dado geral das perícias. */
  static async #onStepSteps(event, target) {
    const key = target.dataset.key;
    const data = this.document.toObject().system;
    const current = data.passos;
    // O passo manual de um atributo não passa do que leva o dado a d12 (ou d4); o geral não tem limite
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

  static async #onSetPip(event, target) {
    const key = target.dataset.resource;
    if (!(key in PIP_MAX)) return;
    const value = togglePip(this.document.system.recursos[key], Number(target.dataset.n));
    await this.document.update({ [`system.recursos.${key}`]: value });
  }

  /** Clique no nome de uma perícia: faz o teste e publica no chat. */
  static async #onRollSkill(event, target) {
    const skillKey = target.dataset.skill;
    await this.#rollWithChoices(event, { skillKey }, (options) =>
      rollSkill(this.document, skillKey, options),
    );
  }

  /** Clique no nome de uma área de Aptidão: faz o teste (Mente + área) e publica no chat. */
  static async #onRollAptitude(event, target) {
    const skillKey = target.dataset.aptitude;
    await this.#rollWithChoices(event, { skillKey }, (options) =>
      rollAptitude(this.document, skillKey, options),
    );
  }

  /** Clique no nome de uma área de Ofício: faz o teste (Mente + área) e publica no chat. */
  static async #onRollCraft(event, target) {
    const skillKey = target.dataset.craft;
    await this.#rollWithChoices(event, { skillKey }, (options) =>
      rollCraft(this.document, skillKey, options),
    );
  }

  /** Aplica o dano digitado (e o teste de lesão, se o PV chegar a 0). */
  static async #onApplyDamage() {
    const amount = Math.trunc(Number(this.element.querySelector('[data-dano]').value));
    const nonLethal = this.element.querySelector('[data-nao-letal]').checked;
    if (!(amount > 0)) return;
    await damageActor(this.document, amount, { nonLethal });
  }

  /** Teste de lesão manual (por exemplo, o do moribundo no fim da rodada). */
  static async #onRollInjury(event) {
    const nonLethal = this.element.querySelector('[data-nao-letal]').checked;
    const rule = injuryTestOptions({
      previousTests: this.document.system.cena.testesLesao,
      nonLethal,
    });
    await this.#rollWithChoices(
      event,
      { skillKey: 'vigor', baseExtraDice: rule.extraDice, ignoreFear: true, dt: rule.dt },
      (options) => rollInjuryTest(this.document, { nonLethal, ...options }),
    );
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
  static async #onRollTrauma(event) {
    await this.#rollWithChoices(
      event,
      {
        skillKey: 'disciplina',
        ignoreFear: true,
        dt: traumaDT(this.document.system.cena.testesTrauma),
      },
      (options) => rollTraumaTest(this.document, options),
    );
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
    if (!weapon) return;
    await this.#rollWithChoices(
      event,
      {
        skillKey: weaponSkill(weapon.system),
        baseExtraDice: weaponCompanionDice(this.document, weapon),
      },
      (options) => attackWithWeapon(this.document, weapon, options),
    );
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
  static async #onDodge(event) {
    await this.#rollWithChoices(event, { skillKey: 'acrobacia', showDt: false }, (options) =>
      rollDodge(this.document, options),
    );
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
