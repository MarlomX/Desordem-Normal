/**
 * Janela da perseguição (ApplicationV2). É a mesma janela para todos: o mestre vê os botões de
 * administração, os jogadores só acompanham. Ela não guarda estado próprio; tudo vem do
 * encontro (veja store.js) e a janela é redesenhada pelos hooks de hooks.js.
 */
import { SYSTEM_ID } from '../config.js';
import { addableActors } from '../rolls/chase.js';
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
  startChase,
} from './store.js';

const { HandlebarsApplicationMixin, ApplicationV2, DialogV2 } = foundry.applications.api;

const t = (key) => game.i18n.localize(key);
const renderTemplate = (path, data) => foundry.applications.handlebars.renderTemplate(path, data);

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

  /** Redesenha a janela se ela estiver aberta (chamado quando o estado muda). */
  static refresh() {
    const app = PerseguicaoApp.#instance;
    if (app?.rendered) app.render();
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

  /** Ajuste manual de PA ou fôlego (só o mestre). */
  static async #onAdjustParticipant(event, target) {
    const chase = findChase();
    const { combatantId, field } = target.dataset;
    if (chase) await adjustParticipant(chase, combatantId, field, Number(target.dataset.delta));
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
