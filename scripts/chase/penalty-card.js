/**
 * Penalidade da perseguição: o mestre escolhe um valor (fixo ou fórmula de dado) e PV ou PD, o
 * sistema posta uma mensagem no chat e cada jogador que fracassou aperta o botão do cartão para
 * levar a perda. Nada é descontado sozinho: o botão é de uso único por participante.
 *
 * Quem grava é sempre o mestre ativo: o jogador pede por socket (só com o id da mensagem e o id do
 * participante), e o mestre confere que o pedido vem de um dono do personagem, reserva o clique
 * (contra o duplo clique), marca na mensagem quem já aplicou e só então desconta. Se o recurso
 * chegar a 0, o cartão avisa; o teste de lesão ou de trauma é do jogador.
 */
import { SYSTEM_ID } from '../config.js';
import {
  applyPenaltyTo,
  createPenaltyFlag,
  parsePenaltyValue,
  penaltyAllows,
  penaltyBarView,
  penaltyScene,
} from '../rolls/chase.js';
import { postMessage, render } from '../rolls/chat.js';
import { findStealth } from '../stealth/store.js';
import { SOCKET, findChase } from './store.js';

const { DialogV2 } = foundry.applications.api;

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

const FLAG = `flags.${SYSTEM_ID}.penalidade`;

const typeLabel = (tipo) => t(`DESORDEM.Perseguicao.Penalidade.${tipo === 'pd' ? 'PD' : 'PV'}`);

/** Cliques que o mestre está processando agora (barra o duplo clique de um mesmo participante). */
const inFlight = new Set();

/** Encontro (perseguição ou furtividade) da penalidade. */
const sceneOf = (flag) => (penaltyScene(flag) === 'furtividade' ? findStealth() : findChase());

/**
 * Textos de cada cena. Na furtividade a penalidade é a consequência de estar encontrado.
 * (Chaves montadas aqui: conferidas à mão, o teste dos templates não as vê.)
 */
const TEXTS = {
  perseguicao: {
    titulo: 'DESORDEM.Perseguicao.Penalidade.Titulo',
    cartao: 'DESORDEM.Perseguicao.Penalidade.TituloCartao',
    fixa: 'DESORDEM.Perseguicao.Penalidade.Fixa',
    rolada: 'DESORDEM.Perseguicao.Penalidade.Rolada',
    dica: 'DESORDEM.Perseguicao.Penalidade.Dica',
  },
  furtividade: {
    titulo: 'DESORDEM.Furtividade.Consequencia.Titulo',
    cartao: 'DESORDEM.Furtividade.Consequencia.TituloCartao',
    fixa: 'DESORDEM.Furtividade.Consequencia.Fixa',
    rolada: 'DESORDEM.Furtividade.Consequencia.Rolada',
    dica: 'DESORDEM.Furtividade.Consequencia.Dica',
  },
};

/**
 * Janela do mestre: pergunta o valor e o tipo e posta a penalidade no chat.
 * @param {{cena?: 'perseguicao'|'furtividade', alvos?: {id: string, name: string}[]}} [options]
 *   Na furtividade, `alvos` são os encontrados agora: só eles recebem o botão.
 */
export async function askAndPostPenalty({ cena = 'perseguicao', alvos } = {}) {
  if (!game.user.isGM) return;
  const texts = TEXTS[cena] ?? TEXTS.perseguicao;
  const content = await render(`systems/${SYSTEM_ID}/templates/perseguicao/penalidade.hbs`, {
    dica: t(texts.dica),
    alvos: alvos?.map((alvo) => alvo.name).join(', ') ?? '',
  });
  const answer = await DialogV2.wait({
    window: { title: t(texts.titulo) },
    classes: ['desordem-normal', 'desordem-perseguicao-dialogo'],
    content,
    modal: true,
    rejectClose: false,
    buttons: [
      {
        action: 'post',
        label: t('DESORDEM.Perseguicao.Penalidade.Postar'),
        icon: 'fa-solid fa-skull',
        default: true,
        callback: (event, button, dialog) => ({
          confirmed: true,
          valor: dialog.element.querySelector('[name="valor"]')?.value ?? '',
          // Dois botões que se excluem (PV ou PD): vale o marcado
          tipo: dialog.element.querySelector('[name="tipo"]:checked')?.value ?? 'pv',
        }),
      },
      { action: 'cancel', label: t('DESORDEM.Teste.Pre.Cancelar') },
    ],
  });
  // Só {confirmed: true} confirma: fechar no X ou cancelar devolve outra coisa.
  if (answer?.confirmed !== true) return;
  await postPenalty(answer.valor, answer.tipo, { cena, alvos });
}

