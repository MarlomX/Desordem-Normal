/**
 * Janela de edição de um efeito da aba Condição (v0.22.1). O efeito mora na lista
 * `system.efeitos` do ator (personagem ou criatura; formato em rolls/effects.js), então a janela
 * não é a ficha de um documento: ela guarda o ator e o id do efeito e grava a lista inteira a cada
 * mudança, como a ficha do item faz com os efeitos dele.
 *
 * Partes da janela:
 * - nome, duração e descrição do efeito (campos `data-condicao-campo`);
 * - o editor de efeitos do catálogo, o mesmo da ficha do item (partial `efeitos-editor.hbs`), só
 *   com os tipos da aba Condição (`allowedEffectTypes('efeito')`).
 *
 * A janela se põe na lista `apps` do ator: o Foundry a redesenha sozinho sempre que o ator muda
 * (inclusive o ator de um token não vinculado). Se o efeito sumir (removido na ficha, ou um passo
 * condicional que deixou de valer), ela fecha.
 */
import { SYSTEM_ID, PERICIAS } from '../config.js';
import {
  DURATIONS,
  findEffectIndex,
  normalizeSheetEffects,
  replaceEffectEntries,
  updateEffect,
} from '../rolls/effects.js';
import {
  MAX_EFFECTS,
  addEffect as addEntry,
  allowedEffectTypes,
  editorRows,
  moveEffect as moveEntry,
  removeEffect as removeEntry,
  setEffectParam,
  toggleEffectSkill,
} from '../rolls/ability-effects-editor.js';
import { buildChoices } from './context.js';
import { effectText } from '../rolls/condition-tables.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Tipo de item cujos tipos de efeito a janela oferece (os da aba Condição). */
const ITEM_TYPE = 'efeito';

/** Tradução com ou sem dados (`{n}` etc.). */
const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

