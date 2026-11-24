/**
 * Tabelas de ações das criaturas (Foundry): onde ficam guardadas e a janela de edição do mestre.
 *
 * As tabelas ficam numa configuração do mundo (`game.settings`, escopo "world", fora do menu de
 * configurações). Só o mestre grava. O sistema não traz linhas prontas: tudo é escrito pelo mestre.
 */
import { SYSTEM_ID } from '../config.js';
import {
  MAX_ROWS,
  MAX_TABLES,
  ROW_SEARCHES,
  ROW_TARGETS,
  SCALED_TIERS,
  newRow,
  newTable,
  normalizeTableDie,
  normalizeTables,
  tableWarnings,
  updateRow,
} from '../rolls/creature-table.js';
import { t } from '../shared/i18n.js';
import { createWorldStore } from '../shared/world-store.js';

const { HandlebarsApplicationMixin, ApplicationV2, DialogV2 } = foundry.applications.api;

/** Nome da configuração do mundo que guarda as tabelas. */
export const TABLES_SETTING = 'tabelasCriaturas';

const store = createWorldStore({
  key: TABLES_SETTING,
  empty: () => ({ tabelas: [] }),
  normalize: normalizeTables,
  name: 'tabelas das criaturas',
  the: 'as tabelas das criaturas',
  // A janela de edição se redesenha antes dos outros (a janela de procura se registra abaixo)
  beforeListeners: () => TabelasApp.refresh(),
});

/** Avisa quando as tabelas mudam (devolve uma função para parar de ouvir). */
export const onTablesChange = (callback) => store.onChange(callback);

/** Registra a configuração (chamado uma vez, no init). */
export const registerCreatureTables = () => store.register();

/** Tabelas guardadas, já limpas. */
export const readTables = () => store.read();

/**
 * Muda as tabelas e grava (só o mestre), pela fila: `change` recebe as tabelas relidas na hora e
 * devolve as novas (as mesmas, ou nada, não grava). Desde a v0.28.3 (antes, cada botão lia,
 * esperava e gravava por conta própria, e um clique logo depois de editar um campo podia apagar
 * a edição).
 */
export const mutateTables = (change) => store.mutate(change);

/** Troca uma tabela da lista pela versão nova (mesmo id). */
function replaceTable(data, table) {
  return { tabelas: data.tabelas.map((entry) => (entry.id === table.id ? table : entry)) };
}

const randomId = () => foundry.utils.randomID();

