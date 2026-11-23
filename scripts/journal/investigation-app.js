/**
 * Janela «Investigar» dos pontos de interesse (v0.24.4): atalho do mestre para as ações de
 * investigação.
 * - Investigar/Observar: o jogador diz o dado da perícia; revela as linhas com DT até esse valor.
 * - Examinar: o resultado do teste é o limite; se quem examinou não receber nenhuma informação
 *   nova, sai no chat o cartão «perde 1 PD» (o botão é dele; nada é descontado sozinho).
 *
 * Abre de dois jeitos: pelo 🔍 de um bloco no quadro do mestre (página fixa, modo Investigar) ou
 * pela barra «Usar no ponto de interesse» do cartão de um teste (só o mestre vê a barra; vem em
 * modo Examinar, com o resultado do teste, a perícia e quem rolou já preenchidos).
 *
 * A prévia das linhas sai de `investigationRows` (point.js): marcadas por padrão as que têm DT até
 * o valor e não têm condição; o mestre pode marcar e desmarcar qualquer uma.
 */
import { SYSTEM_ID } from '../config.js';
import { resolveWithValues } from '../rolls/abilities.js';
import { postPenalty } from '../chase/penalty-card.js';
import {
  INVESTIGATION_DICE,
  POINT_TYPE,
  applyReveal,
  examineFindsNothing,
  findGroupKey,
  groupChoices,
  investigationRows,
  normalizeBlocks,
} from './point.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const TEMPLATES = `systems/${SYSTEM_ID}/templates/diario`;

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

/** Jogadores do mundo (usuários que não são mestre). */
const players = () => game.users.filter((user) => !user.isGM);

/**
 * Páginas de ponto de interesse do mundo que o usuário pode editar, na ordem dos diários, com o
 * nome «Diário › Página» para a lista.
 * @returns {{page: JournalEntryPage, label: string}[]}
 */
export function pointPages() {
  return game.journal.contents.flatMap((entry) =>
    entry.pages.contents
      .filter((page) => page.type === POINT_TYPE && page.isOwner)
      .sort((a, b) => a.sort - b.sort)
      .map((page) => ({ page, label: `${entry.name} › ${page.name}` })),
  );
}

/** Blocos gravados de uma página, limpos. */
const blocksOf = (page) => normalizeBlocks(page?._source?.system?.blocos);

/** Jogador por trás de um personagem: quem o tem como personagem, ou um dono que não é mestre. */
function playerOf(actor) {
  if (!actor) return null;
  return (
    players().find((user) => user.character?.id === actor.id) ??
    players().find((user) => actor.testUserPermission(user, 'OWNER')) ??
    null
  );
}

