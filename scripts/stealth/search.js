/**
 * Procura das criaturas (Foundry): janela do mestre, cartão público no chat e descarte dos dados.
 *
 * - A janela (só do mestre) lê o campo de dados/valores e o alvo (todos os escondidos, um
 *   sorteado ou um escolhido). «Procurar» rola os dados em público e posta o cartão.
 * - O cartão (flag `procura`) lista os alvos. O dono de cada um tem o botão «Conferir meus dados»
 *   e o mestre, «Resolver pendentes». Quem descarta é sempre o mestre (o jogador manda só ids),
 *   a partir dos dados guardados no participante; o cartão mostra só quantidades.
 * - «Sortear alvo» serve aos eventos sem procura: só sorteia um escondido e avisa no chat.
 */
import { SYSTEM_ID } from '../config.js';
import {
  applySearchToDice,
  cleanHideDice,
  createSearchFlag,
  parseSearchInput,
  pendingSearchTargets,
  pickSearchTargets,
  resolveSearchTarget,
  searchCandidates,
  searchFormula,
  searchResultKind,
  searchValues,
} from '../rolls/stealth.js';
import { SOCKET, findStealth, postStealthNotice, stealthView } from './store.js';

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

/** Ação de socket dos botões do cartão da procura. */
export const SEARCH_SOCKET_ACTION = 'stealthSearch';

const FLAG = `flags.${SYSTEM_ID}.procura`;

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const renderTemplate = (path, data) => foundry.applications.handlebars.renderTemplate(path, data);

/** Escondidos da cena agora ({id, name}), na ordem da lista de participantes. */
function currentCandidates(stealth) {
  if (!stealth?.system.ativa) return [];
  return searchCandidates(stealthView(stealth).participantes).map(({ id, name }) => ({ id, name }));
}

/** Valores que saíram numa rolagem do Foundry, com os lados de cada dado. */
function rolledValues(roll) {
  return (roll?.dice ?? []).flatMap((term) =>
    (term.results ?? [])
      .filter((result) => result.active !== false)
      .map((result) => ({ lados: term.faces, valor: result.result })),
  );
}

/**
 * Rola (se houver dados), monta o cartão e posta em público. Devolve `false` se o campo ou o alvo
 * não valem (a janela avisa).
 * @param {{text: string, mode: string, chosenId: string}} state Escolhas da janela.
 */
export async function postSearch(state) {
  const stealth = findStealth();
  if (!game.user.isGM || !stealth?.system.ativa) return false;
  const parsed = parseSearchInput(state.text);
  if (!parsed.valid) {
    ui.notifications.warn(t(`DESORDEM.Furtividade.Procura.Erro.${parsed.reason}`));
    return false;
  }
  const targets = pickSearchTargets(currentCandidates(stealth), state);
  if (targets.length === 0) {
    ui.notifications.warn(t('DESORDEM.Furtividade.Procura.Erro.semAlvo'));
    return false;
  }

  // Dados rolados pelo motor do Foundry: vão anexados ao cartão (animação e som para todos)
  const formula = searchFormula(parsed.dice);
  const roll = formula ? await new Roll(formula).evaluate() : null;
  const values = searchValues(rolledValues(roll), parsed.values);
  const flag = createSearchFlag({ values, targets });
  const content = await renderTemplate(`systems/${SYSTEM_ID}/templates/chat/procura.hbs`, {
    valores: flag.valores,
    entrada: parsed.dice.length ? formula : '',
  });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker(),
    content,
    rolls: roll ? [roll] : [],
    sound: roll ? CONFIG.sounds.dice : undefined,
    flags: { [SYSTEM_ID]: { procura: flag } },
  });
  return true;
}

/** Sorteia um escondido e avisa no chat (eventos que afetam um único personagem, sem procura). */
export async function drawEventTarget() {
  const stealth = findStealth();
  if (!game.user.isGM || !stealth?.system.ativa) return;
  const [target] = pickSearchTargets(currentCandidates(stealth), { mode: 'sorteado' });
  if (!target) {
    ui.notifications.warn(t('DESORDEM.Furtividade.Procura.Erro.semAlvo'));
    return;
  }
  await postStealthNotice({
    titulo: t('DESORDEM.Furtividade.Chat.Titulo'),
    texto: t('DESORDEM.Furtividade.Procura.Sorteado', { nome: target.name }),
  });
}

