/**
 * Janela dos pontos de checagem (ApplicationV2, só o mestre). Mostra a lista de rodada + PA alvo,
 * deixa trocar o PA de um ponto, tirar pontos, acrescentar um novo e limpar a lista. O último
 * ponto (maior rodada) é o PA final: acrescentar um ponto numa rodada mais à frente, mesmo com a
 * perseguição em andamento, faz dele o novo PA final.
 */
import { SYSTEM_ID } from '../config.js';
import { normalizeCheckpoints } from '../rolls/chase.js';
import { clearCheckpoints, deleteCheckpoint, findChase, setCheckpoint } from './store.js';
import { t } from '../shared/i18n.js';
import { TypingGuard } from '../shared/typing-guard.js';

const { HandlebarsApplicationMixin, ApplicationV2, DialogV2 } = foundry.applications.api;

export default class PontosApp extends HandlebarsApplicationMixin(ApplicationV2) {
  /** Instância única: abrir de novo só traz a janela existente para a frente. */
  static #instance = null;

  static DEFAULT_OPTIONS = {
    id: 'desordem-perseguicao-pontos',
    classes: ['desordem-normal', 'perseguicao-pontos'],
    position: { width: 360, height: 'auto' },
    window: {
      title: 'DESORDEM.Perseguicao.Pontos.Titulo',
      icon: 'fa-solid fa-list-check',
      resizable: true,
    },
    actions: {
      addPoint: PontosApp.#onAddPoint,
      removePoint: PontosApp.#onRemovePoint,
      clearPoints: PontosApp.#onClearPoints,
    },
  };

  static PARTS = {
    lista: {
      template: `systems/${SYSTEM_ID}/templates/perseguicao/pontos.hbs`,
      scrollable: [''],
    },
  };

  /** Espera quem está digitando antes de redesenhar (`shared/typing-guard.js`). */
  #guard = new TypingGuard(this);

  /** Abre a janela (só o mestre) ou a traz para a frente se já estiver aberta. */
  static async open() {
    if (!game.user.isGM) return null;
    PontosApp.#instance ??= new PontosApp();
    const app = PontosApp.#instance;
    await app.render({ force: true });
    app.bringToFront?.();
    return app;
  }

  /** Redesenha a janela se estiver aberta (a lista mudou), sem apagar o que está sendo digitado. */
  static refresh() {
    PontosApp.#instance?.#guard.refresh();
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const chase = findChase();
    const points = chase ? normalizeCheckpoints(chase.system.pontos) : [];
    const last = points.length ? points[points.length - 1] : null;
    return {
      ...context,
      existe: Boolean(chase),
      pontos: points.map((point, index) => ({ ...point, final: index === points.length - 1 })),
      // Sugestão para o próximo ponto: a rodada seguinte à do último
      sugestaoRodada: last ? last.rodada + 1 : 1,
    };
  }

  /**
   * Liga os campos digitáveis. Como em todas as ações do ApplicationV2, `data-action` só trata
   * clique; os campos usam `data-campo` e estes ouvintes. O PA de um ponto é gravado ao
   * confirmar (Enter ou sair do campo).
   */
  _onRender(context, options) {
    super._onRender?.(context, options);
    for (const input of this.element.querySelectorAll('input')) {
      this.#guard.watch(input);
      input.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        if (input.dataset.campo === 'ponto-pa') input.blur();
        else this.element.querySelector('[data-action="addPoint"]')?.click();
      });
    }
    for (const input of this.element.querySelectorAll('input[data-campo="ponto-pa"]')) {
      input.addEventListener('change', () => this.#commitPoint(input));
    }
  }

  /** Troca o PA de um ponto já existente. Valor inválido não grava; a janela é redesenhada. */
  async #commitPoint(input) {
    this.#guard.done();
    const chase = findChase();
    if (chase) await setCheckpoint(chase, Number(input.dataset.rodada), input.value);
    this.render();
  }

  /** Acrescenta um ponto com os campos «rodada» e «PA» da linha de baixo. */
  static async #onAddPoint() {
    const chase = findChase();
    if (!chase) return;
    const round = this.element.querySelector('[name="novaRodada"]')?.value;
    const pa = this.element.querySelector('[name="novoPa"]')?.value;
    this.#guard.done();
    const saved = await setCheckpoint(chase, round, pa);
    if (!saved) ui.notifications.warn(t('DESORDEM.Perseguicao.Pontos.Invalido'));
    this.render();
  }

  static async #onRemovePoint(event, target) {
    const chase = findChase();
    if (chase) await deleteCheckpoint(chase, Number(target.dataset.rodada));
  }

  /** Limpar apaga todos os pontos: pede confirmação. */
  static async #onClearPoints() {
    const chase = findChase();
    if (!chase) return;
    const confirmed = await DialogV2.confirm({
      window: { title: t('DESORDEM.Perseguicao.Pontos.Limpar') },
      content: `<p>${t('DESORDEM.Perseguicao.Pontos.LimparConfirmar')}</p>`,
      rejectClose: false,
      modal: true,
    });
    if (confirmed === true) await clearCheckpoints(chase);
  }
}