/** Rola (se for fórmula) uma única vez e posta a mensagem da penalidade. */
async function postPenalty(raw, tipo, { cena = 'perseguicao', alvos } = {}) {
  const texts = TEXTS[cena] ?? TEXTS.perseguicao;
  const parsed = parsePenaltyValue(raw);
  if (!parsed.valid) {
    ui.notifications.warn(t('DESORDEM.Perseguicao.Penalidade.ValorInvalido'));
    return;
  }
  const type = tipo === 'pd' ? 'pd' : 'pv';
  let value = parsed.fixed;
  let formula = '';
  const rolls = [];
  if (parsed.kind === 'dice') {
    const roll = await new Roll(parsed.formula).evaluate();
    value = Math.max(1, roll.total);
    formula = parsed.formula;
    rolls.push(roll);
  }
  const text = formula
    ? t(texts.rolada, { valor: value, tipo: typeLabel(type), formula })
    : t(texts.fixa, { valor: value, tipo: typeLabel(type) });
  await postMessage({
    actor: null,
    rolls,
    content: await render(`systems/${SYSTEM_ID}/templates/chat/avanco.hbs`, {
      titulo: t(texts.cartao),
      esforco: text,
      aviso: '',
    }),
    flags: {
      penalidade: createPenaltyFlag({
        tipo: type,
        valor: value,
        formula,
        cena,
        alvos: alvos?.map((alvo) => alvo.id),
      }),
    },
  });
}

/** Desconta a penalidade de um participante (executado pelo mestre ativo). */
export async function applyPenalty(message, combatantId, userId) {
  const flag = message?.flags?.[SYSTEM_ID]?.penalidade;
  if (!flag || !penaltyAllows(flag, combatantId)) return;
  const combatant = sceneOf(flag)?.combatants.get(combatantId);
  const requester = game.users.get(userId);
  if (!combatant?.actor || !requester) return;
  // Nunca confia no pedido: só um dono do personagem (ou o mestre) aplica a penalidade dele.
  if (!combatant.actor.testUserPermission(requester, 'OWNER')) return;

  const key = `${message.id}:${combatantId}`;
  if (inFlight.has(key)) return;
  inFlight.add(key);
  try {
    const actor = combatant.actor;
    // Usa o PV (ou PD) de agora, que pode ter mudado desde a mensagem
    const result = applyPenaltyTo(flag, combatantId, actor.system[flag.tipo].value);
    if (!result) return;
    // Marca primeiro na mensagem (evita descontar duas vezes); se o desconto falhar, desfaz a marca
    await message.update({ [FLAG]: result.flag });
    try {
      await actor.update({ [`system.${flag.tipo}.value`]: result.next });
    } catch (error) {
      console.error(`${SYSTEM_ID} | falha ao descontar a penalidade`, error);
      await message.update({ [FLAG]: flag });
    }
  } finally {
    inFlight.delete(key);
  }
}

/** O mestre aplica direto; o jogador pede ao mestre ativo por socket. */
function requestApply(message, combatantId) {
  if (game.user.isGM) return applyPenalty(message, combatantId, game.user.id);
  if (!game.users.activeGM) {
    ui.notifications.warn(t('DESORDEM.Perseguicao.Erro.SemMestre'));
    return undefined;
  }
  return game.socket.emit(SOCKET, { action: 'chasePenalty', messageId: message.id, combatantId });
}

/** Participantes da cena da penalidade que a pessoa controla (o mestre controla todos). */
function myRows(flag) {
  const scene = sceneOf(flag);
  if (!scene) return [];
  return scene.combatants
    .filter((combatant) => combatant.actor?.isOwner)
    .map((combatant) => ({ combatantId: combatant.id, name: combatant.name }));
}

/** Hook renderChatMessageHTML: mostra a penalidade e um botão por participante da pessoa. */
export function renderPenaltyBar(message, html) {
  const flag = message.flags?.[SYSTEM_ID]?.penalidade;
  const container = html.querySelector('.message-content');
  if (!flag || !container) return;

  const view = penaltyBarView(flag, myRows(flag));
  const doc = html.ownerDocument;
  const tipo = typeLabel(view.tipo);
  for (const row of view.rows) {
    const bar = doc.createElement('div');
    bar.className = 'desordem-teste__avanco';
    const text = doc.createElement('span');
    text.className = 'desordem-teste__avanco-texto';
    if (row.applied) {
      text.textContent = t('DESORDEM.Perseguicao.Penalidade.Aplicado', {
        nome: row.name,
        perda: row.appliedLoss,
        tipo,
      });
      if (row.reachedZero) {
        text.textContent += ` ${t(`DESORDEM.Perseguicao.Penalidade.Zero${view.tipo === 'pd' ? 'PD' : 'PV'}`)}`;
      }
    } else {
      text.textContent = row.name;
    }
    bar.append(text);

    if (row.showButton) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.textContent = t(
        view.multiple
          ? 'DESORDEM.Perseguicao.Penalidade.AplicarNome'
          : 'DESORDEM.Perseguicao.Penalidade.Aplicar',
        { valor: view.valor, tipo, nome: row.name },
      );
      button.addEventListener('click', async (event) => {
        event.preventDefault();
        button.disabled = true;
        try {
          await requestApply(message, row.combatantId);
        } finally {
          // Se o cartão não for redesenhado (mestre ausente, por exemplo), o botão volta
          globalThis.setTimeout(() => {
            button.disabled = false;
          }, 5000);
        }
      });
      bar.append(button);
    }
    container.append(bar);
  }
}
