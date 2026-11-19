/**
 * Janela de um desafio (ApplicationV2), só para o mestre: configuração, participantes, ajuste dos
 * pontos e penalidade. Há uma janela por desafio (abrir de novo só traz a existente para a
 * frente). A janela não guarda estado: tudo vem da configuração do mundo (store.js) e ela é
 * redesenhada quando a configuração muda.
 */
import { SYSTEM_ID } from '../config.js';
import {
  CHALLENGE_MODES,
  ON_FAIL,
  ON_PASS,
  TYPE_ICONS,
  addParticipants,
  addableChallengeActors,
  adjustPoints,
  challengeView,
  removeParticipant,
  typePoints,
  updateChallengeField,
} from '../rolls/challenge.js';
import { askAndPostPenalty } from '../chase/penalty-card.js';
import {
  actorInfo,
  deleteChallenge,
  getChallenge,
  mutateChallenge,
  worldActorId,
} from './store.js';

const { HandlebarsApplicationMixin, ApplicationV2, DialogV2 } = foundry.applications.api;

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const renderTemplate = (path, data) => foundry.applications.handlebars.renderTemplate(path, data);

/** Nome mostrado de um desafio (o padrão, se o mestre apagou o nome). */
export const challengeName = (challenge) =>
  challenge?.nome || t('DESORDEM.Desafio.Estendido.SemNome');

/** Grupo de chaves da dica de cada tipo (o arrombar usa a do teste estendido). */
const TYPE_HINTS = {
  estendido: 'Estendido',
  arrombar: 'Estendido',
  escalar: 'Escalar',
  alcancar: 'Alcancar',
  sustentar: 'Sustentar',
};

/** Campos de configuração que a janela grava pelo `change` (os demais são pontos). */
const CONFIG_FIELDS = new Set([
  'nome',
  'pa',
  'dt',
  'dtRapida',
  'dtCautelosa',
  'custoPv',
  'modo',
  'somaPassar',
  'somaFalhar',
  'revelarPa',
]);

/**
 * Pergunta se apaga o desafio e apaga (usado pela janela e pela guia). O nome vai escapado: foi
 * digitado pelo mestre e entra no HTML da pergunta.
 */
export async function confirmDeleteChallenge(id) {
  const challenge = getChallenge(id);
  if (!challenge || !game.user.isGM) return;
  const answer = await DialogV2.confirm({
    window: { title: t('DESORDEM.Desafio.Excluir') },
    content: `<p>${Handlebars.escapeExpression(
      t('DESORDEM.Desafio.ExcluirConfirmar', { nome: challengeName(challenge) }),
    )}</p>`,
    rejectClose: false,
    modal: true,
  });
  if (answer === true) await deleteChallenge(id);
}

export default class DesafioApp extends HandlebarsApplicationMixin(ApplicationV2) {
  /** Uma janela por desafio (id do desafio → janela). */
  static #instances = new Map();

  static DEFAULT_OPTIONS = {
    classes: ['desordem-normal', 'perseguicao', 'desordem-desafio-janela'],
    position: { width: 440, height: 560 },
    window: {
      title: 'DESORDEM.Desafio.Estendido.Titulo',
      icon: 'fa-solid fa-flag-checkered',
      resizable: true,
    },
    actions: {
      adjustPoints: DesafioApp.#onAdjustPoints,
      addParticipants: DesafioApp.#onAddParticipants,
      addSelected: DesafioApp.#onAddSelected,
      removeParticipant: DesafioApp.#onRemoveParticipant,
      toggleActive: DesafioApp.#onToggleActive,
      openPenalty: DesafioApp.#onOpenPenalty,
      deleteChallenge: DesafioApp.#onDeleteChallenge,
    },
  };

  static PARTS = {
    corpo: {
      template: `systems/${SYSTEM_ID}/templates/desafios/janela.hbs`,
      scrollable: [''],
    },
  };

  /** Id do desafio mostrado por esta janela. */
  #challengeId;