/** Janela de edição das tabelas (só o mestre, instância única). */
export class TabelasApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static #instance = null;

  static DEFAULT_OPTIONS = {
    id: 'desordem-tabelas-criaturas',
    classes: ['desordem-normal', 'desordem-tabelas'],
    position: { width: 640, height: 600 },
    window: {
      title: 'DESORDEM.Furtividade.Tabela.Titulo',
      icon: 'fa-solid fa-table-list',
      resizable: true,
    },
    actions: {
      newTable: TabelasApp.#onNewTable,
      deleteTable: TabelasApp.#onDeleteTable,
      addRow: TabelasApp.#onAddRow,
      removeRow: TabelasApp.#onRemoveRow,
    },
  };

  static PARTS = {
    corpo: {
      template: `systems/${SYSTEM_ID}/templates/furtividade/tabelas.hbs`,
      scrollable: [''],
    },
  };

  /** Tabela mostrada no editor. */
  #tableId = '';

  /** Proteção da digitação, como nas outras janelas: redesenha só quando a pessoa termina. */
  #typing = false;
  #renderPending = false;

  /** Abre o editor (opcionalmente numa tabela). */
  static async open(tableId) {
    if (!game.user.isGM) return null;
    TabelasApp.#instance ??= new TabelasApp();
    const app = TabelasApp.#instance;
    if (tableId) app.#tableId = tableId;
    await app.render({ force: true });
    app.bringToFront?.();
    return app;
  }

  static refresh() {
    const app = TabelasApp.#instance;
    if (!app?.rendered) return;
    if (app.#typing) {
      app.#renderPending = true;
      return;
    }
    app.render();
  }

  /** Tabela atual (a primeira, se a escolhida não existe mais). */
  #current(data) {
    const table = data.tabelas.find((entry) => entry.id === this.#tableId) ?? data.tabelas[0];
    this.#tableId = table?.id ?? '';
    return table ?? null;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const data = readTables();
    const table = this.#current(data);
    const warnings = table ? tableWarnings(table) : [];
    const warningText = (warning) =>
      t(`DESORDEM.Furtividade.Tabela.Aviso.${warning.kind}`, {
        faixa: table.linhas.find((row) => row.id === warning.rowId)?.faixa ?? '',
        detalhe: warning.detail ?? '',
      });
    return {
      ...context,
      tabelas: data.tabelas.map((entry) => ({
        id: entry.id,
        nome: entry.nome || t('DESORDEM.Furtividade.Tabela.SemNome'),
        selected: entry.id === table?.id,
      })),
      podeCriar: data.tabelas.length < MAX_TABLES,
      tabela: table && {
        ...table,
        podeAdicionar: table.linhas.length < MAX_ROWS,
        linhas: table.linhas.map((row) => ({
          ...row,
          alvos: ROW_TARGETS.map((value) => ({
            value,
            label: t(`DESORDEM.Furtividade.Tabela.Alvo.${value}`),
            selected: value === row.alvo,
          })),
          procuras: ROW_SEARCHES.map((value) => ({
            value,
            label: t(`DESORDEM.Furtividade.Tabela.Procura.${value}`),
            selected: value === row.procura,
          })),
          fixa: row.procura === 'fixa',
          escalonada: row.procura === 'escalonada',
          // Rótulos montados aqui (chaves DESORDEM.Furtividade.Tabela.Escalonada.d12/d10/d8)
          faixas: SCALED_TIERS.map((tier) => ({
            tier,
            value: row.escalonada[tier],
            label: t(`DESORDEM.Furtividade.Tabela.Escalonada.${tier}`),
          })),
          avisos: warnings.filter((warning) => warning.rowId === row.id).map(warningText),
        })),
        avisosGerais: warnings.filter((warning) => warning.rowId === null).map(warningText),
      },
    };
  }

  /** Liga os campos: grava no `change` (Enter ou sair do campo) e no select ao escolher. */
  _onRender(context, options) {
    super._onRender?.(context, options);
    const select = this.element.querySelector('select[data-tabela]');
    select?.addEventListener('change', () => {
      this.#tableId = select.value;
      this.render();
    });
    for (const field of this.element.querySelectorAll('[data-campo]')) {
      field.addEventListener('input', () => {
        this.#typing = true;
      });
      field.addEventListener('change', () => this.#commit(field));
      if (field.tagName === 'INPUT') {
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
        globalThis.setTimeout(() => this.render(), 250);
      });
    }
  }

  /** Grava um campo da tabela (nome, dado ou um campo de linha). */
  async #commit(field) {
    this.#typing = false;
    this.#renderPending = false;
    const { campo, rowId } = field.dataset;
    const value = field.value;
    await mutateTables((data) => {
      const table = this.#current(data);
      if (!table) return data;
      let next = table;
      if (campo === 'nome') next = { ...table, nome: value };
      else if (campo === 'dado') next = { ...table, dado: normalizeTableDie(value) };
      else if (rowId) next = updateRow(table, rowId, campo, value);
      return replaceTable(data, next);
    });
    this.render();
  }

  static async #onNewTable() {
    let created = null;
    await mutateTables((data) => {
      if (data.tabelas.length >= MAX_TABLES) return data;
      created = newTable(randomId(), t('DESORDEM.Furtividade.Tabela.NovaNome'));
      return { tabelas: [...data.tabelas, created] };
    });
    if (!created) return;
    this.#tableId = created.id;
    this.render();
  }

  static async #onDeleteTable() {
    const data = readTables();
    const table = this.#current(data);
    if (!table) return;
    const answer = await DialogV2.confirm({
      window: { title: t('DESORDEM.Furtividade.Tabela.Excluir') },
      content: `<p>${Handlebars.escapeExpression(
        t('DESORDEM.Furtividade.Tabela.ExcluirConfirmar', {
          nome: table.nome || t('DESORDEM.Furtividade.Tabela.SemNome'),
        }),
      )}</p>`,
      rejectClose: false,
      modal: true,
    });
    if (answer !== true) return;
    this.#tableId = '';
    // Relê as tabelas depois da confirmação (o diálogo pode ter ficado aberto um tempo)
    await mutateTables((current) => ({
      tabelas: current.tabelas.filter((entry) => entry.id !== table.id),
    }));
    this.render();
  }

  static async #onAddRow() {
    await mutateTables((data) => {
      const table = this.#current(data);
      if (!table || table.linhas.length >= MAX_ROWS) return data;
      return replaceTable(data, {
        ...table,
        linhas: [...table.linhas, newRow(randomId(), table)],
      });
    });
    this.render();
  }

  static async #onRemoveRow(event, target) {
    const { rowId } = target.dataset;
    await mutateTables((data) => {
      const table = this.#current(data);
      if (!table) return data;
      return replaceTable(data, {
        ...table,
        linhas: table.linhas.filter((row) => row.id !== rowId),
      });
    });
    this.render();
  }
}
