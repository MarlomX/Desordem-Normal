/* global fromUuidSync, setTimeout */
/**
 * Ligação ao Foundry das tabelas de lesão e de trauma pendentes: o botão no cartão do teste, a
 * janela com o d20 (e o suspense), o pedido ao mestre quando o usuário não pode editar a mensagem
 * e a aplicação do resultado. As regras do estado pendente estão em `pending-table.js`.
 */
import { SYSTEM_ID } from '../config.js';
import { render } from './chat.js';
import { tableDiceCount, nextTableState, tableView } from './pending-table.js';
import { drawLesion, applyLesionDraw } from './health.js';
import { drawTrauma, applyTraumaDraw } from './mind.js';

const TEMPLATE_JANELA = `systems/${SYSTEM_ID}/templates/dialog/tabela.hbs`;
const SOCKET = `system.${SYSTEM_ID}`;

/** Duração do "sorteio" (números trocando no dado) e do tempo com o resultado à mostra. */
const TUMBLE_MS = 900;
const TUMBLE_STEP_MS = 80;
const SHOW_RESULT_MS = 900;

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

/** Cartões cuja tabela está sendo rolada neste navegador (barra o duplo clique local). */
const busy = new Set();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Estado pendente guardado nas flags do cartão (ou undefined se o cartão não tem tabela). */
const tableData = (message) => message.flags?.[SYSTEM_ID]?.tabela;

/**
 * Personagem do cartão. Usa o UUID guardado (que distingue token sem vínculo do ator-base) e, se
 * ele não resolver, o personagem que falou no chat.
 */
function tableActor(message) {
  let actor = null;
  try {
    const uuid = tableData(message)?.actorUuid;
    actor = uuid ? fromUuidSync(uuid) : null;
  } catch {
    actor = null;
  }
  if (actor?.documentName !== 'Actor') actor = game.actors.get(message.speaker?.actor) ?? null;
  return actor;
}

/** Converte as alterações de estado em caminhos de flag para `message.update`. */
const flagChanges = (patch) =>
  Object.fromEntries(
    Object.entries(patch).map(([key, value]) => [`flags.${SYSTEM_ID}.tabela.${key}`, value]),
  );

/**
 * Muda o estado do cartão. Quem pode editar a mensagem grava direto (a regra decide se é
 * permitido); os demais pedem ao mestre ativo por socket e não recebem resposta.
 * @returns {Promise<boolean>} false se a mudança foi recusada (só no caminho direto).
 */
async function requestTableState(message, request) {
  if (message.canUserModify(game.user, 'update')) {
    const patch = nextTableState(tableData(message), request, Date.now());
    if (!patch) return false;
    await message.update(flagChanges(patch));
    return true;
  }
  game.socket.emit(SOCKET, { action: 'tableState', messageId: message.id, request });
  return true;
}

/**
 * Faz os números do d20 "girarem" e para no resultado já sorteado. É só efeito visual: o valor
 * verdadeiro já foi rolado pelo Foundry antes de chamar esta função.
 */
async function suspense(root, finals) {
  const values = [...root.querySelectorAll('[data-valor]')];
  const dice = [...root.querySelectorAll('[data-dado]')];
  for (const die of dice) die.classList.add('is-rolando');
  const end = Date.now() + TUMBLE_MS;
  while (Date.now() < end) {
    for (const el of values) el.textContent = String(1 + Math.floor(Math.random() * 20));
    await sleep(TUMBLE_STEP_MS);
  }
  values.forEach((el, i) => {
    el.textContent = String(finals[i]);
  });
  for (const die of dice) die.classList.remove('is-rolando');
  await sleep(SHOW_RESULT_MS);
}

/**
 * Abre a janela do d20. Rolar reserva o cartão, sorteia na tabela e mostra o número por um
 * instante antes de fechar; Cancelar (ou fechar a janela antes de rolar) não muda nada.
 * @returns {Promise<{entry: object, rolls: Roll[]}|null>} O sorteio, ou null se nada foi rolado.
 */
