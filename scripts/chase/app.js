/**
 * Janela da perseguição (ApplicationV2). É a mesma janela para todos: o mestre vê os botões de
 * administração, os jogadores só acompanham. Ela não guarda estado próprio; tudo vem do
 * encontro (veja store.js) e a janela é redesenhada pelos hooks de hooks.js.
 */
import { SYSTEM_ID } from '../config.js';
import { addableActors, parseTypedValue } from '../rolls/chase.js';
import { askAndPostPenalty } from './penalty-card.js';
import PontosApp from './points-app.js';
import {
  addParticipants,
  adjustParticipant,
  chaseView,
  createChase,
  currentAccess,
  deleteChase,
  endChase,
  findChase,
  nextRound,
  participantActorIds,
  removeParticipant,
  setActed,
  setChaseDt,
  setParticipantField,
  setRound,
  startChase,
  toggleReveal,
} from './store.js';
import { t } from '../shared/i18n.js';
import { renderTemplate } from '../shared/templates.js';
import { TypingGuard } from '../shared/typing-guard.js';

const { HandlebarsApplicationMixin, ApplicationV2, DialogV2 } = foundry.applications.api;

export default class PerseguicaoApp extends HandlebarsApplicationMixin(ApplicationV2) {
  /** Instância única: abrir de novo só traz a janela existente para a frente. */
  static #instance = null;

  static DEFAULT_OPTIONS = {
    id: 'desordem-perseguicao',
    classes: ['desordem-normal', 'perseguicao'],
    position: { width: 420, height: 480 },
    window: {
      title: 'DESORDEM.Perseguicao.Titulo',
      icon: 'fa-solid fa-person-running',
      resizable: true,
    },
    actions: {
      createChase: PerseguicaoApp.#onCreateChase,
      startChase: PerseguicaoApp.#onStartChase,
      endChase: PerseguicaoApp.#onEndChase,
      deleteChase: PerseguicaoApp.#onDeleteChase,
      addParticipants: PerseguicaoApp.#onAddParticipants,
      removeParticipant: PerseguicaoApp.#onRemoveParticipant,
      toggleActed: PerseguicaoApp.#onToggleActed,
      adjustParticipant: PerseguicaoApp.#onAdjustParticipant,
      nextRound: PerseguicaoApp.#onNextRound,
      adjustDt: PerseguicaoApp.#onAdjustDt,
      adjustRound: PerseguicaoApp.#onAdjustRound,
      openPoints: PerseguicaoApp.#onOpenPoints,
      openPenalty: PerseguicaoApp.#onOpenPenalty,
      toggleReveal: PerseguicaoApp.#onToggleReveal,
    },
  };

  static PARTS = {
    painel: {
      template: `systems/${SYSTEM_ID}/templates/perseguicao/painel.hbs`,
      scrollable: [''],
    },
  };

  /** Abre a janela (ou a traz para a frente se já estiver aberta). */
  static async open() {
    PerseguicaoApp.#instance ??= new PerseguicaoApp();
    const app = PerseguicaoApp.#instance;
    await app.render({ force: true });
    app.bringToFront?.();
    return app;
  }

  /** Espera quem está digitando antes de redesenhar (`shared/typing-guard.js`). */
  #guard = new TypingGuard(this);

  /**
   * Redesenha a janela se ela estiver aberta (chamado quando o estado muda). Se alguém está
   * digitando num campo, espera: redesenhar agora apagaria o que está sendo digitado.
   */
  static refresh() {
    PerseguicaoApp.#instance?.#guard.refresh();
  }

  /**
   * Depois de cada desenho, liga os campos digitáveis (PA, fôlego e DT). As ações do
   * ApplicationV2 (`data-action`) só tratam clique, então os campos usam `data-campo` e estes
   * ouvintes. O valor só é gravado ao confirmar (evento `change`: Enter ou sair do campo), nunca a
   * cada tecla.
   */
  _onRender(context, options) {
    super._onRender?.(context, options);
    for (const input of this.element.querySelectorAll('input[data-campo]')) {
      this.#guard.watch(input);
      input.addEventListener('change', () => this.#commitField(input));
      input.addEventListener('keydown', (event) => {
        // Enter confirma: tirar o foco do campo dispara o `change`
        if (event.key !== 'Enter') return;
        event.preventDefault();
        input.blur();
      });
    }
  }

  /**
   * Grava o valor digitado. Valor inválido (vazio, texto) ou sem permissão não grava nada. Em
   * qualquer caso a janela é redesenhada em seguida, o que devolve o campo ao valor guardado.
   * O mestre decide a DT; PA e fôlego seguem a regra de `canEditParticipant` (store.js).
   */
  async #commitField(input) {
    this.#guard.done();
    const chase = findChase();
    if (chase) {
      const { campo, combatantId } = input.dataset;
      if (campo === 'rodada') {
        await setRound(chase, { raw: input.value });
      } else if (campo === 'dt') {
        const typed = parseTypedValue('dt', input.value);
        if (typed.valid && game.user.isGM) await setChaseDt(chase, typed.value);
      } else {
        await setParticipantField(chase, combatantId, campo, input.value);
      }
    }
    this.render();
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const chase = findChase();
    const access = currentAccess(chase);
    return {
      ...context,
      isGM: game.user.isGM,
      access,
      // Quem não pode abrir a perseguição (ainda em preparação, por exemplo) não vê a lista.
      view: chase && access.canOpen ? chaseView(chase) : null,
    };
  }

