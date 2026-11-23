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
 *
 * v0.24.3: no modo de leitura, o dono revela e esconde linhas (para todos ou para jogadores
 * escolhidos), revela ou esconde um bloco inteiro e esconde tudo. O jogador vê a marca de «novo»
 * nas linhas que chegaram desde a última visita (lista de vistas em `point-seen.js`).
 *
 * v0.24.4: o 🔍 de cada bloco abre a janela «Investigar» (`investigation-app.js`), e o ponto pode
 * ficar ligado a um desafio da guia Desafios (`system.desafioId`): criado ou escolhido na edição,
 * aberto pelo botão do quadro do mestre.
 *
 * v0.24.6: «Subponto de» (`system.paiId`) escolhe outro ponto do diário como pai e o número vira
 * o do pai mais o próximo livre (3 → 3.1, 3.2…); a imagem abre em tela cheia ao clicar.
 *
 * v0.24.8: vínculos (`system.vinculos`). O mestre arrasta para o ponto um item, diário, página ou
 * ator; cada vínculo tem olho próprio, jogadores específicos e pode ser amarrado a uma linha. Um
 * clique abre o documento; itens têm «Entregar a…» (só o mestre) com quantidade disponível. A
 * permissão de ver o documento é dada em `point-hooks.js` quando o vínculo é revelado.
 */
import { SYSTEM_ID, PERICIAS, APTIDOES, OFICIOS } from '../config.js';
import {
  LINK_TYPES,
  POINT_TYPE,
  addBlock,
  addLink,
  applyLinkForm,
  buildLinks,
  hideAllLinks,
  lineChoices,
  newLink,
  normalizeLinks,
  removeLink,
  setLinkRevealed,
  setLinkUsers,
  takeOne,
  visibleLinkIds,
  addLine,
  applyBlockForm,
  blockGroupKey,
  blockLabel,
  buildEditBlocks,
  buildGmBoard,
  buildPlayerBoard,
  hasRevealed,
  hideAll,
  moveBlock,
  moveLine,
  newBlock,
  nextChildNumber,
  parentChoices,
  newLine,
  newLineIds,
  normalizeBlocks,
  removeBlock,
  removeLine,
  removeSkill,
  setBlockRevealed,
  setLineRevealed,
  setLineUsers,
  skillOptionGroups,
  stripNumberPrefix,
  visibleLineIds,
} from './point.js';
import { readSeen, saveSeen } from './point-seen.js';
import InvestigationApp from './investigation-app.js';
import DesafioApp from '../challenges/app.js';
import { createChallenge, getChallenge, readChallenges } from '../challenges/store.js';
import { CHALLENGE_TYPES } from '../rolls/challenge.js';
import { escapeHtml } from '../sheets/notes.js';

const { JournalEntryPageHandlebarsSheet } = foundry.applications.sheets.journal;
const { DialogV2 } = foundry.applications.api;
const { renderTemplate } = foundry.applications.handlebars;

/** Pasta dos templates das páginas do diário. */
const TEMPLATES = `systems/${SYSTEM_ID}/templates/diario`;

/**
 * Documento de um vínculo pelo UUID, sem esperar (mundo ou índice de compêndio): só o nome
 * importa para mostrar. `null` se não existe mais.
 */
function resolveDoc(uuid) {
  try {
    const doc = foundry.utils.fromUuidSync(uuid);
    return doc ? { name: doc.name ?? '' } : null;
  } catch {
    return null;
  }
}

/** Traduz uma chave (com dados, usa `format` para trocar os `{marcadores}`). */
const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

