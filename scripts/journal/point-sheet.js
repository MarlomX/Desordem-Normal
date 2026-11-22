/**
 * Folha da página do Diário «Ponto de interesse» (v0.24.0).
 *
 * Uma página do diário no v13 tem dois modos, e cada um desenha uma lista de partes:
 * - edição (`EDIT_PARTS`): janela própria, aberta pelo lápis da página. Usamos o cabeçalho do
 *   Foundry (nome, nível no índice, categoria), a nossa parte `content` com o formulário e o
 *   rodapé do Foundry;
 * - leitura (`VIEW_PARTS`): a página dentro do diário, junto das outras. Quem é dono da página
 *   (o mestre e o Assistente) vê o quadro completo; os outros veem só o que foi revelado.
 *
 * O quadro é gravado inteiro (`system.blocos`) a cada mudança: os botões montam a lista nova
 * com as funções puras de `point.js`, e o formulário é aplicado por id (`applyBlockForm`).
 */
import { SYSTEM_ID, PERICIAS, APTIDOES, OFICIOS } from '../config.js';
import {
  addBlock,
  addLine,
  applyBlockForm,
  blockLabel,
  buildEditBlocks,
  buildGmBoard,
  buildPlayerBoard,
  moveBlock,
  moveLine,
  newBlock,
  newLine,
  normalizeBlocks,
  removeBlock,
  removeLine,
  removeSkill,
  skillOptionGroups,
  stripNumberPrefix,
} from './point.js';
import { escapeHtml } from '../sheets/notes.js';

const { JournalEntryPageHandlebarsSheet } = foundry.applications.sheets.journal;
const { DialogV2 } = foundry.applications.api;

/** Pasta dos templates das páginas do diário. */
const TEMPLATES = `systems/${SYSTEM_ID}/templates/diario`;

/** Traduz uma chave (com dados, usa `format` para trocar os `{marcadores}`). */
const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

export default class PontoInteresseSheet extends JournalEntryPageHandlebarsSheet {
  static DEFAULT_OPTIONS = {
    classes: ['desordem-normal', 'desordem-ponto-folha'],
    // Classes da página quando ela aparece dentro do diário (modo de leitura)
    viewClasses: ['desordem-ponto-folha'],
    position: { width: 760 },
    window: { icon: 'fa-solid fa-magnifying-glass' },
    actions: {
      blocoAdicionar: PontoInteresseSheet.#onAddBlock,
      blocoRemover: PontoInteresseSheet.#onRemoveBlock,
      blocoSubir: PontoInteresseSheet.#onMoveBlockUp,
      blocoDescer: PontoInteresseSheet.#onMoveBlockDown,
      linhaAdicionar: PontoInteresseSheet.#onAddLine,
      linhaRemover: PontoInteresseSheet.#onRemoveLine,
      linhaSubir: PontoInteresseSheet.#onMoveLineUp,
      linhaDescer: PontoInteresseSheet.#onMoveLineDown,
      periciaRemover: PontoInteresseSheet.#onRemoveSkill,
    },
  };

  /** Modo de edição: cabeçalho e rodapé do Foundry, com o nosso formulário no meio. */
  static EDIT_PARTS = {
    header: super.EDIT_PARTS.header,
    content: {
      template: `${TEMPLATES}/ponto-edicao.hbs`,
      classes: ['standard-form'],
      scrollable: [''],
    },
    footer: super.EDIT_PARTS.footer,
  };

  /** Modo de leitura: só a nossa parte (o diário em volta é do Foundry). */
  static VIEW_PARTS = {
    content: { template: `${TEMPLATES}/ponto-leitura.hbs` },
  };