  /** A pessoa está digitando num campo e ainda não confirmou (Enter ou sair do campo)? */
  #typing = false;

  /** Chegou uma atualização enquanto ela digitava: redesenha quando ela terminar. */
  #renderPending = false;

  constructor(challengeId, options = {}) {
    // O id da janela precisa ser único: um por desafio
    // O id do desafio também vai nas opções: o título pode ser lido antes do fim do construtor
    super({ ...options, id: `desordem-desafio-${challengeId}`, desafioId: challengeId });
    this.#challengeId = challengeId;
  }

  /** Título da janela: o nome do desafio. */
  get title() {
    return challengeName(getChallenge(this.options?.desafioId));
  }

  /** Abre a janela de um desafio (só o mestre). */
  static async open(challengeId) {
    if (!game.user.isGM || !getChallenge(challengeId)) return null;
    let app = DesafioApp.#instances.get(challengeId);
    if (!app) {
      app = new DesafioApp(challengeId);
      DesafioApp.#instances.set(challengeId, app);
    }
    await app.render({ force: true });
    app.bringToFront?.();
    return app;
  }

  /**
   * Redesenha as janelas abertas (chamado quando a configuração muda). A janela de um desafio
   * apagado fecha. Quem está digitando não perde o texto: o desenho espera o fim da digitação.
   */
  static refreshAll() {
    for (const [id, app] of DesafioApp.#instances) {
      if (!getChallenge(id)) {
        DesafioApp.#instances.delete(id);
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
    if (!challenge) return { ...context, view: null };
    const view = challengeView(challenge, { isGM: true, actorInfo });
    const option = (prefix, current) => (value) => ({
      value,
      label: t(`${prefix}.${value}`),
      selected: value === current,
    });
    return {
      ...context,
      view,
      icone: TYPE_ICONS[challenge.tipo] ?? TYPE_ICONS.estendido,
      // Chave montada (conferida à mão): DESORDEM.Desafio.Tipo.{estendido,arrombar,escalar}
      tipoRotulo: t(`DESORDEM.Desafio.Tipo.${challenge.tipo}`),
      // Dica e unidade dos pontos de cada tipo (chaves montadas, conferidas à mão)
      dica: t(`DESORDEM.Desafio.${TYPE_HINTS[challenge.tipo] ?? 'Estendido'}.Dica`),
      pontosRotulo: t(`DESORDEM.Desafio.Unidade.${challenge.tipo}`),
      // Chaves montadas aqui (conferidas à mão): DESORDEM.Desafio.Modo.*, .Passar.*, .Falhar.*
      modos: CHALLENGE_MODES.map(option('DESORDEM.Desafio.Modo', challenge.modo)),
      passar: ON_PASS.map(option('DESORDEM.Desafio.Passar', challenge.somaPassar)),
      falhar: ON_FAIL.map(option('DESORDEM.Desafio.Falhar', challenge.somaFalhar)),
    };
  }

  /**
   * Depois de cada desenho: atualiza o título (o nome pode ter mudado) e liga os campos. As ações
   * (`data-action`) só tratam clique; os campos usam `data-campo` e gravam no `change` (Enter ou
   * sair do campo; nas caixas de marcar e nas listas, ao escolher).
   */
  _onRender(context, options) {
    super._onRender?.(context, options);
    const titleElement = this.window?.title;
    if (titleElement && 'textContent' in titleElement) titleElement.textContent = this.title;
    for (const field of this.element.querySelectorAll('[data-campo]')) {
      field.addEventListener('input', () => {
        if (field.type !== 'checkbox') this.#typing = true;
      });
      field.addEventListener('change', () => this.#commit(field));
      if (field.tagName === 'INPUT' && field.type !== 'checkbox') {
        field.addEventListener('keydown', (event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          field.blur();
        });
      }
      field.addEventListener('blur', () => {
        this.#typing = false;
        if (!this.#renderPending) return;
        this.#renderPending = false;
        // Pequeno atraso: não troca a tela debaixo do clique no botão que veio logo depois
        globalThis.setTimeout(() => this.render(), 250);
      });
    }
  }

  /** Grava um campo (configuração, pontos de um participante ou total do grupo). */
  async #commit(field) {
    this.#typing = false;
    this.#renderPending = false;
    const { campo, actorId } = field.dataset;
    const value = field.type === 'checkbox' ? field.checked : field.value;
    await mutateChallenge(this.#challengeId, (challenge) => {
      if (CONFIG_FIELDS.has(campo)) return updateChallengeField(challenge, campo, value);
      if (campo === 'pontos') return typePoints(challenge, actorId, value);
      if (campo === 'total') return typePoints(challenge, null, value);
      return challenge;
    });
    // Valor inválido não grava nada: redesenhar devolve o campo ao valor guardado
    this.render();
  }

  /** Botões −/+ dos pontos (de um participante ou do total do grupo). */
  static async #onAdjustPoints(event, target) {
    const delta = Number(target.dataset.delta);
    const actorId = target.dataset.actorId ?? null;
    await mutateChallenge(this.#challengeId, (challenge) =>
      adjustPoints(challenge, actorId, delta),
    );
  }

  /** Lista dos personagens que ainda não participam; entram os marcados. */
  static async #onAddParticipants() {
    const challenge = getChallenge(this.#challengeId);
    if (!challenge) return;
    const candidates = addableChallengeActors(
      game.actors
        .filter((actor) => actor.type === 'personagem')
        .map((actor) => ({ id: actor.id, name: actor.name })),
      challenge,
    );
    if (candidates.length === 0) {
      ui.notifications.info(t('DESORDEM.Perseguicao.SemPersonagens'));
      return;
    }
    const content = await renderTemplate(
      `systems/${SYSTEM_ID}/templates/perseguicao/adicionar.hbs`,
      { candidates },
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
    const ids = answer.ids.filter((id) => allowed.has(id));
    await mutateChallenge(this.#challengeId, (current) => addParticipants(current, ids));
  }

  /** Acrescenta os personagens dos tokens selecionados no mapa. */
  static async #onAddSelected() {
    const tokens = globalThis.canvas?.tokens?.controlled ?? [];
    const ids = tokens
      .map((token) => token.actor)
      .filter((actor) => actor?.type === 'personagem')
      .map((actor) => worldActorId(actor))
      .filter((id) => id && game.actors.get(id));
    if (ids.length === 0) {
      ui.notifications.info(t('DESORDEM.Desafio.SemSelecionados'));
      return;
    }
    await mutateChallenge(this.#challengeId, (challenge) => addParticipants(challenge, ids));
  }

  static async #onRemoveParticipant(event, target) {
    const { actorId } = target.dataset;
    if (!actorId) return;
    await mutateChallenge(this.#challengeId, (challenge) => removeParticipant(challenge, actorId));
  }

  /** Encerra (some para os jogadores e das fichas) ou reabre o desafio. */
  static async #onToggleActive() {
    await mutateChallenge(this.#challengeId, (challenge) =>
      updateChallengeField(challenge, 'ativo', !challenge.ativo),
    );
  }

  /** Penalidade: o mestre escolhe o valor, PV ou PD e quais participantes levam a perda. */
  static async #onOpenPenalty() {
    const challenge = getChallenge(this.#challengeId);
    if (!challenge) return;
    const escolhas = challenge.participantes
      .map((entry) => ({ id: entry.actorId, name: actorInfo(entry.actorId)?.name ?? '' }))
      .filter((entry) => entry.name);
    if (escolhas.length === 0) {
      ui.notifications.info(t('DESORDEM.Desafio.Penalidade.SemParticipantes'));
      return;
    }
    await askAndPostPenalty({ cena: 'desafio', escolhas });
  }

  static async #onDeleteChallenge() {
    await confirmDeleteChallenge(this.#challengeId);
  }
}