export default class ConditionEffectApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ['desordem-normal', 'desordem-efeito-janela'],
    position: { width: 500, height: 'auto' },
    window: { resizable: true, icon: 'fa-solid fa-wand-sparkles' },
    // Os mesmos nomes de ação do editor da ficha do item (o partial é o mesmo)
    actions: {
      efeitoAdicionar: ConditionEffectApp.#onAddEntry,
      efeitoAbrir: ConditionEffectApp.#onToggleEntry,
      efeitoSubir: ConditionEffectApp.#onMoveUp,
      efeitoDescer: ConditionEffectApp.#onMoveDown,
      efeitoRemover: ConditionEffectApp.#onRemoveEntry,
    },
  };

  static PARTS = {
    body: { template: `systems/${SYSTEM_ID}/templates/dialog/efeito-condicao.hbs` },
  };

  /** Efeito do catálogo aberto para edição (id), mantido entre os redesenhos. */
  #openId = null;

  /**
   * @param {Actor} actor Dono do efeito.
   * @param {string} effectId Id do efeito em `system.efeitos`.
   */
  constructor(actor, effectId, options = {}) {
    super({ ...options, id: ConditionEffectApp.appId(actor, effectId) });
    this.actor = actor;
    this.effectId = effectId;
    // Redesenho automático quando o ator muda (o Foundry chama `render` de tudo em `actor.apps`)
    actor.apps[this.id] = this;
  }

  /**
   * Id da janela de um efeito (uma por efeito: abrir de novo só traz a mesma para a frente). O
   * uuid do ator tem pontos, que não servem num id de HTML.
   */
  static appId(actor, effectId) {
    return `desordem-efeito-${actor.uuid.replaceAll('.', '-')}-${effectId}`;
  }

  /** Abre a janela do efeito (ou traz a que já está aberta para a frente). */
  static open(actor, effectId) {
    const existing = foundry.applications.instances.get(ConditionEffectApp.appId(actor, effectId));
    const app = existing ?? new ConditionEffectApp(actor, effectId);
    app.render({ force: true });
    if (existing) app.bringToFront();
    return app;
  }

  /**
   * Título da janela: o nome do efeito (o traduzido pela chave, numa lesão ou trauma sem nome
   * escrito), ou «Efeito».
   */
  get title() {
    const effect = this.#effect();
    const shown = effect ? effectText(effect, t) : null;
    return shown?.nome || t('DESORDEM.Ficha.EfeitoJanela.Titulo');
  }

  /** Lista atual de efeitos do ator, já limpa. */
  #effects() {
    return normalizeSheetEffects(this.actor.toObject().system.efeitos);
  }

  /** Posição do efeito desta janela na lista (−1 se ele sumiu). */
  #index() {
    return findEffectIndex(this.actor.toObject().system.efeitos, this.effectId);
  }

  /** O efeito desta janela (ou `null`). */
  #effect() {
    return this.#effects()[this.#index()] ?? null;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const effect = this.#effect();
    if (!effect) {
      // O efeito sumiu: fecha depois deste desenho (não dá para fechar no meio dele)
      globalThis.setTimeout(() => this.close(), 0);
      return { ...context, missing: true };
    }
    const skills = Object.keys(PERICIAS)
      .map((key) => ({ key, label: t(`DESORDEM.Pericias.${key}`) }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
    const entries = effect.efeitos;
    const types = allowedEffectTypes(ITEM_TYPE);
    return {
      ...context,
      effect,
      // Texto traduzido pela chave (lesões e traumas): aparece apagado nos campos vazios, e
      // escrever algo neles passa a valer no lugar
      placeholder: effectText({ ...effect, nome: '', descricao: '' }, t),
      editable: this.actor.isOwner,
      // Criado por uma habilidade (passo condicional): a dica avisa que ele some sozinho
      fromAbility: effect.origem.startsWith('hab:'),
      durationChoices: buildChoices(DURATIONS, effect.duracao, (key) =>
        t(`DESORDEM.Efeito.Duracao.${key}`),
      ),
      // Mesmo formato do contexto do editor da ficha do item (partial efeitos-editor.hbs)
      effectsEditor: {
        rows: editorRows(entries, { t, skills, openId: this.#openId, itemType: ITEM_TYPE }),
        empty: entries.length === 0,
        emptyText: t('DESORDEM.Efeito.Item.VazioCondicao'),
        hint: t('DESORDEM.Efeito.Item.efeito'),
        noTypes: types.length === 0,
        legacy: false,
        canAdd: entries.length < MAX_EFFECTS,
        max: MAX_EFFECTS,
        typeChoices: types.map((tipo) => ({
          value: tipo,
          label: t(`DESORDEM.Efeito.Tipos.${tipo}`),
        })),
        // Os tipos da aba Condição não usam recursos: a lista de sugestões fica vazia
        resources: [],
        datalistId: `${this.id}-recursos`,
      },
    };
  }

  /** Liga os campos sem `name` (os do efeito e os do editor) depois de cada desenho. */
  _onRender(context, options) {
    super._onRender(context, options);
    for (const input of this.element.querySelectorAll('[data-condicao-campo]')) {
      input.addEventListener('change', (event) => this.#onEffectField(event.currentTarget));
    }
    for (const input of this.element.querySelectorAll('[data-efeito-campo]')) {
      input.addEventListener('change', (event) => this.#onEntryField(event.currentTarget));
    }
  }

  /** Ao fechar, sai da lista `apps` do ator (para não ser redesenhada depois). */
  _onClose(options) {
    super._onClose(options);
    delete this.actor.apps[this.id];
  }

  /** Grava a lista inteira de efeitos do ator (a janela se redesenha pela lista `apps`). */
  async #save(list) {
    await this.actor.update({ 'system.efeitos': list });
  }

  /** Nome, duração ou descrição do efeito mudou. */
  async #onEffectField(input) {
    const index = this.#index();
    if (index === -1) return;
    const changes = { [input.dataset.condicaoCampo]: input.value };
    await this.#save(updateEffect(this.actor.toObject().system.efeitos, index, changes));
  }

  /** Grava a lista nova do catálogo deste efeito. */
  async #saveEntries(entries) {
    const index = this.#index();
    if (index === -1) return;
    await this.#save(replaceEffectEntries(this.actor.toObject().system.efeitos, index, entries));
  }

  /** Lista atual do catálogo deste efeito. */
  #entries() {
    return this.#effect()?.efeitos ?? [];
  }

  /** Um campo do editor mudou: limpa o valor pelo catálogo e grava (como na ficha do item). */
  async #onEntryField(input) {
    const index = Number(input.dataset.efeito);
    const entries = input.dataset.pericia
      ? toggleEffectSkill(this.#entries(), index, input.dataset.pericia, input.checked)
      : setEffectParam(
          this.#entries(),
          index,
          input.dataset.efeitoCampo,
          input.type === 'checkbox' ? input.checked : input.value,
        );
    await this.#saveEntries(entries);
  }

  /** Acrescenta um efeito do catálogo do tipo escolhido e já o abre. */
  static async #onAddEntry() {
    const tipo = this.element.querySelector('[data-efeito-novo]')?.value;
    if (!tipo) return;
    const id = foundry.utils.randomID(8);
    this.#openId = id;
    await this.#saveEntries(addEntry(this.#entries(), tipo, id));
  }

  /** Abre ou fecha a edição de um efeito do catálogo (só um aberto por vez). */
  static #onToggleEntry(event, target) {
    const id = target.closest('[data-efeito-id]')?.dataset.efeitoId ?? null;
    this.#openId = this.#openId === id ? null : id;
    this.render();
  }

  static async #onMoveUp(event, target) {
    await this.#saveEntries(moveEntry(this.#entries(), Number(target.dataset.efeito), -1));
  }

  static async #onMoveDown(event, target) {
    await this.#saveEntries(moveEntry(this.#entries(), Number(target.dataset.efeito), 1));
  }

  static async #onRemoveEntry(event, target) {
    await this.#saveEntries(removeEntry(this.#entries(), Number(target.dataset.efeito)));
  }
}