  /* ---------------------------------------------------------------------------------------- */
  /* Contexto dos templates                                                                    */
  /* ---------------------------------------------------------------------------------------- */

  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    if (partId !== 'content') return context;
    return Object.assign(
      context,
      this.isView ? await this.#viewContext() : await this.#editContext(),
    );
  }

  /** Dados comuns aos dois modos: número, nome sem o número e descrição básica pronta. */
  async #headerContext() {
    const page = this.document;
    const system = page.system;
    return {
      page,
      numero: system.numero,
      nome: stripNumberPrefix(page.name, system.numero),
      descricaoBasica: await this.#enrich(system.descricaoBasica),
    };
  }

  /**
   * Modo de leitura. O que é só do mestre (DT, notas, condições, contexto, linhas escondidas)
   * só entra no contexto de quem é dono da página; o jogador recebe o quadro já filtrado.
   */
  async #viewContext() {
    const page = this.document;
    const system = page.system;
    const gm = page.isOwner;
    const blocks = normalizeBlocks(system.blocos);
    const enrich = (html) => this.#enrich(html);
    const context = {
      ...(await this.#headerContext()),
      gm,
      showTitle: page.title?.show !== false,
      imagem: system.imagem && (gm || system.imagemVisivel) ? system.imagem : '',
      imagemEscondida: gm && system.imagem && !system.imagemVisivel,
    };
    if (gm) {
      context.board = await buildGmBoard(blocks, { t, enrich });
      context.contexto = await this.#enrich(system.contexto);
      context.desafioAcesso = await this.#enrich(system.desafioAcesso);
    } else {
      context.board = await buildPlayerBoard(blocks, { userId: game.user.id, t, enrich });
    }
    return context;
  }

  /** Modo de edição: o formulário completo (só quem pode editar abre este modo). */
  async #editContext() {
    const system = this.document.system;
    const fields = system.schema.fields;
    const groups = skillOptionGroups(
      { skills: Object.keys(PERICIAS), aptitudes: APTIDOES, crafts: OFICIOS },
      t,
    );
    const blocks = buildEditBlocks(normalizeBlocks(this.document._source.system?.blocos), {
      t,
      groups,
    });
    // Cada linha precisa do texto enriquecido para o editor fechado (modo `toggled`)
    for (const block of blocks) {
      for (const line of block.linhas) line.enriched = await this.#enrich(line.texto);
    }
    return {
      ...(await this.#headerContext()),
      system,
      fields,
      // Campo do texto da linha, para o `formInput` montar o editor rico de cada uma
      lineTextField: fields.blocos.element.fields.linhas.element.fields.texto,
      blocks,
      enriched: {
        descricaoBasica: await this.#enrich(system.descricaoBasica),
        contexto: await this.#enrich(system.contexto),
        desafioAcesso: await this.#enrich(system.desafioAcesso),
      },
    };
  }

  /**
   * HTML pronto para leitura: links (`@UUID[...]`), rolagens em linha e, para o dono, os blocos
   * secretos do próprio editor.
   */
  #enrich(html) {
    if (!html) return '';
    return foundry.applications.ux.TextEditor.implementation.enrichHTML(html, {
      secrets: this.document.isOwner,
      relativeTo: this.document,
    });
  }

  /* ---------------------------------------------------------------------------------------- */
  /* Gravação                                                                                  */
  /* ---------------------------------------------------------------------------------------- */

  /**
   * O formulário manda os campos do quadro em `ponto.<bloco>...` (pelos ids). Aqui eles viram a
   * lista `system.blocos` inteira, já com as mudanças, e o `ponto` sai dos dados enviados.
   */
  _processFormData(event, form, formData) {
    const data = super._processFormData(event, form, formData);
    const fromForm = data.ponto;
    delete data.ponto;
    if (fromForm) {
      foundry.utils.setProperty(data, 'system.blocos', applyBlockForm(this.#blocks(), fromForm));
    }
    return data;
  }

  /** Blocos gravados, limpos (ids garantidos). */
  #blocks() {
    return normalizeBlocks(this.document._source.system?.blocos);
  }

  /**
   * Grava uma mudança de estrutura (botões). Os valores digitados no formulário entram junto,
   * para um clique logo depois de digitar não apagar o que ainda não tinha sido gravado.
   * @param {(blocks: object[]) => object[]} change Recebe os blocos e devolve a lista nova.
   */
  async #saveBlocks(change) {
    const typed = this.form
      ? foundry.utils.expandObject(new foundry.applications.ux.FormDataExtended(this.form).object)
          .ponto
      : null;
    const current = applyBlockForm(this.#blocks(), typed);
    const next = change(current);
    if (next === current) return;
    await this.document.update({ 'system.blocos': next });
  }

  /** Bloco (e linha) do botão clicado, lidos dos `data-bloco` e `data-linha` do HTML. */
  static #target(target) {
    const blockId = target.closest('[data-bloco]')?.dataset.bloco;
    const lineId = target.closest('[data-linha]')?.dataset.linha;
    return { blockId, lineId };
  }

  /** Pede confirmação antes de remover (bloco ou linha). */
  async #confirm(key, blockId) {
    const block = this.#blocks().find((entry) => entry.id === blockId);
    return DialogV2.confirm({
      window: { title: t('DESORDEM.Ponto.ConfirmarTitulo') },
      content: `<p>${escapeHtml(t(key, { nome: block ? blockLabel(block, t) : '' }))}</p>`,
      rejectClose: false,
    });
  }

  static async #onAddBlock() {
    const { randomID } = foundry.utils;
    await this.#saveBlocks((blocks) => addBlock(blocks, newBlock(randomID(), randomID())));
  }

  static async #onRemoveBlock(event, target) {
    const { blockId } = PontoInteresseSheet.#target(target);
    if (!(await this.#confirm('DESORDEM.Ponto.ConfirmarBloco', blockId))) return;
    await this.#saveBlocks((blocks) => removeBlock(blocks, blockId));
  }

  static async #onMoveBlockUp(event, target) {
    const { blockId } = PontoInteresseSheet.#target(target);
    await this.#saveBlocks((blocks) => moveBlock(blocks, blockId, -1));
  }

  static async #onMoveBlockDown(event, target) {
    const { blockId } = PontoInteresseSheet.#target(target);
    await this.#saveBlocks((blocks) => moveBlock(blocks, blockId, 1));
  }

  static async #onAddLine(event, target) {
    const { blockId } = PontoInteresseSheet.#target(target);
    await this.#saveBlocks((blocks) => addLine(blocks, blockId, newLine(foundry.utils.randomID())));
  }

  static async #onRemoveLine(event, target) {
    const { blockId, lineId } = PontoInteresseSheet.#target(target);
    if (!(await this.#confirm('DESORDEM.Ponto.ConfirmarLinha', blockId))) return;
    await this.#saveBlocks((blocks) => removeLine(blocks, blockId, lineId));
  }

  static async #onMoveLineUp(event, target) {
    const { blockId, lineId } = PontoInteresseSheet.#target(target);
    await this.#saveBlocks((blocks) => moveLine(blocks, blockId, lineId, -1));
  }

  static async #onMoveLineDown(event, target) {
    const { blockId, lineId } = PontoInteresseSheet.#target(target);
    await this.#saveBlocks((blocks) => moveLine(blocks, blockId, lineId, 1));
  }

  static async #onRemoveSkill(event, target) {
    const { blockId } = PontoInteresseSheet.#target(target);
    await this.#saveBlocks((blocks) => removeSkill(blocks, blockId, target.dataset.pericia));
  }
}
