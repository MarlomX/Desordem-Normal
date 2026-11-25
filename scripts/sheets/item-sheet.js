// Folha dos itens (arma, armadura, item, habilidade e efeito): campos de cada tipo e o editor da
// lista de efeitos das habilidades e equipamentos.
import { SYSTEM_ID, PERICIAS } from '../config.js';
import {
  ARMOR_KINDS,
  GRIPS,
  WEAPON_CATEGORIES,
  WEAPON_KINDS,
  isNatural,
  isShield,
} from '../rolls/equipment.js';
import { effectItemType } from '../rolls/ability-effects.js';
import { AUTOMATIONS } from '../rolls/abilities.js';
import { buildChoices } from './context.js';
import { isThreat } from '../rolls/threat.js';
import { DAMAGE_BASES } from '../rolls/damage.js';
import { DURATIONS } from '../rolls/effects.js';
import {
  MAX_EFFECTS,
  addEffect,
  allowedEffectTypes,
  editorEffects,
  editorRows,
  moveEffect,
  removeEffect,
  resourceKeys,
  setEffectParam,
  templateEffects,
  toggleEffectSkill,
} from '../rolls/ability-effects-editor.js';
import { actorEffects } from '../rolls/ability-effects-actor.js';

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

/**
 * Ficha dos itens (armas, armaduras, itens em geral, habilidades e efeitos da aba Condição), uma
 * só para todos. Todos têm
 * o editor de efeitos, cada tipo com os seus tipos de efeito (`allowedEffectTypes`): os campos
 * dele não têm `name` (não entram no formulário do Foundry); cada mudança passa pelas funções de
 * ability-effects-editor.js e grava a lista inteira.
 */
