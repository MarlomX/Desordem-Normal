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

const { HandlebarsApplicationMixin, ApplicationV2, DialogV2 } = foundry.applications.api;

/** Nome da configuração do mundo que guarda as tabelas. */
export const TABLES_SETTING = 'tabelasCriaturas';

/** Quem precisa redesenhar quando as tabelas mudam (a janela de procura se registra aqui). */
const listeners = new Set();

/** Avisa quando as tabelas mudam (devolve uma função para parar de ouvir). */
export function onTablesChange(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

/** Registra a configuração (chamado uma vez, no init). */
export function registerCreatureTables() {
  game.settings.register(SYSTEM_ID, TABLES_SETTING, {
    scope: 'world',
    config: false,
    type: Object,
    default: { tabelas: [] },
    onChange: () => {
      TabelasApp.refresh();
      for (const callback of listeners) callback();
    },
  });
}

/** Tabelas guardadas, já limpas. */
export function readTables() {
  try {
    return normalizeTables(game.settings.get(SYSTEM_ID, TABLES_SETTING));
  } catch (error) {
    console.warn(`${SYSTEM_ID} | tabelas das criaturas ilegíveis`, error);
    return { tabelas: [] };
  }
}

/** Grava as tabelas (só o mestre). */
export async function saveTables(data) {
  if (!game.user.isGM) return;
  await game.settings.set(SYSTEM_ID, TABLES_SETTING, normalizeTables(data));
}

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
    const data = readTables();
    const table = this.#current(data);
    if (!table) return;
    const { campo, rowId } = field.dataset;
    let next = table;
    if (campo === 'nome') next = { ...table, nome: field.value };
    else if (campo === 'dado') next = { ...table, dado: normalizeTableDie(field.value) };
    else if (rowId) next = updateRow(table, rowId, campo, field.value);
    await saveTables(replaceTable(data, next));
    this.render();
  }

  static async #onNewTable() {
    const data = readTables();
    if (data.tabelas.length >= MAX_TABLES) return;
    const table = newTable(randomId(), t('DESORDEM.Furtividade.Tabela.NovaNome'));
    this.#tableId = table.id;
    await saveTables({ tabelas: [...data.tabelas, table] });
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
    await saveTables({ tabelas: data.tabelas.filter((entry) => entry.id !== table.id) });
    this.render();
  }

  static async #onAddRow() {
    const data = readTables();
    const table = this.#current(data);
    if (!table || table.linhas.length >= MAX_ROWS) return;
    const next = { ...table, linhas: [...table.linhas, newRow(randomId(), table)] };
    await saveTables(replaceTable(data, next));
    this.render();
  }

  static async #onRemoveRow(event, target) {
    const data = readTables();
    const table = this.#current(data);
    if (!table) return;
    const next = {
      ...table,
      linhas: table.linhas.filter((row) => row.id !== target.dataset.rowId),
    };
    await saveTables(replaceTable(data, next));
    this.render();
  }
}
