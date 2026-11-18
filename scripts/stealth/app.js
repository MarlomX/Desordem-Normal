/**
 * Janela da cena de furtividade (ApplicationV2). É a mesma janela para todos: o mestre vê os
 * botões de administração; cada jogador vê os VALORES só dos próprios dados de esconderijo e a
 * quantidade dos demais. Ela não guarda estado próprio: tudo vem do encontro (store.js) e a
 * janela é redesenhada pelos hooks de hooks.js.
 */
import { SYSTEM_ID } from '../config.js';
import { HIDE_DIE_SIDES } from '../rolls/stealth.js';
import { ProcuraApp } from './search.js';
import {
  addStealthParticipants,
  createStealth,
  currentStealthAccess,
  deleteStealth,
  endStealth,
  findStealth,
  hideRevealed,
  nextStealthRound,
  adjustDistractUses,
  attentionTargets,
  requestAttention,
  removeStealthParticipant,
  requestHideOp,
  resetHide,
  revealHideDice,
  setStealthRound,
  stealthCandidates,
  startStealth,
  stealthView,
} from './store.js';

const { HandlebarsApplicationMixin, ApplicationV2, DialogV2 } = foundry.applications.api;

const t = (key) => game.i18n.localize(key);
const renderTemplate = (path, data) => foundry.applications.handlebars.renderTemplate(path, data);

/** Pergunta sim/não; só `true` confirma (fechar no X não confirma). */
async function confirm(titleKey, textKey, data) {
  const text = data ? game.i18n.format(textKey, data) : t(textKey);
  const answer = await DialogV2.confirm({
    window: { title: t(titleKey) },
    // O texto pode trazer o nome de um personagem: escapa antes de ir para o HTML
    content: `<p>${Handlebars.escapeExpression(text)}</p>`,
    rejectClose: false,
    modal: true,
  });
  return answer === true;
}

export default class FurtividadeApp extends HandlebarsApplicationMixin(ApplicationV2) {
  /** Instância única: abrir de novo só traz a janela existente para a frente. */
  static #instance = null;

  static DEFAULT_OPTIONS = {
    id: 'desordem-furtividade',
    // `perseguicao` reaproveita o layout da janela da perseguição; `furtividade` é o próprio
    classes: ['desordem-normal', 'perseguicao', 'furtividade'],
    position: { width: 440, height: 500 },
    window: {
      title: 'DESORDEM.Furtividade.Titulo',
      icon: 'fa-solid fa-user-secret',
      resizable: true,
    },
    actions: {
      createStealth: FurtividadeApp.#onCreate,
      startStealth: FurtividadeApp.#onStart,
      endStealth: FurtividadeApp.#onEnd,
      deleteStealth: FurtividadeApp.#onDelete,
      addParticipants: FurtividadeApp.#onAddParticipants,
      removeParticipant: FurtividadeApp.#onRemoveParticipant,
      nextRound: FurtividadeApp.#onNextRound,
      adjustRound: FurtividadeApp.#onAdjustRound,
      toggleReveal: FurtividadeApp.#onToggleReveal,
      addHideDie: FurtividadeApp.#onAddHideDie,
      removeHideDie: FurtividadeApp.#onRemoveHideDie,
      resetHide: FurtividadeApp.#onResetHide,
      openSearch: FurtividadeApp.#onOpenSearch,
      adjustDistract: FurtividadeApp.#onAdjustDistract,
      callAttention: FurtividadeApp.#onCallAttention,
    },
  };

  static PARTS = {
    painel: {
      template: `systems/${SYSTEM_ID}/templates/furtividade/painel.hbs`,
      scrollable: [''],
    },
  };

  /** Abre a janela (ou a traz para a frente se já estiver aberta). */
  static async open() {
    FurtividadeApp.#instance ??= new FurtividadeApp();
    const app = FurtividadeApp.#instance;
    await app.render({ force: true });
    app.bringToFront?.();
    return app;
  }

  /** A pessoa está digitando no campo da rodada e ainda não confirmou? */
  #typing = false;

  /** Chegou uma atualização enquanto ela digitava: redesenha quando terminar. */
  #renderPending = false;

  /** Redesenha a janela se estiver aberta, sem apagar o que está sendo digitado. */
  static refresh() {
    const app = FurtividadeApp.#instance;
    if (!app?.rendered) return;
    if (app.#typing) {
      app.#renderPending = true;
      return;
    }
    app.render();
  }

  /**
   * Liga o campo digitável da rodada (só o mestre o vê). Como na perseguição, o valor só é gravado
   * no `change` (Enter ou sair do campo) e a janela espera a pessoa terminar de digitar.
   */
  _onRender(context, options) {
    super._onRender?.(context, options);
    for (const input of this.element.querySelectorAll('input[data-campo]')) {
      input.addEventListener('input', () => {
        this.#typing = true;
      });
      input.addEventListener('change', () => this.#commitField(input));
      input.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        input.blur();
      });
      input.addEventListener('blur', () => {
        this.#typing = false;
        if (!this.#renderPending) return;
        this.#renderPending = false;
        globalThis.setTimeout(() => this.render(), 250);
      });
    }
  }