export default class ItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ['desordem-normal', 'item'],
    // Largura para o editor de efeitos (todos os tipos de item têm um desde a v0.21.0)
    position: { width: 520, height: 'auto' },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      efeitoAdicionar: ItemSheet.#onAddEffect,
      efeitoAbrir: ItemSheet.#onToggleEffect,
      efeitoSubir: ItemSheet.#onMoveUp,
      efeitoDescer: ItemSheet.#onMoveDown,
      efeitoRemover: ItemSheet.#onRemoveEffect,
    },
  };

  /** Efeito aberto para edição (id), mantido entre os redesenhos da ficha. */
  #openId = null;

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
      // Efeito da aba Condição (v0.22.1): duração e chave, além do editor de efeitos
      isCondition: item.type === 'efeito',
      durationChoices: buildChoices(DURATIONS, item.system.duracao, (key) =>
        t(`DESORDEM.Efeito.Duracao.${key}`),
      ),
      // Habilidade de uma criatura: só nome e texto (sem perfil nem automação)
      ownerIsThreat: isThreat(item.parent),
      effectsEditor: this.#effectsContext(t, skills),
      // Arma natural: sem empunhadura nem caixa de empunhar (não ocupa as mãos)
      isNatural: item.type === 'arma' && isNatural(item.system),
      categoryChoices: buildChoices(
        // Armadura e escudo: só simples ou marcial (não há armadura natural)
        item.type === 'armadura'
          ? WEAPON_CATEGORIES.filter((c) => c !== 'natural')
          : WEAPON_CATEGORIES,
        item.system.categoria,
        (category) => t(`DESORDEM.Item.Categoria.${category}`),
      ),
      // Armadura ou escudo: subtipo, e as perícias da penalidade passiva (caixas)
      isShield: item.type === 'armadura' && isShield(item.system),
      armorKindChoices: buildChoices(ARMOR_KINDS, item.system.subtipo, (kind) =>
        t(`DESORDEM.Item.Subtipo.${kind}`),
      ),
      penaltySkills:
        item.type === 'armadura'
          ? skills.map((skill) => ({
              ...skill,
              checked: (item.system.penalidadePericias ?? []).includes(skill.key),
            }))
          : [],
      kindChoices: buildChoices(WEAPON_KINDS, item.system.tipo, (kind) =>
        t(`DESORDEM.Item.Tipo.${kind}`),
      ),
      // Base do dano: RA (normal) ou RB (desarmado)
      baseChoices: buildChoices(DAMAGE_BASES, item.system.baseDano ?? 'ra', (base) =>
        t(`DESORDEM.Item.Base.${base}`),
      ),
      // Empunhadura da arma e do item geral: uma ou duas mãos
      gripChoices: buildChoices(GRIPS, item.system.empunhadura, (grip) =>
        t(`DESORDEM.Item.Empunhadura.${grip}`),
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

  // ---------- Editor de efeitos ----------

  /**
   * Dados do editor de efeitos para o template. `itemType` decide os tipos oferecidos, os campos
   * escondidos e as dicas; o seletor de modelo (automação antiga) só existe na habilidade.
   */
  #effectsContext(t, skills) {
    const item = this.document;
    // Tipo para os efeitos: o escudo (subtipo da armadura) tem os seus próprios tipos
    const itemType = effectItemType(item);
    const ability = itemType === 'habilidade';
    const { effects, legacy } = editorEffects(item.system, itemType);
    const owner = item.parent?.documentName === 'Actor' ? item.parent : null;
    // Item de criatura: só os tipos sem PD, pavor ou recursos, e sem custo
    const creature = isThreat(owner);
    const types = allowedEffectTypes(itemType, { creature });
    return {
      rows: editorRows(effects, { t, skills, openId: this.#openId, creature, itemType }),
      empty: effects.length === 0,
      // Texto da lista vazia e dica de quando os efeitos valem (`DESORDEM.Efeito.Item.<tipo>`)
      emptyText: t(ability ? 'DESORDEM.Efeito.Vazio' : 'DESORDEM.Efeito.Item.Vazio'),
      hint: ability ? '' : t(`DESORDEM.Efeito.Item.${itemType}`),
      // Sem tipos aceitos (a armadura, por enquanto): só a dica, sem o botão de acrescentar
      noTypes: types.length === 0,
      legacy,
      legacyName: legacy ? t(`DESORDEM.Item.Automacoes.${item.system.automacao}`) : '',
      canAdd: effects.length < MAX_EFFECTS,
      max: MAX_EFFECTS,
      typeChoices: types.map((tipo) => ({
        value: tipo,
        label: t(`DESORDEM.Efeito.Tipos.${tipo}`),
      })),
      modelChoices: ability
        ? AUTOMATIONS.map((key) => ({
            value: key,
            label: t(`DESORDEM.Item.Automacoes.${key}`),
          }))
        : [],
      // Sugestões dos campos de recurso: chaves deste item e dos outros do personagem
      resources: resourceKeys(effects, owner ? actorEffects(owner) : []),
      datalistId: `desordem-recursos-${item.id}`,
    };
  }

  /** Lista atual (a do item ou, numa habilidade vazia, a da automação antiga). */
  #effects() {
    return editorEffects(this.document.system, effectItemType(this.document)).effects;
  }

  /**
   * Grava a lista de efeitos. Na primeira gravação de uma habilidade antiga, os efeitos da
   * automação viram a lista do item e o campo antigo `automacao` é limpo (só a habilidade tem
   * esse campo).
   */
  async #saveEffects(list) {
    const legacy = this.document.type === 'habilidade' ? { 'system.automacao': '' } : {};
    await this.document.update({ 'system.efeitos': list, ...legacy });
  }

  /** Liga os campos do editor (sem `name`) depois de cada desenho da ficha. */
  _onRender(context, options) {
    super._onRender(context, options);
    const root = this.element;
    for (const input of root.querySelectorAll('[data-efeito-campo]')) {
      input.addEventListener('change', (event) => this.#onFieldChange(event));
    }
    root
      .querySelector('[data-efeito-modelo]')
      ?.addEventListener('change', (event) => this.#onTemplate(event));
    for (const box of root.querySelectorAll('[data-penalidade-pericia]')) {
      box.addEventListener('change', (event) => this.#onPenaltySkill(event));
    }
  }

  /**
   * Liga ou desliga uma perícia da penalidade passiva da armadura (as caixas não têm `name`: a
   * lista inteira é gravada de uma vez).
   */
  async #onPenaltySkill(event) {
    event.stopPropagation();
    const box = event.currentTarget;
    const skill = box.dataset.penalidadePericia;
    const current = this.document.system.penalidadePericias ?? [];
    const next = box.checked
      ? [...new Set([...current, skill])]
      : current.filter((key) => key !== skill);
    await this.document.update({ 'system.penalidadePericias': next });
  }

  /** Um campo de efeito mudou: limpa o valor pelo catálogo e grava a lista. */
  async #onFieldChange(event) {
    // O campo não é do formulário do item: não deixa o Foundry enviar o formulário por causa dele
    event.stopPropagation();
    const input = event.currentTarget;
    const index = Number(input.dataset.efeito);
    const path = input.dataset.efeitoCampo;
    const list = input.dataset.pericia
      ? toggleEffectSkill(this.#effects(), index, input.dataset.pericia, input.checked)
      : setEffectParam(
          this.#effects(),
          index,
          path,
          input.type === 'checkbox' ? input.checked : input.value,
        );
    await this.#saveEffects(list);
  }

  /** Escolheu um modelo: troca a lista pelos efeitos dele (pergunta se já houver efeitos). */
  async #onTemplate(event) {
    event.stopPropagation();
    const select = event.currentTarget;
    const key = select.value;
    select.value = '';
    if (!key) return;
    const t = (k, data) => game.i18n.format(k, data);
    if (this.#effects().length) {
      const ok = await foundry.applications.api.DialogV2.confirm({
        window: { title: t('DESORDEM.Efeito.Modelo') },
        content: `<p>${t('DESORDEM.Efeito.ModeloConfirma', {
          nome: Handlebars.escapeExpression(game.i18n.localize(`DESORDEM.Item.Automacoes.${key}`)),
        })}</p>`,
        rejectClose: false,
        modal: true,
      });
      if (!ok) return;
    }
    this.#openId = null;
    await this.#saveEffects(templateEffects(key));
  }

  /** Acrescenta um efeito do tipo escolhido e já o abre. */
  static async #onAddEffect() {
    const tipo = this.element.querySelector('[data-efeito-novo]')?.value;
    if (!tipo) return;
    const id = foundry.utils.randomID(8);
    const list = addEffect(this.#effects(), tipo, id);
    this.#openId = id;
    await this.#saveEffects(list);
  }

  /** Abre ou fecha a edição de um efeito (só um aberto por vez). */
  static #onToggleEffect(event, target) {
    const id = target.closest('[data-efeito-id]')?.dataset.efeitoId ?? null;
    this.#openId = this.#openId === id ? null : id;
    this.render();
  }

  static async #onMoveUp(event, target) {
    await this.#saveEffects(moveEffect(this.#effects(), Number(target.dataset.efeito), -1));
  }

  static async #onMoveDown(event, target) {
    await this.#saveEffects(moveEffect(this.#effects(), Number(target.dataset.efeito), 1));
  }

  static async #onRemoveEffect(event, target) {
    await this.#saveEffects(removeEffect(this.#effects(), Number(target.dataset.efeito)));
  }
}
