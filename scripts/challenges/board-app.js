/**
 * Janela do quadro de teoria de uma fechadura (ApplicationV2). Aberta pelo cartão de desafios da
 * ficha e pela guia, para o mestre e os participantes; quem não participa só olha.
 *
 * O quadro mostra cada linha (tentativas enviadas e linhas de teoria) com os dados lado a lado e,
 * em cada dado, as marcas ▲, = e ▼, que ligam e desligam com um clique. Nas linhas de teoria os
 * números são digitáveis, e em todas as linhas cada dado tem um campo para anotar o som ouvido. Toda mudança vai ao mestre (requestBoardChange), que grava no desafio;
 * a janela é redesenhada quando o desafio muda (sem perder o que alguém está digitando).
 */
import { SYSTEM_ID } from '../config.js';
import { MAX_SOUND, boardView } from '../rolls/lock-board.js';
import { lockComposition, lockStatus, maximumVisible } from '../rolls/lock.js';
import { canEditBoard, requestBoardChange } from './lock-card.js';
import { challengeVisibleTo } from '../rolls/challenge.js';
import { getChallenge } from './store.js';

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

export default class QuadroApp extends HandlebarsApplicationMixin(ApplicationV2) {
  /** Uma janela por desafio (id do desafio → janela). */
  static #instances = new Map();

  static DEFAULT_OPTIONS = {
    classes: ['desordem-normal', 'perseguicao', 'desordem-quadro-janela'],
    position: { width: 380, height: 520 },
    window: { title: 'DESORDEM.Desafio.Quadro.Titulo', icon: 'fa-solid fa-key', resizable: true },
    actions: {
      newRow: QuadroApp.#onNewRow,
      toggleMark: QuadroApp.#onToggleMark,
      removeRow: QuadroApp.#onRemoveRow,
    },
  };

  static PARTS = {
    corpo: { template: `systems/${SYSTEM_ID}/templates/desafios/quadro.hbs`, scrollable: [''] },
  };

  /** Id do desafio deste quadro. */
  #challengeId;

  /** Alguém está digitando um número (o redesenho espera). */
  #typing = false;
  #renderPending = false;

  constructor(challengeId, options = {}) {
    super({ ...options, id: `desordem-quadro-${challengeId}`, desafioId: challengeId });
    this.#challengeId = challengeId;
  }

  /** Título: «Fechadura: nome do desafio». */
  get title() {
    const challenge = getChallenge(this.options?.desafioId);
    return t('DESORDEM.Desafio.Quadro.TituloNome', {
      nome: challenge?.nome || t('DESORDEM.Desafio.Tipo.destrancar'),
    });
  }

  /** Abre o quadro de um desafio de destrancar (qualquer um que veja o desafio pode olhar). */
  static async open(challengeId) {
    const challenge = getChallenge(challengeId);
    if (challenge?.tipo !== 'destrancar') return null;
    // O jogador só abre o quadro de um desafio que ele pode ver na guia
    const ownedActorIds = game.actors.filter((actor) => actor.isOwner).map((actor) => actor.id);
    if (!challengeVisibleTo(challenge, { isGM: game.user.isGM, ownedActorIds })) return null;
    let app = QuadroApp.#instances.get(challengeId);
    if (!app) {
      app = new QuadroApp(challengeId);
      QuadroApp.#instances.set(challengeId, app);
    }
    await app.render({ force: true });
    app.bringToFront?.();
    return app;
  }

  /** Redesenha os quadros abertos (o desafio mudou). O de um desafio apagado fecha. */
  static refreshAll() {
    for (const [id, app] of QuadroApp.#instances) {
      const challenge = getChallenge(id);
      if (challenge?.tipo !== 'destrancar') {
        QuadroApp.#instances.delete(id);
        if (app.rendered) app.close();
        continue;
      }
      if (!app.rendered) continue;
      if (app.#typing) {
        app.#renderPending = true;
        continue;
      }
      app.render();
    }
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const challenge = getChallenge(this.#challengeId);
    if (!challenge) return { ...context, existe: false };
    const lock = challenge.fechadura;
    const status = lockStatus(lock);
    return {
      ...context,
      existe: true,
      editar: canEditBoard(challenge),
      composicao: lockComposition(lock),
      usadas: lock.usadas,
      maximo: maximumVisible(lock, { isGM: game.user.isGM }) ? lock.maximo : null,
      destrancada: status === 'destrancada',
      estragada: status === 'estragada',
      linhas: boardView(lock),
      // Tamanho máximo do som anotado (o mesmo dos sons da fechadura)
      maxSom: MAX_SOUND,
    };
  }

  /**
   * Liga os campos de número e de som (gravam ao confirmar: Enter ou sair do campo). O `op` do
   * pedido vem do próprio campo: `valor` (número das linhas de teoria) ou `som` (o som anotado).
   */
  _onRender(context, options) {
    super._onRender?.(context, options);
    const titleElement = this.window?.title;
    if (titleElement && 'textContent' in titleElement) titleElement.textContent = this.title;
    for (const field of this.element.querySelectorAll('[data-campo="valor"], [data-campo="som"]')) {
      field.addEventListener('input', () => {
        this.#typing = true;
      });
      field.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        field.blur();
      });
      field.addEventListener('change', () => {
        this.#typing = false;
        requestBoardChange(this.#challengeId, {
          op: field.dataset.campo,
          rowId: field.dataset.rowId,
          index: Number(field.dataset.index),
          value: field.value,
        });
      });
      field.addEventListener('blur', () => {
        this.#typing = false;
        if (!this.#renderPending) return;
        this.#renderPending = false;
        globalThis.setTimeout(() => this.render(), 250);
      });
    }
  }

  static async #onNewRow() {
    await requestBoardChange(this.#challengeId, { op: 'nova' });
  }

  /** Liga ou desliga uma marca (▲, = ou ▼) de um dado. */
  static async #onToggleMark(event, target) {
    const { rowId, index, mark } = target.dataset;
    await requestBoardChange(this.#challengeId, {
      op: 'marca',
      rowId,
      index: Number(index),
      mark,
    });
  }

  static async #onRemoveRow(event, target) {
    await requestBoardChange(this.#challengeId, { op: 'apagar', rowId: target.dataset.rowId });
  }
}