export default class InvestigationApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'desordem-investigar',
    tag: 'form',
    classes: ['desordem-normal', 'desordem-investigar'],
    window: {
      title: 'DESORDEM.Ponto.Investigar.Titulo',
      icon: 'fa-solid fa-magnifying-glass',
      resizable: true,
    },
    position: { width: 560, height: 'auto' },
    form: { handler: InvestigationApp.#onChange, submitOnChange: true, closeOnSubmit: false },
    actions: {
      dado: InvestigationApp.#onDie,
      revelar: InvestigationApp.#onReveal,
      cancelar: InvestigationApp.#onCancel,
    },
  };

  static PARTS = {
    form: { template: `${TEMPLATES}/investigar.hbs`, scrollable: ['.desordem-investigar__linhas'] },
  };

  /** A janela é uma só: abrir de novo troca o que ela mostra. */
  static #instance = null;

  /** Última página usada pela barra do cartão (a próxima vez já vem escolhida). */
  static #lastPageUuid = '';

  /**
   * Estado da janela.
   * - `pageUuid`: página; `fixedPage`: aberta pelo bloco (sem lista de páginas).
   * - `groupKey`: grupo de perícia (veja `groupChoices`); `skillLabel`: perícia do cartão, para
   *   escolher o grupo quando a página muda.
   * - `mode`: 'investigar' ou 'examinar'; `value`: dado ou resultado.
   * - `target`: 'todos' ou 'jogadores' (com `userIds`); `examinerId`: quem examinou.
   * - `overrides`: linhas marcadas ou desmarcadas à mão (id → marcada).
   */
  #state = {};

  /**
   * Abre (ou reaproveita) a janela com este estado.
   * @param {object} state Campos de `#state`; os que faltam recebem o padrão.
   */
  static async open(state) {
    if (!game.user.isGM) return null;
    const app = InvestigationApp.#instance ?? new InvestigationApp();
    InvestigationApp.#instance = app;
    app.#state = {
      pageUuid: '',
      fixedPage: false,
      groupKey: '',
      skillLabel: '',
      mode: 'investigar',
      value: 6,
      target: 'todos',
      userIds: [],
      examinerId: '',
      overrides: {},
      ...state,
    };
    await app.render({ force: true });
    app.bringToFront?.();
    return app;
  }

  /** Aberta pelo 🔍 de um bloco: página fixa, grupo do bloco, modo Investigar. */
  static openForGroup(page, groupKey) {
    return InvestigationApp.open({ pageUuid: page.uuid, fixedPage: true, groupKey });
  }

  /**
   * Aberta pela barra do cartão de um teste: modo Examinar, com o resultado atual do teste (já
   * com Análise e Prontidão), a perícia e quem rolou.
   * @param {ChatMessage} message
   */
  static openFromTest(message) {
    const test = message.flags?.[SYSTEM_ID]?.teste;
    if (!test) return null;
    const pages = pointPages();
    if (!pages.length) {
      ui.notifications.info(t('DESORDEM.Ponto.Investigar.SemPontos'));
      return null;
    }
    const last = pages.find((entry) => entry.page.uuid === InvestigationApp.#lastPageUuid);
    const page = (last ?? pages[0]).page;
    const skillLabel = test.display?.skillLabel ?? '';
    const actor = ChatMessage.getSpeakerActor(message.speaker);
    const author = message.author && !message.author.isGM ? message.author : null;
    const examiner = author ?? playerOf(actor);
    return InvestigationApp.open({
      pageUuid: page.uuid,
      groupKey: findGroupKey(blocksOf(page), skillLabel, t),
      skillLabel,
      mode: 'examinar',
      value: resolveWithValues(test.plan, test.values).total,
      examinerId: examiner?.id ?? '',
    });
  }

  /** Página escolhida (ou `null`, se foi apagada). */
  get #page() {
    return this.#state.pageUuid ? foundry.utils.fromUuidSync(this.#state.pageUuid) : null;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const state = this.#state;
    const page = this.#page;
    const blocks = blocksOf(page);
    const groups = groupChoices(blocks, t);
    // Grupo que não existe mais na página (ou vazio): o primeiro da lista
    if (!groups.some((group) => group.key === state.groupKey)) {
      state.groupKey = groups[0]?.key ?? '';
    }
    const rows = investigationRows(blocks, {
      groupKey: state.groupKey,
      value: state.value,
      t,
      overrides: state.overrides,
    });
    const examine = state.mode === 'examinar';
    return {
      ...context,
      page,
      pageName: page?.name ?? '',
      fixedPage: state.fixedPage,
      pages: state.fixedPage
        ? []
        : pointPages().map((entry) => ({
            uuid: entry.page.uuid,
            label: entry.label,
            selected: entry.page.uuid === state.pageUuid,
          })),
      groups: groups.map((group) => ({ ...group, selected: group.key === state.groupKey })),
      examine,
      investigate: !examine,
      value: state.value,
      dice: INVESTIGATION_DICE.map((sides) => ({ sides, active: Number(state.value) === sides })),
      targetAll: state.target !== 'jogadores',
      targetSome: state.target === 'jogadores',
      players: players().map((user) => ({
        id: user.id,
        name: user.name,
        character: user.character?.name ?? '',
        checked: state.userIds.includes(user.id),
        blind: page ? !page.testUserPermission(user, 'OBSERVER') : false,
        examiner: user.id === state.examinerId,
      })),
      rows,
      marked: rows.filter((row) => row.marcada).length,
    };
  }

  /**
   * Mudança no formulário: guarda o estado e redesenha. Mudar a página, o grupo, o modo ou o valor
   * apaga as marcações feitas à mão (a prévia volta ao padrão).
   */
  static async #onChange(event, form, formData) {
    const data = formData.object;
    const state = this.#state;
    const name = event?.target?.name ?? '';
    if (name.startsWith('linha.')) {
      state.overrides = { ...state.overrides, [name.slice(6)]: data[name] === true };
      return this.render();
    }
    const before = [state.pageUuid, state.groupKey, state.mode, String(state.value)].join('|');
    if (typeof data.pagina === 'string' && data.pagina !== state.pageUuid) {
      state.pageUuid = data.pagina;
      // Página nova: escolhe o grupo pela perícia do cartão (se houver)
      state.groupKey = findGroupKey(blocksOf(this.#page), state.skillLabel, t);
    } else if (typeof data.grupo === 'string') {
      state.groupKey = data.grupo;
    }
    if (data.modo === 'investigar' || data.modo === 'examinar') state.mode = data.modo;
    const value = Number(data.valor);
    if (Number.isFinite(value)) state.value = Math.max(0, Math.min(99, Math.round(value)));
    state.target = data.alvo === 'jogadores' ? 'jogadores' : 'todos';
    state.userIds = players()
      .filter((user) => data[`jogador.${user.id}`] === true)
      .map((user) => user.id);
    if (typeof data.examinador === 'string') state.examinerId = data.examinador;
    const after = [state.pageUuid, state.groupKey, state.mode, String(state.value)].join('|');
    if (before !== after) state.overrides = {};
    return this.render();
  }

  /** Botões d4…d12: o valor do dado vira o limite (Investigar/Observar). */
  static #onDie(event, target) {
    const sides = Number(target.dataset.lados);
    if (!INVESTIGATION_DICE.includes(sides)) return;
    this.#state.value = sides;
    this.#state.overrides = {};
    this.render();
  }

  static #onCancel() {
    this.close();
  }

  /**
   * Revela as linhas marcadas. No Examinar, confere ANTES se quem examinou ganha alguma linha
   * nova; se não ganhar, posta o cartão «perde 1 PD» para o personagem dele.
   */
  static async #onReveal() {
    const state = this.#state;
    const page = this.#page;
    if (!page) {
      ui.notifications.warn(t('DESORDEM.Ponto.Investigar.SemPagina'));
      return;
    }
    const blocks = blocksOf(page);
    const ids = investigationRows(blocks, {
      groupKey: state.groupKey,
      value: state.value,
      t,
      overrides: state.overrides,
    })
      .filter((row) => row.marcada)
      .map((row) => row.lineId);
    const examine = state.mode === 'examinar';
    if (!ids.length && !examine) {
      ui.notifications.warn(t('DESORDEM.Ponto.Investigar.NadaMarcado'));
      return;
    }
    // Para quem: todos, ou só jogadores que existem (nunca confia no que veio do formulário)
    const valid = players().filter((user) => state.userIds.includes(user.id));
    if (state.target === 'jogadores' && !valid.length) {
      ui.notifications.warn(t('DESORDEM.Ponto.Investigar.SemJogadores'));
      return;
    }
    const examiner = examine ? game.users.get(state.examinerId) : null;
    const nothingNew = Boolean(examiner) && examineFindsNothing(blocks, ids, examiner.id);

    if (ids.length) {
      const target =
        state.target === 'jogadores' ? { userIds: valid.map((user) => user.id) } : { all: true };
      await page.update({ 'system.blocos': applyReveal(blocks, ids, target) });
      this.#warnBlind(page, state.target === 'jogadores' ? valid : players());
    }
    if (!state.fixedPage) InvestigationApp.#lastPageUuid = page.uuid;

    if (nothingNew) {
      const actor = examiner.character;
      if (actor) await postPenalty('1', 'pd', { cena: 'investigacao', alvos: [actor] });
      else
        ui.notifications.warn(
          t('DESORDEM.Ponto.Investigar.SemPersonagem', { nome: examiner.name }),
        );
    } else if (examine && !examiner) {
      ui.notifications.info(t('DESORDEM.Ponto.Investigar.SemExaminador'));
    }
    this.close();
  }

  /** Avisa o mestre de quem não vai ver a revelação por falta de permissão na página. */
  #warnBlind(page, users) {
    const blind = users.filter((user) => !page.testUserPermission(user, 'OBSERVER'));
    if (!blind.length) return;
    if (blind.length === users.length && this.#state.target !== 'jogadores') {
      ui.notifications.warn(t('DESORDEM.Ponto.AvisoNinguem'));
      return;
    }
    ui.notifications.warn(
      t('DESORDEM.Ponto.AvisoSemAcesso', { nomes: blind.map((user) => user.name).join(', ') }),
    );
  }

  _onClose(options) {
    if (InvestigationApp.#instance === this) InvestigationApp.#instance = null;
    return super._onClose(options);
  }
}

/**
 * Hook renderChatMessageHTML: no cartão de um teste, o mestre vê a barra «Usar no ponto de
 * interesse» (só se o mundo tiver alguma página de ponto). Os jogadores nunca veem.
 */
export function renderPointBar(message, html) {
  if (!game.user.isGM) return;
  const test = message.flags?.[SYSTEM_ID]?.teste;
  const container = html.querySelector('.message-content');
  if (!test || !container || !pointPages().length) return;
  const doc = html.ownerDocument;
  const bar = doc.createElement('div');
  bar.className = 'desordem-teste__avanco desordem-ponto-barra';
  const button = doc.createElement('button');
  button.type = 'button';
  button.innerHTML = '<i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i> ';
  button.append(doc.createTextNode(t('DESORDEM.Ponto.Investigar.UsarNoPonto')));
  button.addEventListener('click', (event) => {
    event.preventDefault();
    InvestigationApp.openFromTest(message);
  });
  bar.append(button);
  container.append(bar);
}
