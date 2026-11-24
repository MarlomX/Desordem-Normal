/**
 * Foundry de mentira para os testes em Node (v0.28.2). Importe este arquivo ANTES dos módulos de
 * `scripts/` que usam o Foundry: ele cria os globais (`game`, `ui`, `foundry`, `Hooks`...) que
 * esses módulos leem ao carregar (classes de janela, campos de modelo) e ao rodar.
 *
 * Não imita o Foundry inteiro: só o que os adaptadores usam, com registro do que aconteceu
 * (avisos, mensagens do socket, gravações) para os testes conferirem.
 */

/** Campo de modelo de dados: só guarda os argumentos (os testes não validam dados por aqui). */
class StubField {
  constructor(...args) {
    this.args = args;
  }
}

/** Qualquer `foundry.data.fields.X` é um StubField. */
const fields = new Proxy({}, { get: () => StubField });

class ApplicationV2 {
  static DEFAULT_OPTIONS = {};
  constructor(options = {}) {
    this.options = options;
    this.rendered = false;
  }
  async _prepareContext() {
    return {};
  }
  render() {
    this.rendered = true;
    return this;
  }
}

/** Diálogos: `confirm`, `prompt` e `wait` devolvem a resposta que o teste deixar em `answer`. */
class DialogV2 extends ApplicationV2 {
  static answer = null;
  static calls = [];
  static async confirm(config) {
    DialogV2.calls.push(['confirm', config]);
    return DialogV2.answer;
  }
  static async prompt(config) {
    DialogV2.calls.push(['prompt', config]);
    return DialogV2.answer;
  }
  static async wait(config) {
    DialogV2.calls.push(['wait', config]);
    return DialogV2.answer;
  }
}

const HandlebarsApplicationMixin = (Base) => class extends Base {};

/** Registro de tudo que os módulos fizeram (zerado por `resetFoundry`). */
export const log = {
  warnings: [],
  infos: [],
  errors: [],
  emitted: [],
  hooks: [],
};

/** Ouvintes do socket do sistema, na ordem em que foram registrados. */
export const socketListeners = [];

/** Usuário do Foundry de mentira. */
export function makeUser(id, { isGM = false, role = isGM ? 4 : 1 } = {}) {
  return { id, name: id, isGM, role, active: true };
}

/** Coleção com `get`, `find`, `filter`, `map`, `contents` (como as do Foundry). */
export function collection(items = []) {
  const list = [...items];
  return {
    get: (id) => list.find((item) => item.id === id),
    find: (fn) => list.find(fn),
    filter: (fn) => list.filter(fn),
    map: (fn) => list.map(fn),
    some: (fn) => list.some(fn),
    contents: list,
    get size() {
      return list.length;
    },
    [Symbol.iterator]: () => list[Symbol.iterator](),
    add: (item) => list.push(item),
  };
}

/** Chave de idioma devolvida como está (com os dados entre colchetes, para conferir). */
const i18n = {
  localize: (key) => key,
  format: (key, data) => `${key}${data ? JSON.stringify(data) : ''}`,
};

/**
 * Volta o Foundry ao estado inicial. `user` é quem está usando o navegador; `activeGM` é o mestre
 * ativo (ou `null`, sem mestre conectado).
 */