/**
 * Fila do mestre: pedidos que chegam juntos (vários jogadores clicando) são gravados um de cada
 * vez, para um não apagar o resultado do outro no mesmo cartão.
 */
let queue = Promise.resolve();
function enqueue(task) {
  const next = queue.then(task, task);
  queue = next.catch((error) => console.error(`${SYSTEM_ID} | falha na procura`, error));
  return next;
}

/**
 * Resolve alvos do cartão (só no cliente do mestre). Cada alvo pendente é conferido: quem pediu
 * precisa ser dono do personagem (ou o mestre); os dados vêm do participante, nunca do pedido.
 * @param {ChatMessage} message
 * @param {string[]} ids Alvos a resolver.
 * @param {string} userId Quem pediu.
 */
export function applySearch(message, ids, userId) {
  return enqueue(async () => {
    let flag = message?.flags?.[SYSTEM_ID]?.procura;
    const requester = game.users.get(userId);
    if (!flag || !requester) return;
    const stealth = findStealth();
    const wanted = new Set(pendingSearchTargets(flag));
    const values = flag.valores.map((value) => value.valor);
    let changed = false;
    for (const id of ids) {
      if (!wanted.has(id)) continue;
      const combatant = stealth?.combatants.get(id);
      if (combatant?.actor && !combatant.actor.testUserPermission(requester, 'OWNER')) continue;
      const dice = cleanHideDice(combatant?.system.esconderijo);
      // Fora da cena, sem dados ou cena encerrada: o alvo é marcado como ignorado
      if (!stealth?.system.ativa || !combatant || dice.length === 0) {
        flag = resolveSearchTarget(flag, id, { perdeu: 0, restam: 0, resultado: 'ignorado' });
        changed = true;
        continue;
      }
      const { list, lost } = applySearchToDice(dice, values);
      if (lost > 0) await combatant.update({ system: { esconderijo: list } });
      flag = resolveSearchTarget(flag, id, {
        perdeu: lost,
        restam: list.length,
        resultado: searchResultKind(lost, list.length),
      });
      changed = true;
    }
    if (changed) await message.update({ [FLAG]: flag });
  });
}

/** O mestre resolve direto; o jogador pede ao mestre ativo pelo socket. */
function requestApply(message, ids) {
  if (game.user.isGM) return applySearch(message, ids, game.user.id);
  if (!game.users.activeGM) {
    ui.notifications.warn(t('DESORDEM.Furtividade.Erro.SemMestre'));
    return undefined;
  }
  return game.socket.emit(SOCKET, {
    action: SEARCH_SOCKET_ACTION,
    messageId: message.id,
    combatantIds: ids.slice(0, 50),
  });
}

/** Socket (só no mestre ativo): atende «Conferir meus dados». */
export async function handleSearchSocket(data, userId) {
  const ids = Array.isArray(data?.combatantIds) ? data.combatantIds.map(String) : [];
  await applySearch(game.messages.get(data?.messageId), ids, userId);
}

/** Texto do resultado de um alvo já resolvido (só quantidades). */
function resultText(target) {
  const key = target.resultado ?? 'nada';
  return t(`DESORDEM.Furtividade.Procura.Resultado.${key}`, {
    nome: target.nome,
    n: target.perdeu ?? 0,
    restam: target.restam ?? 0,
  });
}

