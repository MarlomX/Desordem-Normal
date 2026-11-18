/* global document */
/**
 * Esconder-se e distrair (Foundry): as duas ações especiais que são testes.
 *
 * - Na janela pré-teste, a vaga da seção de furtividade oferece «Esconder-se» (para quem já se
 *   escondeu) e «Distrair» (com o destino do dado escolhido ANTES de rolar). A DT é a da ação.
 * - A rolagem é privada (só quem rolou vê) e sofre o dado de pavor normalmente.
 * - O uso conta ao rolar: o mestre ativo soma o contador quando a mensagem chega a ele.
 * - Se passar, o cartão mostra os dados que podem virar esconderijo (os 3 maiores) e o jogador
 *   escolhe um. Quem grava é o mestre: o jogador manda só o id da mensagem e o índice do dado.
 */
import { SYSTEM_ID } from '../config.js';
import { resolveWithValues } from '../rolls/abilities.js';
import { buildDieFace } from '../rolls/die-face.js';
import {
  actionBarView,
  applyHideOp,
  createActionFlag,
  finishHide,
  normalizeUses,
  releaseHide,
  reserveHide,
  validActionChoice,
} from '../rolls/stealth.js';
import { SOCKET, findStealth, postStealthNotice, requestHideOp, stealthInfoFor } from './store.js';

/** Ação de socket do botão do cartão. */
export const ACTION_SOCKET_ACTION = 'stealthAction';

const FLAG = `flags.${SYSTEM_ID}.acaoFurtiva`;

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

/**
 * Transforma as opções da janela num teste de esconder-se ou distrair. Se a opção deixou de valer
 * (cena encerrada, destino que saiu da cena), avisa e rola um teste comum.
 * @param {Actor} actor
 * @param {object} options Opções da janela pré-teste (com `furtiva: {acao, destino, dt}`).
 */
export function withStealthAction(actor, options) {
  const { furtiva, ...rest } = options;
  const info = stealthInfoFor(actor);
  const offer = info?.[furtiva?.acao];
  const recipientOk =
    furtiva?.acao !== 'distrair' || offer?.recipients?.some((r) => r.id === furtiva.destino);
  if (!offer || !recipientOk) {
    ui.notifications.warn(t('DESORDEM.Furtividade.Erro.AcaoBloqueada'));
    return rest;
  }
  return {
    ...rest,
    // A DT é a do momento da rolagem (outro personagem pode ter distraído enquanto a janela abria)
    dt: offer.dt,
    showDt: true,
    rollMode: 'selfroll',
    acaoFlag: createActionFlag({
      kind: furtiva.acao,
      combatantId: info.combatantId,
      recipientId: furtiva.destino,
      dt: offer.dt,
    }),
  };
}

/**
 * Ação chamativa: o teste continua normal (público, com DT); quando ele é rolado, o dado de
 * esconderijo escolhido na janela é descartado e o chat avisa (só quantidades). Se o dado mudou
 * nesse meio-tempo (outra procura, por exemplo), nada é descartado e o jogador é avisado.
 * @param {Actor} actor
 * @param {object} options Opções da janela pré-teste (com `chamativa: {index, lados, valor}`).
 */
export function withFlashyAction(actor, options) {
  const { chamativa, ...rest } = options;
  const info = stealthInfoFor(actor);
  if (!chamativa?.on || !info?.chamativa) {
    ui.notifications.warn(t('DESORDEM.Furtividade.Erro.AcaoBloqueada'));
    return rest;
  }
  return {
    ...rest,
    onResult: async (result) => {
      await rest.onResult?.(result);
      const combatant = findStealth()?.combatants.get(info.combatantId);
      if (!combatant) return;
      await requestHideOp(
        combatant,
        { type: 'remove', index: chamativa.index, lados: chamativa.lados, valor: chamativa.valor },
        'chamativa',
      );
    },
  };
}

/**
 * Hook createChatMessage (só no mestre ativo): conta o uso da ação ao rolar. Confere que o autor
 * da mensagem é dono do personagem e marca o registro para não contar duas vezes.
 */