export function resetFoundry({ user = makeUser('gm', { isGM: true }), activeGM = user } = {}) {
  // Os ouvintes do socket ficam: os módulos os registram uma vez só (como no `ready`)
  for (const list of Object.values(log)) list.length = 0;
  DialogV2.answer = null;
  DialogV2.calls.length = 0;
  const users = [user, ...(activeGM && activeGM !== user ? [activeGM] : [])];
  globalThis.game = {
    user,
    users: Object.assign(collection(users), { activeGM }),
    i18n,
    socket: {
      on: (name, fn) => socketListeners.push({ name, fn }),
      emit: (name, data) => log.emitted.push({ name, data }),
    },
    messages: collection(),
    modules: collection(),
    actors: collection(),
    combats: collection(),
    journal: collection(),
    settings: {
      values: new Map(),
      configs: new Map(),
      /** Guarda a configuração (o padrão e o `onChange`), como o Foundry. */
      register(scope, key, config) {
        this.configs.set(`${scope}.${key}`, config);
      },
      get(scope, key) {
        const id = `${scope}.${key}`;
        return this.values.has(id) ? this.values.get(id) : this.configs.get(id)?.default;
      },
      /** Grava e chama o `onChange` (o Foundry chama em todos os clientes). */
      async set(scope, key, value) {
        const id = `${scope}.${key}`;
        this.values.set(id, structuredClone(value));
        await new Promise((resolve) => setTimeout(resolve, 1));
        this.configs.get(id)?.onChange?.(value);
        return value;
      },
    },
  };
}

/**
 * Entrega uma mensagem do socket a todos os ouvintes, como o Foundry faz quando outro navegador
 * chama `game.socket.emit`. `userId` é quem mandou.
 */
export async function deliver(data, userId = 'player') {
  for (const { name, fn } of [...socketListeners]) {
    if (name === 'system.desordem-normal') await fn(data, userId);
  }
}

/** Mensagem do chat de mentira: guarda as gravações em `updates`. */
export function makeMessage(id, flags = {}, { canModify = false } = {}) {
  const message = {
    id,
    flags,
    updates: [],
    isContentVisible: true,
    canUserModify: () => canModify,
    async update(changes) {
      message.updates.push(changes);
      return message;
    },
  };
  return message;
}

globalThis.foundry = {
  abstract: { TypeDataModel: class {}, DataModel: class {} },
  data: { fields },
  applications: {
    api: { ApplicationV2, DialogV2, HandlebarsApplicationMixin },
    sheets: {
      ActorSheetV2: class extends ApplicationV2 {},
      ItemSheetV2: class extends ApplicationV2 {},
      journal: {
        JournalEntryPageHandlebarsSheet: class extends ApplicationV2 {
          static EDIT_PARTS = { header: {}, footer: {} };
          static VIEW_PARTS = { content: {} };
        },
      },
    },
    handlebars: {
      renderTemplate: async (path, data) => `<template ${path}>${JSON.stringify(data ?? {})}`,
      loadTemplates: async () => [],
    },
    ux: { TextEditor: { implementation: { enrichHTML: async (html) => html } } },
    apps: { DocumentSheetConfig: { registerSheet() {} } },
    instances: new Map(),
  },
  documents: { collections: { Actors: {}, Items: {} } },
  utils: {
    randomID: () => Math.random().toString(36).slice(2, 18),
    deepClone: (value) => structuredClone(value),
    mergeObject: (a, b) => ({ ...a, ...b }),
  },
};

globalThis.ui = {
  notifications: {
    warn: (text) => log.warnings.push(text),
    info: (text) => log.infos.push(text),
    error: (text) => log.errors.push(text),
  },
};

globalThis.Hooks = {
  on: (name, fn) => log.hooks.push({ name, fn, once: false }),
  once: (name, fn) => log.hooks.push({ name, fn, once: true }),
  callAll: () => true,
  call: () => true,
};

/** Roda os ganchos registrados com esse nome (por exemplo, 'ready'). */
export async function runHook(name, ...args) {
  for (const hook of log.hooks.filter((entry) => entry.name === name)) await hook.fn(...args);
}

globalThis.CONFIG = { sounds: { dice: '' }, Actor: {}, Item: {}, Combat: {}, Combatant: {} };
globalThis.Handlebars = {
  escapeExpression: (text) =>
    String(text ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' })[c],
    ),
  SafeString: class {
    constructor(text) {
      this.text = text;
    }
  },
  registerHelper() {},
};
globalThis.ChatMessage = {
  getSpeaker: () => ({}),
  applyRollMode: () => {},
  create: async (data) => data,
};
globalThis.Roll = class {};

resetFoundry();
