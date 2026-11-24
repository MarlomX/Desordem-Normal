import { SYSTEM_ID, ATRIBUTOS, PERICIAS, APTIDOES, OFICIOS } from '../config.js';
import { rollSkill, rollAptitude, rollCraft } from '../rolls/chat.js';
import { rollInjuryTest } from '../rolls/health.js';
import { injuryDT, injuryTestOptions } from '../rolls/injury.js';
import { rollTraumaTest } from '../rolls/mind.js';
import { traumaDT } from '../rolls/emotional.js';
import { invokeRelation } from '../rolls/relation-chat.js';
import { attackWithWeapon } from '../rolls/equipment-chat.js';
import { useItem } from '../rolls/item-use-chat.js';
import { armorSkillPenalties, weaponSkill } from '../rolls/equipment.js';
import { hasContusion } from '../rolls/condition-tables.js';
import {
  addEffectFromItem,
  conditionEffectText,
  describeConditionEntry,
} from './condition-effects-ui.js';
import { stepIndicator } from '../rolls/steps.js';
import { askRollChoices } from '../rolls/roll-dialog-chat.js';
import {
  actorEffects,
  actorResources,
  effectById,
  roundUseUpdate,
  usableThisRound,
} from '../rolls/ability-effects-actor.js';
import { startFirstAid } from '../rolls/first-aid-chat.js';
import {
  EXTRA_GROUPS,
  MAX_EXTRAS,
  addExtra,
  canAddExtra,
  removeExtra,
  updateExtra,
} from '../rolls/extras.js';
import { useAbilityEffect, rollDodge, endScene, skillName } from '../rolls/abilities-chat.js';
import {
  armorExtraPoints,
  groupBonusDice,
  hasMartialProficiency,
  weaponTestKind,
} from '../rolls/ability-effects.js';
import { resourceBars } from './ability-controls.js';
import { itemEffectsText } from '../rolls/ability-effects-editor.js';

/**
 * Texto da penalidade passiva de uma armadura ou escudo («−1 passo em Atletismo, Furtividade»),
 * ou vazio se não houver.
 * @param {{type: string, system: object}} item
 * @param {(key: string, data?: object) => string} format Tradução com dados.
 * @param {(key: string) => string} skillName Nome de uma perícia.
 */