export async function countActionUse(message) {
  if (game.users.activeGM?.id !== game.user.id) return;
  const flag = message.flags?.[SYSTEM_ID]?.acaoFurtiva;
  if (!flag || flag.contado) return;
  const stealth = findStealth();
  const combatant = stealth?.combatants.get(flag.combatantId);
  const author = message.author ?? game.users.get(message.user);
  if (!stealth?.system.ativa || !combatant?.actor || !author) return;
  if (!combatant.actor.testUserPermission(author, 'OWNER')) return;
  await message.update({ [`${FLAG}.contado`]: true });
  if (flag.kind === 'esconder') {
    const next = normalizeUses(normalizeUses(combatant.system.esconderUsos) + 1);
    await combatant.update({ system: { esconderUsos: next } });
  } else if (flag.kind === 'distrair') {
    const next = normalizeUses(normalizeUses(stealth.system.distrairUsos) + 1);
    await stealth.update({ system: { distrairUsos: next } });
  }
}

/** Dados do teste como o cartão os mostra agora e se passou na DT da ação. */
function currentTest(test, flag) {
  const sides = test.sides ?? [];
  const values = (test.values ?? []).slice(0, sides.length);
  const result = resolveWithValues({ ...test.plan, dt: flag.dt }, test.values);
  return { sides, values, success: Boolean(result.success) };
}

/** O destino do dado ainda pode recebê-lo? (na cena e já escondido ou encontrado) */
function recipientOf(flag) {
  const stealth = findStealth();
  if (!stealth?.system.ativa) return null;
  const recipient = stealth.combatants.get(flag.recipientId);
  return recipient?.system.escondeu ? recipient : null;
}

/**
 * Guarda o dado escolhido no destino (só no mestre). Confere o dono de quem rolou, o sucesso, o
 * dado escolhido e o destino; os valores vêm do cartão, nunca do pedido.
 */
export async function applyStealthAction(message, userId, index) {
  const info = message?.flags?.[SYSTEM_ID];
  const flag = info?.acaoFurtiva;
  const test = info?.teste;
  if (!flag || !test) return;
  const stealth = findStealth();
  const roller = stealth?.combatants.get(flag.combatantId);
  const recipient = recipientOf(flag);
  const requester = game.users.get(userId);
  if (!roller?.actor || !recipient || !requester) return;
  if (!roller.actor.testUserPermission(requester, 'OWNER')) return;

  const { sides, values, success } = currentTest(test, flag);
  if (!success || !validActionChoice(values, index)) return;

  const reserved = reserveHide(flag, Date.now());
  if (!reserved) return;
  await message.update({ [FLAG]: reserved });
  try {
    const die = { lados: sides[Number(index)], valor: values[Number(index)] };
    const result = applyHideOp(recipient.system.esconderijo, { type: 'add', ...die });
    if (!result.valid) throw new Error(`dado inválido ou limite atingido (${result.reason})`);
    await recipient.update({ system: { esconderijo: result.list, escondeu: true } });
    await message.update({ [FLAG]: finishHide(reserved, { dados: [die], extra: null }) });
    // Aviso público: só quantidades
    const key = flag.kind === 'distrair' ? 'distraiu' : 'escondeuDeNovo';
    await postStealthNotice({
      actor: roller.actor,
      titulo: t('DESORDEM.Furtividade.Chat.Titulo'),
      texto: t(`DESORDEM.Furtividade.Chat.${key}`, {
        nome: roller.name,
        alvo: recipient.name,
        n: result.list.length,
      }),
    });
  } catch (error) {
    console.error(`${SYSTEM_ID} | falha ao guardar o dado da ação de furtividade`, error);
    await message.update({ [FLAG]: releaseHide(reserved) });
  }
}

/** O mestre grava direto; o jogador pede ao mestre ativo pelo socket. */
function requestApply(message, index) {
  if (game.user.isGM) return applyStealthAction(message, game.user.id, index);
  if (!game.users.activeGM) {
    ui.notifications.warn(t('DESORDEM.Furtividade.Erro.SemMestre'));
    return undefined;
  }
  return game.socket.emit(SOCKET, {
    action: ACTION_SOCKET_ACTION,
    messageId: message.id,
    index: Number(index),
  });
}

/** Socket (só no mestre ativo): atende o botão do cartão. */
export async function handleActionSocket(data, userId) {
  await applyStealthAction(game.messages.get(data?.messageId), userId, data?.index);
}