  static async #onCreateChase() {
    await createChase();
  }

  static async #onStartChase() {
    const chase = findChase();
    if (chase) await startChase(chase);
  }

  static async #onEndChase() {
    const chase = findChase();
    if (chase) await endChase(chase);
  }

  /** Caixa "já agiu": o dono do personagem e o mestre marcam e desmarcam. */
  static async #onToggleActed(event, target) {
    const chase = findChase();
    if (chase) await setActed(chase, target.dataset.combatantId, target.checked);
  }

  /** Ajuste de PA ou fôlego pelos botões (o mestre, ou o jogador confiável no próprio personagem). */
  static async #onAdjustParticipant(event, target) {
    const chase = findChase();
    const { combatantId, field } = target.dataset;
    if (chase) await adjustParticipant(chase, combatantId, field, Number(target.dataset.delta));
  }

  /** Muda a DT padrão do avanço desta perseguição (só o mestre). */
  static async #onAdjustDt(event, target) {
    const chase = findChase();
    if (chase) await setChaseDt(chase, chase.system.dt + Number(target.dataset.delta));
  }

  /** Muda a rodada atual na mão pelos botões −/+ (só o mestre). */
  static async #onAdjustRound(event, target) {
    const chase = findChase();
    if (chase) await setRound(chase, { delta: Number(target.dataset.delta) });
  }

  /** Abre a janela dos pontos de checagem (só o mestre). */
  static async #onOpenPoints() {
    await PontosApp.open();
  }

  /** Abre a janela da penalidade (só o mestre) e posta o cartão no chat. */
  static async #onOpenPenalty() {
    await askAndPostPenalty();
  }

  /** Olhos: mostra ou esconde dos jogadores o próximo PA alvo ou o PA final (só o mestre). */
  static async #onToggleReveal(event, target) {
    const chase = findChase();
    if (chase) await toggleReveal(chase, target.dataset.field);
  }

  static async #onNextRound() {
    const chase = findChase();
    if (chase) await nextRound(chase);
  }

  /** Apagar é destrutivo (some a lista de participantes): pede confirmação. */
  static async #onDeleteChase() {
    const chase = findChase();
    if (!chase) return;
    const confirmed = await DialogV2.confirm({
      window: { title: t('DESORDEM.Perseguicao.Excluir') },
      content: `<p>${t('DESORDEM.Perseguicao.ExcluirConfirmar')}</p>`,
      rejectClose: false,
      modal: true,
    });
    if (confirmed === true) await deleteChase(chase);
  }

  static async #onRemoveParticipant(event, target) {
    const chase = findChase();
    const id = target.dataset.combatantId;
    if (chase && id) await removeParticipant(chase, id);
  }

  /** Abre a lista de personagens que ainda não participam e adiciona os marcados. */
  static async #onAddParticipants() {
    const chase = findChase();
    if (!chase) return;
    const candidates = addableActors(
      game.actors
        .filter((actor) => actor.type === 'personagem')
        .map((actor) => ({ id: actor.id, name: actor.name })),
      participantActorIds(chase),
    );
    if (candidates.length === 0) {
      ui.notifications.info(t('DESORDEM.Perseguicao.SemPersonagens'));
      return;
    }
    const content = await renderTemplate(
      `systems/${SYSTEM_ID}/templates/perseguicao/adicionar.hbs`,
      {
        candidates,
      },
    );
    const answer = await DialogV2.wait({
      window: { title: t('DESORDEM.Perseguicao.Adicionar') },
      classes: ['desordem-normal', 'desordem-perseguicao-dialogo'],
      content,
      modal: true,
      rejectClose: false,
      buttons: [
        {
          action: 'add',
          label: t('DESORDEM.Perseguicao.AdicionarBotao'),
          icon: 'fa-solid fa-user-plus',
          default: true,
          callback: (event, button, dialog) => ({
            confirmed: true,
            ids: [...dialog.element.querySelectorAll('input[name="actor"]:checked')].map(
              (input) => input.value,
            ),
          }),
        },
        { action: 'cancel', label: t('DESORDEM.Teste.Pre.Cancelar') },
      ],
    });
    // Só {confirmed: true} confirma: fechar no X ou cancelar devolve outra coisa.
    if (answer?.confirmed !== true) return;
    // Nunca confia no que veio da janela: só entram ids que estavam na lista oferecida.
    const allowed = new Set(candidates.map((candidate) => candidate.id));
    const actors = answer.ids
      .filter((id) => allowed.has(id))
      .map((id) => game.actors.get(id))
      .filter(Boolean);
    await addParticipants(chase, actors);
  }
}