function armorPenaltyText(item, format, skillName) {
  const { penalidadePassos: passos = 0, penalidadePericias: pericias = [] } = item.system ?? {};
  if (item.type !== 'armadura' || !passos || !pericias.length) return '';
  return format('DESORDEM.Item.Penalidade.Resumo', {
    passos,
    pericias: pericias.map(skillName).join(', '),
  });
}
import {
  addRelation,
  removeRelation,
  updateRelation,
  setRelationDegree,
} from '../rolls/relation.js';
import PerseguicaoApp from '../chase/app.js';
import { withChaseAdvance } from '../chase/advance.js';
import { recoverBreath } from '../chase/breath.js';
import { chaseCardFor, chaseInfoFor } from '../chase/store.js';
import FurtividadeApp from '../stealth/app.js';
import { adjustHideUses, findStealth, stealthCardFor, stealthInfoFor } from '../stealth/store.js';
import { challengeCardFor } from '../challenges/store.js';
import DesafioApp from '../challenges/app.js';
import { showChallengeList } from '../challenges/sidebar.js';
import { challengeChoicesFor, withExtendedTest } from '../challenges/test-card.js';
import { rollBalance } from '../challenges/balance-card.js';
import { attemptLock } from '../challenges/lock-card.js';
import QuadroApp from '../challenges/board-app.js';
import { withHideTest } from '../stealth/hide-test.js';
import { withFlashyAction, withStealthAction } from '../stealth/action.js';
import {
  buildAttributeRows,
  buildSkillRows,
  buildAreaRows,
  buildExtraRows,
  addRowAttributes,
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
  togglePip,
  buildStatusTags,
  isResourceLow,
  rowMatches,
  normalizeSkillSort,
  skillRowOrder,
  nextOpenIds,
} from './context.js';
import { applyRelativeInput, limitsFromDataset, resolveRelativeFields } from './relative-input.js';
import { CHARACTER_NOTES, buildNoteRows } from './notes.js';
import {
  addEffect,
  attributeField,
  deleteItem,
  editEffect,
  editItem,
  enrichActorNote,
  pickEffect,
  proposeOpposedAction,
  removeEffectAction,
  stepSteps,
  toggleAbilities,
} from './actor-sheet-actions.js';

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
      rollInjury: PersonagemSheet.#onRollInjury,
      rollTrauma: PersonagemSheet.#onRollTrauma,
      addRelation: PersonagemSheet.#onAddRelation,
      removeRelation: PersonagemSheet.#onRemoveRelation,
      setRelationDegree: PersonagemSheet.#onSetRelationDegree,
      invokeRelation: PersonagemSheet.#onInvokeRelation,
      createItem: PersonagemSheet.#onCreateItem,
      editItem: editItem,
      deleteItem: deleteItem,
      attackWeapon: PersonagemSheet.#onAttackWeapon,
      useItem: PersonagemSheet.#onUseItem,
      addEffect: addEffect,
      editEffect: editEffect,
      pickEffect: pickEffect,
      removeEffect: removeEffectAction,
      useEffect: PersonagemSheet.#onUseEffect,
      stepAbilityResource: PersonagemSheet.#onStepAbilityResource,
      newScene: PersonagemSheet.#onNewScene,
      toggleMartial: PersonagemSheet.#onToggleMartial,
      openChase: PersonagemSheet.#onOpenChase,
      recoverBreath: PersonagemSheet.#onRecoverBreath,
      openStealth: PersonagemSheet.#onOpenStealth,
      openChallenges: PersonagemSheet.#onOpenChallenges,
      openChallenge: PersonagemSheet.#onOpenChallenge,
      rollBalance: PersonagemSheet.#onRollBalance,
      attemptLock: PersonagemSheet.#onAttemptLock,
      openLockBoard: PersonagemSheet.#onOpenLockBoard,
      adjustHideUses: PersonagemSheet.#onAdjustHideUses,
      setTab: PersonagemSheet.#onSetTab,
      proposeOpposed: proposeOpposedAction,
      firstAid: PersonagemSheet.#onFirstAid,
      adjustResource: PersonagemSheet.#onAdjustResource,
      adjustSceneTests: PersonagemSheet.#onAdjustSceneTests,
      setPip: PersonagemSheet.#onSetPip,
      stepSteps: stepSteps,
      toggleAbilities: toggleAbilities,
    },
    // Itens podem ser arrastados da barra lateral ou de outra ficha para esta
    dragDrop: [{ dragSelector: '[data-item-id]', dropSelector: null }],
  };

  /** Cabeçalho e navegação ficam fixos; cada aba é uma parte que rola sozinha. */
  static PARTS = {
    cabecalho: { template: `systems/${SYSTEM_ID}/templates/actor/ficha-cabecalho.hbs` },
    perseguicao: { template: `systems/${SYSTEM_ID}/templates/actor/ficha-perseguicao.hbs` },
    furtividade: { template: `systems/${SYSTEM_ID}/templates/actor/ficha-furtividade.hbs` },
    desafios: { template: `systems/${SYSTEM_ID}/templates/actor/ficha-desafios.hbs` },
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
    notas: {
      template: `systems/${SYSTEM_ID}/templates/actor/ficha-notas.hbs`,
      scrollable: [''],
    },
  };

  /**
   * Partes que se redesenham sozinhas quando a perseguição, a furtividade ou um desafio mudam
   * (`refreshOpenSheets`). Elas só leem os cartões, os efeitos e o pavor; quando o redesenho é só
   * delas, o contexto não monta o resto da ficha (v0.28.6).
   */
  static #LIGHT_PARTS = new Set(['perseguicao', 'furtividade', 'desafios', 'condicao']);

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const { system } = this.document;
    const t = (key) => game.i18n.localize(key);
    const activeTab = resolveActiveTab(PersonagemSheet.#activeTabs.get(this.document.id));
    const tabs = buildTabs(activeTab, (id) => t(`DESORDEM.Ficha.Abas.${id}`));
    // O que as partes leves leem (os cartões e a aba Condição); a ficha inteira também leva
    const light = {
      ...context,
      perseguicao: chaseCardFor(this.document),
      furtividade: stealthCardFor(this.document),
      desafios: challengeCardFor(this.document),
      sheetTabs: tabs.list,
      tabState: tabs.state,
      actor: this.document,
      system,
      editable: this.isEditable,
      ...this.#conditionContext(t),
    };
    // Redesenho só dos cartões (e da aba Condição): sem notas, perícias, itens nem habilidades
    const parts = options?.parts ?? [];
    if (parts.length && parts.every((part) => PersonagemSheet.#LIGHT_PARTS.has(part))) {
      return light;
    }
    // Nome de uma perícia ou de uma área de Aptidão (botões dos testes das habilidades)
    // Passos temporários (manuais + efeitos) de cada atributo e do dado geral das perícias
    const stepsData = this.document.toObject().system;
    const attrStepOf = (key) =>
      stepIndicator({ steps: stepsData.passos, effects: stepsData.efeitos, key });
    const skillStep = stepIndicator({ steps: stepsData.passos, effects: [], key: 'pericias' });
    // Opções comuns da coluna do atributo-base nas linhas de perícia, aptidão e ofício
    // Nomes usados na dica com a origem de cada passo («Manual −1 · Ímpeto +1»)
    const stepLabels = {
      manual: t('DESORDEM.Ficha.Passos.Manual'),
      unnamed: t('DESORDEM.Ficha.Passos.SemNome'),
    };
    const attrFieldOptions = {
      stepLabels,
      attrLabel: (key) => t(`DESORDEM.Atributos.${key}`),
      defaultLabel: (key) =>
        game.i18n.format('DESORDEM.Ficha.AtributoPadrao', {
          atributo: t(`DESORDEM.Atributos.${key}`),
        }),
      attributeDice: system.atributos,
      attrStepOf,
    };

    // Aba Notas: o HTML gravado (o editor edita este) e o enriquecido (links @UUID) para leitura
    const notes = await buildNoteRows(CHARACTER_NOTES, system, {
      t,
      enrich: (html) => enrichActorNote(this.document, html),
      fields: this.document.system.schema.fields,
    });

    return {
      ...light,
      notes,
      pvPercent: resourcePercent(system.pv.value, system.pv.max),
      pdPercent: resourcePercent(system.pd.value, system.pd.max),
      pvLow: isResourceLow(system.pv.value, system.pv.max),
      pdLow: isResourceLow(system.pd.value, system.pd.max),
      // Máximo abaixo da base (Laceração Profunda, Chaga da Alma...): o cabeçalho mostra os dois
      pvReduced: system.pv.max < system.pv.base,
      pdReduced: system.pd.max < system.pd.base,
      // A contusão é um efeito desde a v0.22.2: a etiqueta vem dele
      statusTags: buildStatusTags(
        { ...system.estado, contusao: hasContusion(system.efeitos) },
        {
          stateLabel: (key) => t(`DESORDEM.Ficha.Estado.${key}`),
          fearLabel: (die) => game.i18n.format('DESORDEM.Ficha.Cab.PavorEtiqueta', { dado: die }),
        },
      ),
      // Barras dos recursos das habilidades (uma por efeito `recurso`) e a reserva de dados bônus
      resourceBars: resourceBars(actorEffects(this.document), system.recursosHab ?? {}, t),
      bonusDice: groupBonusDice(system.dadosBonus)
        .map(({ die, count }) => `${count}d${die}`)
        .join(' + '),
      attributes: buildAttributeRows(
        system.atributos,
        ATRIBUTOS,
        (key) => t(`DESORDEM.Atributos.${key}`),
        attrStepOf,
        stepLabels,
      ),
      skillStep,
      // A Medicina ganha o botão de primeiros socorros
      skills: buildSkillRows(system.pericias, PERICIAS, {
        ...attrFieldOptions,
        skillLabel: (key) => t(`DESORDEM.Pericias.${key}`),
        skillStep,
        attrChoices: system.atributosPericias,
        // Penalidade passiva das armaduras vestidas e escudos empunhados
        penalties: armorSkillPenalties(this.document.items),
        penaltyLabel: ({ steps, sources }) =>
          game.i18n.format('DESORDEM.Ficha.PenalidadeArmadura', {
            passos: steps,
            itens: sources.join(', '),
          }),
      }).map((row) => ({ ...row, firstAid: row.key === 'medicina' })),
      aptitudes: addRowAttributes(
        buildAreaRows(system.aptidoes, APTIDOES, (key) => t(`DESORDEM.Aptidoes.${key}`), skillStep),
        { ...attrFieldOptions, chosenOf: (row) => system.atributosPericias[row.key] },
      ),
      crafts: addRowAttributes(
        buildAreaRows(system.oficios, OFICIOS, (key) => t(`DESORDEM.Oficios.${key}`), skillStep),
        { ...attrFieldOptions, chosenOf: (row) => system.atributosPericias[row.key] },
      ),
      aptitudeExtras: addRowAttributes(
        buildExtraRows(system.aptidoesExtras, 'aptidao', {
          emptyLabel: t('DESORDEM.Ficha.ExtraSemNome.aptidao'),
          skillStep,
        }),
        { ...attrFieldOptions, chosenOf: (row) => row.atributo },
      ),
      craftExtras: addRowAttributes(
        buildExtraRows(system.oficiosExtras, 'oficio', {
          emptyLabel: t('DESORDEM.Ficha.ExtraSemNome.oficio'),
          skillStep,
        }),
        { ...attrFieldOptions, chosenOf: (row) => row.atributo },
      ),
      canAddAptitude: canAddExtra(system.aptidoesExtras),
      canAddCraft: canAddExtra(system.oficiosExtras),
      maxExtras: MAX_EXTRAS,
      nextInjuryDT: injuryDT(system.cena.testesLesao),
      nextTraumaDT: traumaDT(system.cena.testesTrauma),
      abilities: buildAbilityRows(
        this.document.items
          .filter((item) => item.type === 'habilidade')
          .map((item) => ({ id: item.id, name: item.name, img: item.img, system: item.system })),
        {
          resources: system.recursosHab ?? {},
          hurtCompanion: system.cena.animalFerido,
          editable: this.isEditable,
          openIds: PersonagemSheet.#openAbilities.get(this.document.id) ?? [],
          t: (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key)),
          skill: skillName,
        },
      ),
      equipment: this.#equipmentContext(t, skillName),
      relations: buildRelationRows(system.relacoes, {
        degreeLabel: (key) => t(`DESORDEM.Relacao.Grau.${key}`),
        editable: this.isEditable,
      }),
    };
  }

  /**
   * Antes de gravar o formulário, faz a conta dos campos marcados com `data-relativo` (PV, PD,
   * bases, contadores da cena, armadura extra gasta): `-2` subtrai do valor gravado, `+3` soma.
   * Veja `scripts/sheets/relative-input.js`.
   */
  _processFormData(event, form, formData) {
    resolveRelativeFields(form, formData.object, this.document._source);
    return super._processFormData(event, form, formData);
  }

  /** Liga os campos de texto e a caixa "usada" das relações (sem `name`, fora do formulário). */
  /**
   * Aba Condição: o seletor do pavor e os efeitos em linhas compactas (a edição é na janela do
   * efeito); as lesões e os traumas também são efeitos, com o texto traduzido pela chave.
   * @param {(key: string) => string} t
   */
  #conditionContext(t) {
    const { system } = this.document;
    return {
      fearChoices: buildFearChoices(system.estado.pavor, t('DESORDEM.Ficha.SemPavor')),
      effects: buildEffectRows(system.efeitos, {
        describe: describeConditionEntry,
        text: conditionEffectText,
        durationLabel: (key) => t(`DESORDEM.Efeito.Duracao.${key}`),
        editable: this.isEditable,
      }),
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    for (const field of this.element.querySelectorAll('[data-relacao-campo]')) {
      field.addEventListener('change', (event) => this.#onRelationField(event.currentTarget));
    }
    for (const field of this.element.querySelectorAll('[data-attr-campo]')) {
      field.addEventListener('change', (event) => attributeField.call(this, event.currentTarget));
    }
    for (const field of this.element.querySelectorAll('[data-extra-campo]')) {
      field.addEventListener('change', (event) => this.#onExtraField(event.currentTarget));
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
   * Shift+clique rola direto, sem a janela. Se o jogador cancelar, não rola. Com uma perseguição
   * em andamento, a janela oferece "usar como teste de avanço" (menos com `chase: false`). Com
   * `stealth: true` (testes de perícia, aptidão e ofício) e uma cena de furtividade em andamento,
   * oferece «usar como teste de esconderijo» a quem ainda não se escondeu. Se o personagem participa
   * de um teste estendido ativo (guia de desafios), oferece «usar no desafio» (também
   * menos com `chase: false`, como nos testes de lesão e de trauma).
   * @param {MouseEvent} event
   * @param {Object} config Veja `askRollChoices`.
   * @param {(options: object) => Promise<*>} run Faz a rolagem com as opções escolhidas.
   */
  async #rollWithChoices(event, config, run) {
    const { chase: offerAdvance = true, stealth: offerHide = false, ...rest } = config;
    const chase = offerAdvance ? chaseInfoFor(this.document, config.skillKey) : null;
    const stealth = offerHide ? stealthInfoFor(this.document) : null;
    const challenges = offerAdvance ? challengeChoicesFor(this.document) : [];
    let options = await askRollChoices(this.document, {
      ...rest,
      chase,
      stealth,
      challenges,
      shift: event?.shiftKey,
    });
    if (!options) return;
    // Ação chamativa: o dado é descartado quando o teste rolar (combina com o avanço, se houver)
    if (options.chamativa) options = withFlashyAction(this.document, options);
    // Teste estendido: guarda o registro do botão «somar pontos» (não combina com o avanço)
    if (options.estendido) options = withExtendedTest(this.document, options);
    if (options.esconderijo) {
      await run(withHideTest(this.document, options));
      return;
    }
    if (options.furtiva) {
      await run(withStealthAction(this.document, options));
      return;
    }
    await run(options.avanco ? withChaseAdvance(this.document, options, config.skillKey) : options);
  }

  /**
   * Depois de arrastar um item para a ficha, abre a aba onde ele aparece. Um Item de efeito é
   * copiado para a aba Condição.
   * (Se a versão do Foundry não tiver este método, o comportamento padrão continua valendo.)
   */
  async _onDropItem(event, item) {
    // Item de efeito da aba Condição: vira uma cópia na lista de efeitos (não fica como item)
    if (item?.type === 'efeito') {
      if (this.isEditable && (await addEffectFromItem(this.document, item)))
        this.#setTab('condicao');
      return false;
    }
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

  /** Edição rápida de um campo do item na ficha (empunhada, vestida, quantidade, usos). */
  async #onItemField(field) {
    const item = this.document.items.get(field.dataset.itemId);
    if (!item) return;
    const path = `system.${field.dataset.itemCampo}`;
    let value;
    if (field.type === 'checkbox') value = field.checked;
    else if ('relativo' in field.dataset) {
      // Quantidade, usos e pontos restantes aceitam conta (`-1`, `+2`) sobre o valor gravado
      value = applyRelativeInput(
        field.value,
        foundry.utils.getProperty(item._source, path),
        limitsFromDataset(field.dataset),
      );
      // O campo mostra o resultado mesmo se nada mudar (sem atualização, a ficha não redesenha)
      field.value = String(value);
    } else value = Number(field.value);
    await item.update({ [path]: value });
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

  /** Primeiros socorros (botão ao lado da Medicina): escolhe o paciente e rola. */
  static async #onFirstAid(event) {
    await startFirstAid(this.document, event);
  }

  /** Clique em uma aba. */
  static #onSetTab(event, target) {
    this.#setTab(target.dataset.tab);
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
  static async #onSetPip(event, target) {
    const key = target.dataset.resource;
    const { defs, values } = actorResources(this.document);
    if (!defs[key]) return;
    const value = Math.min(defs[key].maximo, togglePip(values[key], Number(target.dataset.n)));
    await this.document.update({ [`system.recursosHab.${key}`]: value });
  }

  /** Clique no nome de uma perícia: faz o teste e publica no chat. */
  static async #onRollSkill(event, target) {
    const skillKey = target.dataset.skill;
    await this.#rollWithChoices(event, { skillKey, stealth: true }, (options) =>
      rollSkill(this.document, skillKey, options),
    );
  }

  /** Clique no nome de uma área de Aptidão: faz o teste (Mente + área) e publica no chat. */
  static async #onRollAptitude(event, target) {
    const skillKey = target.dataset.aptitude;
    await this.#rollWithChoices(event, { skillKey, stealth: true }, (options) =>
      rollAptitude(this.document, skillKey, options),
    );
  }

  /** Clique no nome de uma área de Ofício: faz o teste (Mente + área) e publica no chat. */
  static async #onRollCraft(event, target) {
    const skillKey = target.dataset.craft;
    await this.#rollWithChoices(event, { skillKey, stealth: true }, (options) =>
      rollCraft(this.document, skillKey, options),
    );
  }

  /** Teste de lesão manual (por exemplo, o do moribundo no fim da rodada). */
  static async #onRollInjury(event) {
    const rule = injuryTestOptions({ previousTests: this.document.system.cena.testesLesao });
    // "Dano não letal" aparece na janela como uma habilidade que acrescenta +d6 ao teste
    await this.#rollWithChoices(
      event,
      {
        skillKey: 'vigor',
        ignoreFear: true,
        dt: rule.dt,
        allowNonLethal: true,
        chase: false,
        // O companheiro animal não ajuda no teste de lesão (v0.27.0)
        companion: false,
      },
      (options) => rollInjuryTest(this.document, options),
    );
  }

  /** Teste de trauma manual. */
  static async #onRollTrauma(event) {
    await this.#rollWithChoices(
      event,
      {
        skillKey: 'disciplina',
        ignoreFear: true,
        chase: false,
        // O companheiro animal não ajuda no teste de trauma (v0.27.0)
        companion: false,
        dt: traumaDT(this.document.system.cena.testesTrauma),
      },
      (options) => rollTraumaTest(this.document, options),
    );
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

  /**
   * Aba Equipamento: linhas das armas, armaduras e itens (`buildEquipmentRows`), com o resumo dos
   * efeitos de cada item e a proficiência marcial (da caixa ou de uma habilidade).
   * @param {(key: string) => string} t Tradução simples.
   * @param {(key: string) => string} skillName Nome de uma perícia.
   */
  #equipmentContext(t, skillName) {
    const actor = this.document;
    const entries = actorEffects(actor);
    // Uma habilidade já dá a proficiência? (aviso ao lado da caixa da ficha)
    const fromAbility = hasMartialProficiency({}, entries);
    const format = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
    return {
      ...buildEquipmentRows(
        actor.items.map((item) => ({
          id: item.id,
          name: item.name,
          img: item.img,
          type: item.type,
          system: item.system,
        })),
        {
          kindLabel: (kind) => t(`DESORDEM.Item.Tipo.${kind}`),
          handsLabel: (hands) => t(`DESORDEM.Item.Maos.${hands}`),
          skillLabel: (key) => t(`DESORDEM.Pericias.${key}`),
          categoryLabel: (category) => t(`DESORDEM.Item.Categoria.${category}`),
          // Resumo dos efeitos de cada item, uma linha por efeito, embaixo do nome
          // (na armadura e no escudo, a penalidade passiva vem primeiro)
          effectsText: (item) =>
            [
              armorPenaltyText(item, format, skillName),
              itemEffectsText(item, { t: format, skill: skillName }),
            ]
              .filter(Boolean)
              .join('\n'),
          proficient: hasMartialProficiency(actor.system, entries),
          // Armadura extra (habilidades) e quanto dela já foi gasto
          armorBonus: {
            extra: armorExtraPoints(entries),
            extraSpent: actor.system.armaduraExtraGasta,
          },
          // «Armadura marcial» / «Martial armor»: a ordem vem do idioma
          armorKindLabel: (kind, categoria) =>
            format(`DESORDEM.Ficha.ArmaduraRotulo.${kind}`, { categoria }),
          editable: this.isEditable,
        },
      ),
      proficiencyFromAbility: fromAbility,
      // O botão fica azul com a marcação manual ou com uma habilidade que dá a proficiência
      martialActive: Boolean(actor.system.proficienciaMarcial) || fromAbility,
    };
  }

  /** Ataca com a arma: teste da perícia da arma e, se acertar, cartão com o dano. */
  static async #onAttackWeapon(event, target) {
    const weapon = this.document.items.get(target.dataset.itemId);
    if (!weapon) return;
    await this.#rollWithChoices(
      event,
      {
        skillKey: weaponSkill(weapon.system),
        // Dados extras só de ataque corpo a corpo ou à distância aparecem conforme a arma
        testKind: weaponTestKind(weapon.system),
        // Os efeitos da arma (dado extra) entram na janela só neste ataque
        weaponId: weapon.id,
      },
      (options) => attackWithWeapon(this.document, weapon, options),
    );
  }

  /** Usa o item (gasta um uso ou uma unidade) e avisa no chat. */
  static async #onUseItem(event, target) {
    const item = this.document.items.get(target.dataset.itemId);
    if (item) await useItem(this.document, item);
  }

  /**
   * Botão de um efeito na aba Habilidades (passo na cena, ação, ganhar recurso, teste com efeito,
   * defesa livre). A defesa livre passa pela janela pré-teste; os outros vão para
   * `useAbilityEffect`.
   */
  static async #onUseEffect(event, target) {
    const { itemId, efeitoId } = target.dataset;
    const entry = effectById(this.document, itemId, efeitoId);
    if (!entry) return;
    if (entry.tipo === 'defesaLivre') {
      // Esquiva livre: 1×/rodada em combate (marcada ao rolar, como no cartão do teste oposto)
      if (!usableThisRound(this.document, entry)) {
        ui.notifications.warn(
          game.i18n.format('DESORDEM.Efeito.Aviso.Rodada', { nome: entry.itemName }),
        );
        return;
      }
      const skillKey = entry.params.pericia || 'acrobacia';
      await this.#rollWithChoices(
        event,
        { skillKey, showDt: false, testKind: 'defesa' },
        async (options) => {
          const used = roundUseUpdate(entry);
          if (Object.keys(used).length) await this.document.update(used);
          return rollDodge(this.document, options, skillKey, entry.itemName);
        },
      );
      return;
    }
    await useAbilityEffect(this.document, itemId, efeitoId);
  }

  /** − e + de um recurso com máximo alto (mostrado como número no cabeçalho). */
  static async #onStepAbilityResource(event, target) {
    const key = target.dataset.resource;
    const { defs, values } = actorResources(this.document);
    if (!defs[key]) return;
    const value = Math.min(
      defs[key].maximo,
      Math.max(0, values[key] + Number(target.dataset.delta)),
    );
    await this.document.update({ [`system.recursosHab.${key}`]: value });
  }

  /** Abre a janela da perseguição (cartão da ficha). */
  static async #onOpenChase() {
    await PerseguicaoApp.open();
  }

  /** Recupera o fôlego na perseguição (cartão da ficha): ação da rodada, marca «já agiu». */
  static async #onRecoverBreath() {
    await recoverBreath(this.document);
  }

  /** Abre a janela da cena de furtividade (cartão da ficha). */
  static async #onOpenStealth() {
    await FurtividadeApp.open();
  }

  /** Mostra a lista de desafios (guia da barra lateral ou janela flutuante): cartão da ficha. */
  static async #onOpenChallenges() {
    await showChallengeList();
  }

  /** Equilíbrio: rola os 2d10 do desafio (botão do cartão de desafios da ficha). */
  static async #onRollBalance(event, target) {
    await rollBalance(this.document, target.dataset.challengeId);
  }

  /** Destrancar: o jogador tenta uma senha (botão do cartão de desafios da ficha). */
  static async #onAttemptLock(event, target) {
    await attemptLock(this.document, target.dataset.challengeId);
  }

  /** Destrancar: abre o quadro de teoria da fechadura (cartão de desafios da ficha). */
  static async #onOpenLockBoard(event, target) {
    await QuadroApp.open(target.dataset.challengeId);
  }

  /** O mestre abre a janela de um desafio pelo nome no cartão da ficha. */
  static async #onOpenChallenge(event, target) {
    await DesafioApp.open(target.dataset.challengeId);
  }

  /** Ajuste à mão do contador de esconder-se (aba Condição, só durante a cena de furtividade). */
  static async #onAdjustHideUses(event, target) {
    const combatant = findStealth()?.combatants.get(target.dataset.combatantId);
    if (combatant) await adjustHideUses(combatant, Number(target.dataset.delta));
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

  /**
   * Botão da proficiência marcial (v0.23.3): liga e desliga a marcação manual. Quando a
   * proficiência vem de uma habilidade, o botão fica travado na ficha e não chega aqui.
   */
  static async #onToggleMartial() {
    await this.document.update({
      'system.proficienciaMarcial': !this.document.system.proficienciaMarcial,
    });
  }
}