/** Face de um dado (só dígitos passam para o HTML, veja die-face.js). */
function dieFace(sides, value) {
  const wrapper = document.createElement('span');
  wrapper.innerHTML = buildDieFace({ sides, value, size: 'grande' });
  return wrapper.firstElementChild;
}

/** Hook renderChatMessageHTML: barra do esconder-se ou do distrair. */
export function renderActionBar(message, html) {
  const info = message.flags?.[SYSTEM_ID];
  const flag = info?.acaoFurtiva;
  const test = info?.teste;
  const container = html.querySelector('.message-content');
  if (!flag || !test || !container) return;
  // Rolagem privada: quem só vê os «???» também não vê a barra (ela mostraria os valores)
  if (!(message.isContentVisible ?? message.visible ?? true)) return;

  const current = currentTest(test, flag);
  const stealth = findStealth();
  const roller = stealth?.combatants.get(flag.combatantId);
  const recipient = recipientOf(flag);
  const view = actionBarView(flag, current, {
    canApply: Boolean(roller?.actor?.isOwner),
    recipientOk: Boolean(recipient),
    now: Date.now(),
  });

  const doc = html.ownerDocument;
  const bar = doc.createElement('div');
  bar.className = 'desordem-teste__avanco desordem-esconderijo-barra';
  const text = doc.createElement('span');
  text.className = 'desordem-teste__avanco-texto';
  bar.append(text);
  const kindLabel = t(`DESORDEM.Furtividade.Acao.${flag.kind}`);
  const recipientName = stealth?.combatants.get(flag.recipientId)?.name ?? '';

  if (view.applied) {
    text.textContent = t('DESORDEM.Furtividade.Acao.Guardado', {
      acao: kindLabel,
      alvo: recipientName,
    });
    const row = doc.createElement('span');
    row.className = 'desordem-esconderijo-barra__dados';
    for (const die of flag.dados ?? []) row.append(dieFace(die.lados, die.valor));
    bar.append(row);
    container.append(bar);
    return;
  }
  if (!view.success) {
    text.textContent = t('DESORDEM.Furtividade.Acao.Falhou', { acao: kindLabel, dt: flag.dt });
    container.append(bar);
    return;
  }
  text.textContent = view.recipientOk
    ? t('DESORDEM.Furtividade.Acao.Passou', { acao: kindLabel, alvo: recipientName })
    : t('DESORDEM.Furtividade.Acao.SemDestino', { alvo: recipientName });
  if (view.busy) {
    const busy = doc.createElement('span');
    busy.className = 'desordem-ficha__dica';
    busy.textContent = t('DESORDEM.Perseguicao.Barra.Aplicando');
    bar.append(busy);
  }
  if (!view.showButton) {
    container.append(bar);
    return;
  }

  // Escolha do dado: só os possíveis (com 4 dados, o que ficou de fora não aparece)
  let chosen = view.chosen;
  const hint = doc.createElement('span');
  hint.className = 'desordem-ficha__dica';
  hint.textContent = t('DESORDEM.Furtividade.Acao.Escolher');
  const row = doc.createElement('span');
  row.className = 'desordem-esconderijo-barra__dados';
  const chips = [];
  for (const index of view.eligible) {
    const chip = doc.createElement('button');
    chip.type = 'button';
    chip.className = 'desordem-esconderijo-barra__escolha';
    chip.append(dieFace(current.sides[index], current.values[index]));
    chip.addEventListener('click', (event) => {
      event.preventDefault();
      chosen = index;
      for (const [other, element] of chips) {
        element.classList.toggle('is-fora', other !== chosen);
        element.setAttribute('aria-pressed', String(other === chosen));
      }
    });
    chips.push([index, chip]);
    row.append(chip);
  }
  for (const [index, element] of chips) {
    element.classList.toggle('is-fora', index !== chosen);
    element.setAttribute('aria-pressed', String(index === chosen));
  }

  const button = doc.createElement('button');
  button.type = 'button';
  button.textContent = t('DESORDEM.Furtividade.Acao.Guardar', { alvo: recipientName });
  button.addEventListener('click', async (event) => {
    event.preventDefault();
    button.disabled = true;
    try {
      await requestApply(message, chosen);
    } finally {
      globalThis.setTimeout(() => {
        button.disabled = false;
      }, 5000);
    }
  });
  bar.append(hint, row, button);
  container.append(bar);
}