async function askAndDraw(message, pending, actor) {
  const count = tableDiceCount(pending);
  const content = await render(TEMPLATE_JANELA, {
    titulo: t(`DESORDEM.Tabela.Titulo.${pending.kind}`),
    dice: Array.from({ length: count }, (_, i) => i),
    aviso: count > 1 ? t('DESORDEM.Tabela.AvisoNaoLetal') : '',
  });

  // Fica numa variável de fora: se a janela for fechada no X durante o suspense, o sorteio já
  // feito não se perde e continua sendo aplicado.
  let drawn = null;
  await foundry.applications.api.DialogV2.wait({
    window: { title: t(`DESORDEM.Tabela.Titulo.${pending.kind}`) },
    classes: ['desordem-normal', 'desordem-tabela'],
    content,
    modal: true,
    rejectClose: false,
    buttons: [
      {
        action: 'roll',
        label: t('DESORDEM.Teste.Pre.Rolar'),
        icon: 'fa-solid fa-dice-d20',
        default: true,
        callback: async (event, button, dialog) => {
          for (const el of dialog.element.querySelectorAll('button')) el.disabled = true;
          if (!(await requestTableState(message, { status: 'rolling' }))) {
            ui.notifications.warn(t('DESORDEM.Tabela.Erro.JaRolada'));
            return { confirmed: false };
          }
          try {
            drawn =
              pending.kind === 'lesion'
                ? await drawLesion([...actor.system.lesoes], pending.nonLethal)
                : await drawTrauma([...actor.system.traumas]);
          } catch (error) {
            await requestTableState(message, { status: 'pending' }); // desfaz a reserva
            throw error;
          }
          await suspense(dialog.element, drawn.shown);
          return { confirmed: true };
        },
      },
      { action: 'cancel', label: t('DESORDEM.Teste.Pre.Cancelar') },
    ],
  });
  return drawn;
}

/** Fluxo completo do botão: janela, sorteio, aplicação à ficha e marca de "tabela rolada". */
async function rollTableFromMessage(message) {
  if (busy.has(message.id)) return;
  busy.add(message.id);
  try {
    const pending = tableData(message);
    const actor = tableActor(message);
    if (!pending || !actor?.isOwner) return;
    const drawn = await askAndDraw(message, pending, actor);
    if (!drawn) return;
    if (pending.kind === 'lesion') await applyLesionDraw(actor, pending, drawn);
    else await applyTraumaDraw(actor, pending, drawn);
    await requestTableState(message, {
      status: 'rolled',
      result: { key: drawn.entry.key, rolls: drawn.rolls.map((roll) => roll.total) },
    });
  } catch (error) {
    console.error(`${SYSTEM_ID} | erro ao rolar a tabela`, error);
    ui.notifications.error(t('DESORDEM.Tabela.Erro.Rolar'));
  } finally {
    busy.delete(message.id);
  }
}

/** Hook renderChatMessageHTML: mostra o botão de rolar a tabela a quem pode, ou a nota de estado. */
export function renderTableCard(message, html) {
  const pending = tableData(message);
  const box = html.querySelector('[data-desordem-tabela]');
  if (!pending || !box) return;
  const button = box.querySelector('button');
  const note = box.querySelector('[data-desordem-tabela-nota]');

  const view = tableView(pending, {
    isOwner: Boolean(tableActor(message)?.isOwner),
    now: Date.now(),
  });
  button.classList.toggle('is-oculta', !view.showButton);
  note.classList.toggle('is-oculta', !view.noteKey);
  note.textContent = view.noteKey ? t(`DESORDEM.Tabela.Nota.${view.noteKey}`) : '';

  if (view.showButton) {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      rollTableFromMessage(message);
    });
  }
}

/**
 * Escuta os pedidos de mudança de estado de quem não pode editar a mensagem. Só o mestre ativo
 * atende, e só se o pedido vier de um dono do personagem do cartão.
 */
export function registerTableSocket() {
  game.socket.on(SOCKET, async (data, userId) => {
    if (data?.action !== 'tableState') return;
    if (game.users.activeGM?.id !== game.user.id) return;
    const message = game.messages.get(data.messageId);
    const current = message && tableData(message);
    if (!current) return;
    const requester = game.users.get(userId);
    const actor = tableActor(message);
    if (!requester || !actor?.testUserPermission(requester, 'OWNER')) return;
    const patch = nextTableState(current, data.request, Date.now());
    if (patch) await message.update(flagChanges(patch));
  });
}