  /** Grava a rodada digitada; valor inválido não grava e o campo volta ao valor guardado. */
  async #commitField(input) {
    this.#typing = false;
    this.#renderPending = false;
    const stealth = findStealth();
    if (stealth && input.dataset.campo === 'rodada') {
      await setStealthRound(stealth, { raw: input.value });
    }
    this.render();
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const stealth = findStealth();
    const access = currentStealthAccess(stealth);
    return {
      ...context,
      isGM: game.user.isGM,
      access,
      view: stealth && access.canOpen ? stealthView(stealth) : null,
    };
  }

  static async #onCreate() {
    await createStealth();
  }

  static async #onStart() {
    const stealth = findStealth();
    if (stealth) await startStealth(stealth);
  }

  /** Encerrar apaga os dados de esconderijo de todos: pede confirmação. */
  static async #onEnd() {
    const stealth = findStealth();
    if (!stealth) return;
    if (await confirm('DESORDEM.Furtividade.Encerrar', 'DESORDEM.Furtividade.EncerrarConfirmar')) {
      await endStealth(stealth);
    }
  }

  static async #onDelete() {
    const stealth = findStealth();
    if (!stealth) return;
    if (await confirm('DESORDEM.Furtividade.Excluir', 'DESORDEM.Furtividade.ExcluirConfirmar')) {
      await deleteStealth(stealth);
    }
  }

  /**
   * Chamar atenção: escolhe o dado que vai para um aliado, o dado descartado e o aliado. Os
   * valores aparecem só para quem já pode vê-los (o dono, ou o mestre com os dados revelados).
   */
  static async #onCallAttention(event, target) {
    const stealth = findStealth();
    const combatant = stealth?.combatants.get(target.dataset.combatantId);
    if (!combatant) return;
    const view = stealthView(stealth).participantes.find((entry) => entry.id === combatant.id);
    const allies = attentionTargets(stealth, combatant.id);
    if (!view?.podeChamar || allies.length === 0) return;
    const content = await renderTemplate(
      `systems/${SYSTEM_ID}/templates/furtividade/chamar-atencao.hbs`,
      { dados: view.dice, aliados: allies },
    );
    const answer = await DialogV2.wait({
      window: { title: t('DESORDEM.Furtividade.Atencao.Titulo') },
      classes: ['desordem-normal', 'desordem-perseguicao-dialogo'],
      content,
      modal: true,
      rejectClose: false,
      buttons: [
        {
          action: 'call',
          label: t('DESORDEM.Furtividade.Atencao.Confirmar'),
          icon: 'fa-solid fa-bullhorn',
          default: true,
          callback: (evt, button, dialog) => ({
            confirmed: true,
            transfer: dialog.element.querySelector('input[name="passar"]:checked')?.value,
            discard: dialog.element.querySelector('input[name="descartar"]:checked')?.value,
            toId: dialog.element.querySelector('select[name="aliado"]')?.value,
          }),
        },
        { action: 'cancel', label: t('DESORDEM.Teste.Pre.Cancelar') },
      ],
    });
    if (answer?.confirmed !== true) return;
    if (answer.transfer === undefined || answer.discard === undefined) return;
    if (answer.transfer === answer.discard) {
      ui.notifications.warn(t('DESORDEM.Furtividade.Atencao.Mesmo'));
      return;
    }
    // Os dados esperados vão junto: se a lista mudar antes de gravar, nada acontece
    const die = (index) => {
      const found = view.dice.find((entry) => entry.index === Number(index));
      return { index: Number(index), lados: found?.lados, valor: found?.valor };
    };
    await requestAttention({
      fromId: combatant.id,
      toId: answer.toId,
      transfer: die(answer.transfer),
      discard: die(answer.discard),
    });
  }

  /** Contador de distrair da cena, pelos botões −/+ (só o mestre). */
  static async #onAdjustDistract(event, target) {
    await adjustDistractUses(findStealth(), Number(target.dataset.delta));
  }

  /** Abre a janela de procura das criaturas (só o mestre). */
  static async #onOpenSearch() {
    await ProcuraApp.open();
  }

  static async #onNextRound() {
    const stealth = findStealth();
    if (stealth) await nextStealthRound(stealth);
  }

  static async #onAdjustRound(event, target) {
    const stealth = findStealth();
    if (stealth) await setStealthRound(stealth, { delta: Number(target.dataset.delta) });
  }

  static async #onRemoveParticipant(event, target) {
    const stealth = findStealth();
    const id = target.dataset.combatantId;
    if (stealth && id) await removeStealthParticipant(stealth, id);
  }

  /**
   * Olho do mestre: revelar pede confirmação e posta um aviso público no chat; esconder de novo é
   * imediato e não avisa ninguém.
   */
  static async #onToggleReveal(event, target) {
    if (!game.user.isGM) return;
    const stealth = findStealth();
    const combatant = stealth?.combatants.get(target.dataset.combatantId);
    if (!combatant) return;
    if (target.dataset.revealed === 'true') {
      hideRevealed(combatant.id);
      this.render();
      return;
    }
    const ok = await confirm(
      'DESORDEM.Furtividade.Revelar',
      'DESORDEM.Furtividade.RevelarConfirmar',
      {
        nome: combatant.name,
      },
    );
    if (!ok) return;
    await revealHideDice(combatant);
    this.render();
  }

  /**
   * O mestre zera o esconderijo de um participante (ele volta a «sem esconderijo» e pode refazer o
   * teste). Pede confirmação e avisa no chat.
   */
  static async #onResetHide(event, target) {
    if (!game.user.isGM) return;
    const stealth = findStealth();
    const combatant = stealth?.combatants.get(target.dataset.combatantId);
    if (!combatant) return;
    const ok = await confirm('DESORDEM.Furtividade.Zerar', 'DESORDEM.Furtividade.ZerarConfirmar', {
      nome: combatant.name,
    });
    if (ok) await resetHide(combatant);
  }

  /** Acrescenta um dado à mão: pergunta os lados e o valor que saiu. */
  static async #onAddHideDie(event, target) {
    const stealth = findStealth();
    const combatant = stealth?.combatants.get(target.dataset.combatantId);
    if (!combatant) return;
    const content = await renderTemplate(
      `systems/${SYSTEM_ID}/templates/furtividade/adicionar-dado.hbs`,
      { lados: HIDE_DIE_SIDES.map((sides) => ({ value: sides, selected: sides === 6 })) },
    );
    const answer = await DialogV2.wait({
      window: { title: t('DESORDEM.Furtividade.Dados.Adicionar') },
      classes: ['desordem-normal', 'desordem-perseguicao-dialogo'],
      content,
      modal: true,
      rejectClose: false,
      buttons: [
        {
          action: 'add',
          label: t('DESORDEM.Furtividade.Dados.AdicionarBotao'),
          icon: 'fa-solid fa-plus',
          default: true,
          callback: (evt, button, dialog) => ({
            confirmed: true,
            lados: dialog.element.querySelector('select[name="lados"]')?.value,
            valor: dialog.element.querySelector('input[name="valor"]')?.value,
          }),
        },
        { action: 'cancel', label: t('DESORDEM.Teste.Pre.Cancelar') },
      ],
    });
    // Só {confirmed: true} confirma: fechar no X ou cancelar devolve outra coisa
    if (answer?.confirmed !== true) return;
    await requestHideOp(combatant, { type: 'add', lados: answer.lados, valor: answer.valor });
  }

  /** Descarta um dado à mão (pede confirmação: o dado não volta). */
  static async #onRemoveHideDie(event, target) {
    const stealth = findStealth();
    const combatant = stealth?.combatants.get(target.dataset.combatantId);
    if (!combatant) return;
    const ok = await confirm(
      'DESORDEM.Furtividade.Dados.Descartar',
      'DESORDEM.Furtividade.Dados.DescartarConfirmar',
    );
    if (!ok) return;
    await requestHideOp(combatant, { type: 'remove', index: Number(target.dataset.index) });
  }

  /** Abre a lista de personagens que ainda não participam e adiciona os marcados. */
  static async #onAddParticipants() {
    const stealth = findStealth();
    if (!stealth) return;
    const candidates = stealthCandidates(stealth);
    if (candidates.length === 0) {
      ui.notifications.info(t('DESORDEM.Perseguicao.SemPersonagens'));
      return;
    }
    // Reaproveita a lista de marcar personagens da perseguição
    const content = await renderTemplate(
      `systems/${SYSTEM_ID}/templates/perseguicao/adicionar.hbs`,
      { candidates },
    );
    const answer = await DialogV2.wait({
      window: { title: t('DESORDEM.Furtividade.Adicionar') },
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
          callback: (evt, button, dialog) => ({
            confirmed: true,
            ids: [...dialog.element.querySelectorAll('input[name="actor"]:checked')].map(
              (input) => input.value,
            ),
          }),
        },
        { action: 'cancel', label: t('DESORDEM.Teste.Pre.Cancelar') },
      ],
    });
    if (answer?.confirmed !== true) return;
    // Nunca confia no que veio da janela: só entram ids que estavam na lista oferecida
    const allowed = new Set(candidates.map((candidate) => candidate.id));
    const actors = answer.ids
      .filter((id) => allowed.has(id))
      .map((id) => game.actors.get(id))
      .filter(Boolean);
    await addStealthParticipants(stealth, actors);
  }
}