/** Hook renderChatMessageHTML: um resultado (ou botão) por alvo, e «Resolver pendentes». */
export function renderSearchBar(message, html) {
  const flag = message.flags?.[SYSTEM_ID]?.procura;
  const container = html.querySelector('.message-content');
  if (!flag || !container) return;

  const doc = html.ownerDocument;
  const stealth = findStealth();
  const bar = doc.createElement('div');
  bar.className = 'desordem-procura-barra';
  const list = doc.createElement('ul');
  list.className = 'desordem-procura-barra__alvos';

  for (const target of flag.alvos ?? []) {
    const item = doc.createElement('li');
    item.className = `desordem-procura-barra__alvo is-${target.resultado ?? 'pendente'}`;
    if (target.estado === 'aplicado') {
      item.textContent = resultText(target);
    } else {
      const name = doc.createElement('span');
      name.textContent = t('DESORDEM.Furtividade.Procura.Pendente', { nome: target.nome });
      item.append(name);
      // O dono (jogador) confere os próprios dados; o mestre usa «Resolver pendentes»
      const combatant = stealth?.combatants.get(target.combatantId);
      if (!game.user.isGM && combatant?.actor?.isOwner) {
        const button = doc.createElement('button');
        button.type = 'button';
        button.textContent = t('DESORDEM.Furtividade.Procura.Conferir');
        button.addEventListener('click', async (event) => {
          event.preventDefault();
          button.disabled = true;
          try {
            await requestApply(message, [target.combatantId]);
          } finally {
            globalThis.setTimeout(() => {
              button.disabled = false;
            }, 5000);
          }
        });
        item.append(button);
      }
    }
    list.append(item);
  }
  bar.append(list);

  const pending = pendingSearchTargets(flag);
  if (game.user.isGM && pending.length) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.textContent = t('DESORDEM.Furtividade.Procura.Resolver', { n: pending.length });
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      button.disabled = true;
      await requestApply(message, pending);
    });
    bar.append(button);
  }
  container.append(bar);
}

/** Janela de procura do mestre (instância única). As escolhas ficam na janela entre os usos. */
export class ProcuraApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static #instance = null;

  static DEFAULT_OPTIONS = {
    id: 'desordem-procura',
    classes: ['desordem-normal', 'desordem-procura'],
    position: { width: 380, height: 'auto' },
    window: {
      title: 'DESORDEM.Furtividade.Procura.Titulo',
      icon: 'fa-solid fa-eye',
      resizable: true,
    },
    actions: {
      search: ProcuraApp.#onSearch,
      drawTarget: ProcuraApp.#onDrawTarget,
    },
  };

  static PARTS = {
    form: { template: `systems/${SYSTEM_ID}/templates/furtividade/procura.hbs` },
  };

  /** Escolhas atuais (o texto do campo, o modo do alvo e o alvo escolhido). */
  #state = { text: '', mode: 'todos', chosenId: '' };

  static async open() {
    if (!game.user.isGM) return null;
    ProcuraApp.#instance ??= new ProcuraApp();
    const app = ProcuraApp.#instance;
    await app.render({ force: true });
    app.bringToFront?.();
    return app;
  }

  /** Redesenha se estiver aberta (a lista de escondidos mudou). O texto digitado é mantido. */
  static refresh() {
    const app = ProcuraApp.#instance;
    if (app?.rendered) app.render();
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const candidates = currentCandidates(findStealth());
    // O alvo escolhido saiu da lista (foi encontrado, por exemplo): passa para o primeiro
    if (!candidates.some((candidate) => candidate.id === this.#state.chosenId)) {
      this.#state.chosenId = candidates[0]?.id ?? '';
    }
    return {
      ...context,
      state: this.#state,
      candidates: candidates.map((candidate) => ({
        ...candidate,
        selected: candidate.id === this.#state.chosenId,
      })),
      hasCandidates: candidates.length > 0,
      modes: ['todos', 'sorteado', 'escolhido'].map((mode) => ({
        value: mode,
        label: t(`DESORDEM.Furtividade.Procura.Modo.${mode}`),
        selected: mode === this.#state.mode,
      })),
      escolhido: this.#state.mode === 'escolhido',
    };
  }

  /** Guarda as escolhas a cada mudança (assim um redesenho não apaga o que foi digitado). */
  _onRender(context, options) {
    super._onRender?.(context, options);
    const text = this.element.querySelector('input[name="busca"]');
    const mode = this.element.querySelector('select[name="modo"]');
    const chosen = this.element.querySelector('select[name="alvo"]');
    text?.addEventListener('input', () => {
      this.#state.text = text.value;
    });
    text?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      this.element.querySelector('[data-action="search"]')?.click();
    });
    mode?.addEventListener('change', () => {
      this.#state.mode = mode.value;
      this.render();
    });
    chosen?.addEventListener('change', () => {
      this.#state.chosenId = chosen.value;
    });
  }

  static async #onSearch(event, target) {
    target.disabled = true;
    try {
      await postSearch(this.#state);
    } finally {
      target.disabled = false;
    }
  }

  static async #onDrawTarget() {
    await drawEventTarget();
  }
}