export default class PontoInteresseSheet extends JournalEntryPageHandlebarsSheet {
  /** Subtipo de página desta folha. */
  static TYPE = POINT_TYPE;

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
      desafioCriar: PontoInteresseSheet.#onCreateChallenge,
      vinculoRemover: PontoInteresseSheet.#onRemoveLink,
    },
  };

  /**
   * Linhas marcadas como «novo» nesta visita do jogador (ids). Entram quando a página é desenhada
   * com uma linha que ele ainda não tinha visto e saem quando a página ou o diário fecham.
   */
  #fresh = new Set();

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
    const links = normalizeLinks(system.vinculos);
    if (gm) {
      const userName = (userId) => game.users.get(userId)?.name ?? userId;
      context.board = await buildGmBoard(blocks, { t, enrich, userName });
      context.links = buildLinks(links, { blocks, resolve: resolveDoc, userName, t });
      context.anyRevealed =
        hasRevealed(blocks) || links.some((link) => link.revelado || link.reveladoPara.length);
      context.desafio = this.#linkedChallenge();
      context.contexto = await this.#enrich(system.contexto);
      context.desafioAcesso = await this.#enrich(system.desafioAcesso);
    } else {
      context.board = await buildPlayerBoard(blocks, {
        userId: game.user.id,
        t,
        enrich,
        fresh: this.#markSeen(blocks, links),
      });
      context.links = buildLinks(links, {
        blocks,
        resolve: resolveDoc,
        userId: game.user.id,
        fresh: [...this.#fresh],
      });
    }
    return context;
  }

  /**
   * Marca de «novo» do jogador: junta às novidades desta visita as linhas que ele vê agora e não
   * tinha visto, e grava a lista de vistas (sem esperar a gravação, que não muda a tela).
   * @returns {string[]} Ids marcados como novos.
   */
  #markSeen(blocks, links = []) {
    const page = this.document;
    // Linhas e vínculos na mesma lista (os ids não se repetem entre eles)
    const visible = [
      ...visibleLineIds(blocks, game.user.id),
      ...visibleLinkIds(links, blocks, game.user.id),
    ];
    for (const id of newLineIds(visible, readSeen(page))) this.#fresh.add(id);
    // Linha escondida de novo deixa de ser novidade
    for (const id of this.#fresh) if (!visible.includes(id)) this.#fresh.delete(id);
    saveSeen(page, visible).catch((error) =>
      console.warn(`${SYSTEM_ID} | não foi possível gravar as linhas vistas`, error),
    );
    return [...this.#fresh];
  }

  /** Esquece as novidades desta visita (a página fechou). */
  clearFresh() {
    this.#fresh.clear();
  }

  /**
   * Esquece as novidades de todas as páginas de ponto abertas de um diário (o diário fechou).
   * Procura nas janelas abertas, para não criar a folha de uma página que nunca foi aberta.
   * @param {JournalEntry} entry
   */
  static clearFreshFor(entry) {
    for (const app of foundry.applications.instances.values()) {
      if (app instanceof PontoInteresseSheet && app.document.parent === entry) app.clearFresh();
    }
  }

  async _onClose(options) {
    this.clearFresh();
    return super._onClose(options);
  }

  /**
   * Botões de revelar (modo de leitura, só o dono). Ligados à mão a cada desenho, com um atributo
   * próprio (`data-ponto-acao`), porque a página dentro do diário é desenhada pelo diário e os
   * `data-action` da folha podem não chegar até ela.
   */
  async _onRender(context, options) {
    await super._onRender(context, options);
    // Na edição, só a área de vínculos (arrastar documentos) precisa de ligação à mão
    if (!this.isView) {
      if (this.document.isOwner) this.#bindLinkDrop();
      return;
    }
    // Imagem em tela cheia (para todos), na janela de imagem do Foundry
    this.element.querySelector('.desordem-ponto__imagem img')?.addEventListener('click', () => {
      this.#showImage();
    });
    // Abrir um vínculo vale para todos; os outros botões são só do dono
    const owner = this.document.isOwner;
    for (const button of this.element.querySelectorAll('[data-ponto-acao]')) {
      if (!owner && button.dataset.pontoAcao !== 'vinculoAbrir') continue;
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.#onRevealControl(button);
      });
    }
    if (owner) this.#bindLinkDrop();
  }

  /**
   * Área «Vínculos» aceita documentos arrastados (da barra lateral ou de compêndios). O arrasto é
   * tratado aqui e não sobe para o diário (que trataria como mudar a página de lugar).
   */
  #bindLinkDrop() {
    const zone = this.element.querySelector('.desordem-ponto__vinculos');
    if (!zone) return;
    zone.addEventListener('dragover', (event) => {
      event.preventDefault();
      zone.classList.add('is-arrastando');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('is-arrastando'));
    zone.addEventListener('drop', (event) => {
      event.preventDefault();
      event.stopPropagation();
      zone.classList.remove('is-arrastando');
      const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
      this.#addDroppedLink(data);
    });
  }

  /** Grava o documento arrastado como vínculo novo (tipos aceitos; nunca a própria página). */
  async #addDroppedLink(data) {
    const uuid = typeof data?.uuid === 'string' ? data.uuid : '';
    if (!LINK_TYPES.includes(data?.type) || !uuid || uuid === this.document.uuid) {
      ui.notifications.warn(t('DESORDEM.Ponto.Vinculo.TipoInvalido'));
      return;
    }
    const before = this.#links();
    const after = addLink(before, newLink(foundry.utils.randomID(), uuid));
    if (after === before) {
      ui.notifications.info(t('DESORDEM.Ponto.Vinculo.JaExiste'));
      return;
    }
    await this.#saveLinks(() => after);
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
      // Desafios da guia (para ligar um que já existe) e os tipos para criar um novo
      desafios: readChallenges().desafios.map((challenge) => ({
        id: challenge.id,
        nome: challenge.nome || t('DESORDEM.Desafio.Estendido.SemNome'),
        tipo: t(`DESORDEM.Desafio.Tipo.${challenge.tipo}`),
        selected: challenge.id === system.desafioId,
      })),
      desafioTipos: CHALLENGE_TYPES.map((tipo) => ({
        tipo,
        label: t(`DESORDEM.Desafio.Tipo.${tipo}`),
      })),
      desafio: this.#linkedChallenge(),
      // Vínculos, cada um com a lista de linhas às quais pode ser amarrado (a escolhida marcada)
      links: this.#editLinks(),
      // Pontos do diário que podem ser pai deste (sem ele mesmo e sem os descendentes dele)
      pais: parentChoices(PontoInteresseSheet.pointsOf(this.document.parent), this.document.id).map(
        (entry) => ({ ...entry, selected: entry.id === system.paiId }),
      ),
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
   * Pontos de interesse de um diário, no formato das funções puras (id, nome, número, pai).
   * @param {JournalEntry} entry
   */
  static pointsOf(entry) {
    return (entry?.pages.contents ?? [])
      .filter((page) => page.type === PontoInteresseSheet.TYPE)
      .map((page) => ({
        id: page.id,
        name: page.name,
        numero: page.system.numero,
        paiId: page.system.paiId,
      }));
  }

  /**
   * Desafio ligado ao ponto: `null` sem ligação; `{missing: true}` se o desafio foi apagado.
   * @returns {{id: string, nome: string, missing?: boolean}|null}
   */
  #linkedChallenge() {
    const id = this.document.system.desafioId;
    if (!id) return null;
    const challenge = getChallenge(id);
    if (!challenge) return { id, nome: '', missing: true };
    return { id, nome: challenge.nome || t('DESORDEM.Desafio.Estendido.SemNome') };
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
    const linkForm = data.vinculo;
    delete data.vinculo;
    if (linkForm) {
      foundry.utils.setProperty(data, 'system.vinculos', applyLinkForm(this.#links(), linkForm));
    }
    this.#applyParent(data);
    return data;
  }

  /**
   * Pai escolhido agora («Subponto de» mudou): o número vira o do pai mais o próximo livre entre
   * os irmãos. Com o pai igual, vale o número digitado (o mestre pode trocar a última parte).
   * Pai que não está mais no diário vira «sem pai».
   * @param {object} data Dados do formulário, já expandidos (mudados aqui).
   */
  #applyParent(data) {
    const paiId = foundry.utils.getProperty(data, 'system.paiId');
    if (typeof paiId !== 'string' || paiId === this.document.system.paiId) return;
    if (!paiId) return;
    const points = PontoInteresseSheet.pointsOf(this.document.parent);
    const parent = points.find((entry) => entry.id === paiId);
    if (!parent || parent.id === this.document.id) {
      foundry.utils.setProperty(data, 'system.paiId', '');
      return;
    }
    const siblings = points
      .filter((entry) => entry.paiId === paiId && entry.id !== this.document.id)
      .map((entry) => entry.numero);
    foundry.utils.setProperty(data, 'system.numero', nextChildNumber(parent.numero, siblings));
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
    const typed =
      !this.isView && this.form
        ? foundry.utils.expandObject(new foundry.applications.ux.FormDataExtended(this.form).object)
            .ponto
        : null;
    const current = applyBlockForm(this.#blocks(), typed);
    const next = change(current);
    if (next === current) return;
    await this.document.update({ 'system.blocos': next });
  }

  /** Vínculos para o formulário de edição: rótulo, linha amarrada e as opções de linha. */
  #editLinks() {
    const blocks = normalizeBlocks(this.document._source.system?.blocos);
    const saved = this.#links();
    const choices = lineChoices(blocks, t);
    return buildLinks(saved, { blocks, resolve: resolveDoc, t }).map((link) => {
      const raw = saved.find((entry) => entry.id === link.id);
      return {
        ...link,
        rotulo: raw?.rotulo ?? '',
        linhaOpcoes: choices.map((choice) => ({ ...choice, selected: choice.id === raw?.linhaId })),
      };
    });
  }

  /** Vínculos gravados, limpos. */
  #links() {
    return normalizeLinks(this.document._source.system?.vinculos);
  }

  /**
   * Grava uma mudança nos vínculos. Na edição, os valores digitados (rótulo, linha, quantidade)
   * entram junto, como em `#saveBlocks`.
   * @param {(links: object[]) => object[]} change
   */
  async #saveLinks(change) {
    const typed =
      !this.isView && this.form
        ? foundry.utils.expandObject(new foundry.applications.ux.FormDataExtended(this.form).object)
            .vinculo
        : null;
    const current = applyLinkForm(this.#links(), typed);
    const next = change(current);
    if (next === current) return;
    await this.document.update({ 'system.vinculos': next });
  }

  /** Bloco (e linha) do botão clicado, lidos dos `data-bloco` e `data-linha` do HTML. */
  static #target(target) {
    const blockId = target.closest('[data-bloco]')?.dataset.bloco;
    const lineId = target.closest('[data-linha]')?.dataset.linha;
    const linkId = target.closest('[data-vinculo]')?.dataset.vinculo;
    return { blockId, lineId, linkId };
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

  /* ---------------------------------------------------------------------------------------- */
  /* Revelar (modo de leitura)                                                                 */
  /* ---------------------------------------------------------------------------------------- */

  /**
   * Abre a imagem do ponto na janela de imagem do Foundry. Com o `uuid`, o mestre ganha nela o
   * botão do próprio Foundry de mostrar a imagem aos jogadores.
   */
  #showImage() {
    const src = this.document.system.imagem;
    if (!src) return;
    const { ImagePopout } = foundry.applications.apps;
    new ImagePopout({
      src,
      uuid: this.document.uuid,
      window: { title: this.document.name },
    }).render({ force: true });
  }

  /** Encaminha o botão clicado para a ação dele. */
  async #onRevealControl(button) {
    const { blockId, lineId, linkId } = PontoInteresseSheet.#target(button);
    const reveal = button.dataset.revelar === '1';
    switch (button.dataset.pontoAcao) {
      case 'linhaRevelar':
        if (reveal) this.#warnIfNobodySees();
        return this.#saveBlocks((blocks) => setLineRevealed(blocks, blockId, lineId, reveal));
      case 'blocoRevelar':
        if (reveal) this.#warnIfNobodySees();
        return this.#saveBlocks((blocks) => setBlockRevealed(blocks, blockId, reveal));
      case 'linhaJogadores':
        return this.#chooseUsers(blockId, lineId);
      case 'esconderTudo':
        return this.#hideEverything();
      case 'investigar': {
        const block = this.#blocks().find((entry) => entry.id === blockId);
        if (block) InvestigationApp.openForGroup(this.document, blockGroupKey(block, t));
        return undefined;
      }
      case 'desafioAbrir':
        return DesafioApp.open(this.document.system.desafioId);
      case 'vinculoAbrir':
        return this.#openLink(linkId);
      case 'vinculoRevelar':
        if (reveal) this.#warnIfNobodySees();
        return this.#saveLinks((links) => setLinkRevealed(links, linkId, reveal));
      case 'vinculoJogadores':
        return this.#chooseLinkUsers(linkId);
      case 'vinculoEntregar':
        return this.#deliverItem(linkId);
    }
  }

  /** Jogadores do mundo (todos os usuários que não são mestre). */
  static #players() {
    return game.users.filter((user) => !user.isGM);
  }

  /** O jogador pode ver esta página (Observador ou mais, contando a permissão do diário)? */
  #canSee(user) {
    return this.document.testUserPermission(user, 'OBSERVER');
  }

  /** Revelar para todos não adianta se nenhum jogador pode ver a página: avisa o mestre. */
  #warnIfNobodySees() {
    const players = PontoInteresseSheet.#players();
    if (players.length && !players.some((user) => this.#canSee(user))) {
      ui.notifications.warn(t('DESORDEM.Ponto.AvisoNinguem'));
    }
  }

  /** Janela para escolher quem vê a linha (a revelação para todos não muda). */
  async #chooseUsers(blockId, lineId) {
    const line = this.#blocks()
      .find((block) => block.id === blockId)
      ?.linhas.find((entry) => entry.id === lineId);
    if (!line) return;
    const chosen = await this.#askUsers(line.reveladaPara);
    if (!chosen) return;
    await this.#saveBlocks((blocks) =>
      setLineUsers(
        blocks,
        blockId,
        lineId,
        chosen.map((user) => user.id),
      ),
    );
  }

  /** Janela para escolher quem vê o vínculo. */
  async #chooseLinkUsers(linkId) {
    const link = this.#links().find((entry) => entry.id === linkId);
    if (!link) return;
    const chosen = await this.#askUsers(link.reveladoPara);
    if (!chosen) return;
    await this.#saveLinks((links) =>
      setLinkUsers(
        links,
        linkId,
        chosen.map((user) => user.id),
      ),
    );
  }

  /**
   * Janela «Revelar para quem?»: caixas dos jogadores, com os já escolhidos marcados. Avisa de
   * quem não tem permissão na página.
   * @param {string[]} selected Ids já escolhidos.
   * @returns {Promise<User[]|null>} Jogadores escolhidos, ou `null` se cancelou.
   */
  async #askUsers(selected) {
    const players = PontoInteresseSheet.#players();
    if (!players.length) {
      ui.notifications.info(t('DESORDEM.Ponto.Jogadores.Nenhum'));
      return null;
    }
    const content = await renderTemplate(`${TEMPLATES}/ponto-jogadores.hbs`, {
      jogadores: players.map((user) => ({
        id: user.id,
        nome: user.name,
        personagem: user.character?.name ?? '',
        marcado: selected.includes(user.id),
        semAcesso: !this.#canSee(user),
      })),
    });
    const answer = await DialogV2.wait({
      window: { title: t('DESORDEM.Ponto.Jogadores.Titulo') },
      classes: ['desordem-normal', 'desordem-ponto-dialogo'],
      content,
      modal: true,
      rejectClose: false,
      buttons: [
        {
          action: 'salvar',
          label: t('DESORDEM.Ponto.Jogadores.Salvar'),
          icon: 'fa-solid fa-user-check',
          default: true,
          callback: (event, button, dialog) => ({
            confirmed: true,
            ids: [...dialog.element.querySelectorAll('[name="jogador"]:checked')].map(
              (input) => input.value,
            ),
          }),
        },
        { action: 'cancelar', label: t('DESORDEM.Ponto.Jogadores.Cancelar') },
      ],
    });
    // Só {confirmed: true} confirma: fechar no X ou cancelar devolve outra coisa
    if (answer?.confirmed !== true) return null;
    // Nunca confia no que veio da janela: só vale quem estava na lista oferecida
    const chosen = players.filter((user) => answer.ids.includes(user.id));
    const blind = chosen.filter((user) => !this.#canSee(user));
    if (blind.length) {
      ui.notifications.warn(
        t('DESORDEM.Ponto.AvisoSemAcesso', { nomes: blind.map((user) => user.name).join(', ') }),
      );
    }
    return chosen;
  }

  /**
   * Abre o documento do vínculo: a página abre dentro do diário dela; os outros, na própria
   * ficha. Sem permissão (ou apagado), só avisa.
   */
  async #openLink(linkId) {
    const link = normalizeLinks(this.document.system.vinculos).find((entry) => entry.id === linkId);
    const doc = link ? await foundry.utils.fromUuid(link.uuid) : null;
    if (!doc) {
      ui.notifications.warn(t('DESORDEM.Ponto.Vinculo.Sumiu'));
      return;
    }
    if (!doc.testUserPermission(game.user, 'LIMITED')) {
      ui.notifications.warn(t('DESORDEM.Ponto.Vinculo.SemPermissao'));
      return;
    }
    if (doc.documentName === 'JournalEntryPage') {
      doc.parent.sheet.render({ force: true, pageId: doc.id });
      return;
    }
    doc.sheet.render({ force: true });
  }

  /**
   * «Entregar a…» (só o mestre): escolhe um personagem e põe uma unidade do item na ficha dele.
   * Se ele já tem um item igual (mesmo nome e tipo, com quantidade), soma 1; senão cria uma cópia
   * com quantidade 1. O ponto perde uma unidade e o chat avisa.
   */
  async #deliverItem(linkId) {
    if (!game.user.isGM) return;
    const link = this.#links().find((entry) => entry.id === linkId);
    if (!link || link.tipo !== 'Item' || link.quantidade <= 0) return;
    const item = await foundry.utils.fromUuid(link.uuid);
    if (!item) {
      ui.notifications.warn(t('DESORDEM.Ponto.Vinculo.Sumiu'));
      return;
    }
    const actor = await this.#askActor(link.rotulo || item.name);
    if (!actor) return;
    const same = actor.items.find(
      (owned) =>
        owned.name === item.name &&
        owned.type === item.type &&
        typeof owned.system?.quantidade === 'number',
    );
    if (same) {
      await same.update({ 'system.quantidade': same.system.quantidade + 1 });
    } else {
      const data = item.toObject();
      delete data._id;
      if (typeof data.system?.quantidade === 'number') data.system.quantidade = 1;
      await actor.createEmbeddedDocuments('Item', [data]);
    }
    await this.#saveLinks((links) => takeOne(links, linkId));
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ user: game.user }),
      content: `<div class="desordem-chat desordem-ponto-entrega"><p><i class="fa-solid fa-suitcase" aria-hidden="true"></i> ${escapeHtml(
        t('DESORDEM.Ponto.Vinculo.Entregue', { item: item.name, personagem: actor.name }),
      )}</p></div>`,
    });
  }

  /**
   * Janela para escolher quem recebe o item: os personagens do mundo, com os de jogadores primeiro.
   * @returns {Promise<Actor|null>}
   */
  async #askActor(itemName) {
    const characters = game.actors
      .filter((actor) => actor.type === 'personagem')
      .sort((a, b) => Number(b.hasPlayerOwner) - Number(a.hasPlayerOwner));
    if (!characters.length) {
      ui.notifications.warn(t('DESORDEM.Ponto.Vinculo.SemPersonagens'));
      return null;
    }
    const options = characters
      .map((actor) => `<option value="${actor.id}">${escapeHtml(actor.name)}</option>`)
      .join('');
    const answer = await DialogV2.wait({
      window: { title: t('DESORDEM.Ponto.Vinculo.EntregarTitulo', { item: itemName }) },
      classes: ['desordem-normal', 'desordem-ponto-dialogo'],
      content: `<div class="form-group"><label>${escapeHtml(t('DESORDEM.Ponto.Vinculo.Quem'))}</label><div class="form-fields"><select name="personagem">${options}</select></div></div>`,
      modal: true,
      rejectClose: false,
      buttons: [
        {
          action: 'entregar',
          label: t('DESORDEM.Ponto.Vinculo.Entregar'),
          icon: 'fa-solid fa-hand-holding',
          default: true,
          callback: (event, button, dialog) => ({
            confirmed: true,
            id: dialog.element.querySelector('[name="personagem"]')?.value,
          }),
        },
        { action: 'cancelar', label: t('DESORDEM.Ponto.Jogadores.Cancelar') },
      ],
    });
    if (answer?.confirmed !== true) return null;
    return characters.find((actor) => actor.id === answer.id) ?? null;
  }

  /** Esconde todas as linhas da página, depois de confirmar. */
  async #hideEverything() {
    const confirmed = await DialogV2.confirm({
      window: { title: t('DESORDEM.Ponto.EsconderTudo') },
      content: `<p>${escapeHtml(t('DESORDEM.Ponto.ConfirmarEsconderTudo'))}</p>`,
      rejectClose: false,
    });
    if (!confirmed) return;
    await this.document.update({
      'system.blocos': hideAll(this.#blocks()),
      'system.vinculos': hideAllLinks(this.#links()),
    });
  }

  /* ---------------------------------------------------------------------------------------- */
  /* Botões do modo de edição                                                                  */
  /* ---------------------------------------------------------------------------------------- */

  /**
   * Cria um desafio na guia Desafios com o nome da página e o tipo escolhido ao lado do botão, e
   * liga ao ponto. Só o mestre cria desafios (eles ficam numa configuração do mundo).
   */
  static async #onCreateChallenge(event, target) {
    if (!game.user.isGM) return;
    const select = target.closest('.desordem-ponto__desafio')?.querySelector('[data-desafio-tipo]');
    const tipo = CHALLENGE_TYPES.includes(select?.value) ? select.value : 'estendido';
    const id = await createChallenge(this.document.name, tipo);
    if (!id) {
      ui.notifications.warn(t('DESORDEM.Ponto.Desafio.NaoCriou'));
      return;
    }
    await this.document.update({ 'system.desafioId': id });
    ui.notifications.info(t('DESORDEM.Ponto.Desafio.Criado', { nome: this.document.name }));
  }

  static async #onRemoveLink(event, target) {
    const { linkId } = PontoInteresseSheet.#target(target);
    await this.#saveLinks((links) => removeLink(links, linkId));
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
