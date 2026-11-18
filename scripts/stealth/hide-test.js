/**
 * Teste de esconderijo da cena de furtividade (Foundry).
 *
 * O teste não tem janela própria: é a opção «usar como teste de esconderijo» da janela pré-teste,
 * em qualquer perícia, para quem ainda está «sem esconderijo». Este arquivo:
 *   - prepara as opções da rolagem (sem DT, sem pavor, rolagem privada) e guarda na mensagem um
 *     registro (flag `esconderijo`) com o participante;
 *   - desenha no cartão do teste a barra com o botão «Guardar dados de esconderijo» (com 4 dados, o
 *     jogador escolhe quais 3 ficam; no crítico, o maior dado do teste é rolado como dado extra);
 *   - grava no participante, sempre pelo mestre: o jogador manda só o id da mensagem e os índices
 *     escolhidos; o mestre relê os dados no próprio cartão, rola o dado extra e confere o dono.
 */
/* global document */
import { SYSTEM_ID } from '../config.js';
import { resolveWithValues } from '../rolls/abilities.js';
import { buildDieFace } from '../rolls/die-face.js';
import {
  createHideFlag,
  critExtraSides,
  defaultHideKeep,
  finishHide,
  hideBarView,
  hideDiceFromTest,
  hideTestPatch,
  normalizeHideKeep,
  releaseHide,
  reserveHide,
} from '../rolls/stealth.js';
import { SOCKET, findStealth, hideTestInfoFor, postStealthNotice } from './store.js';

/** Ação de socket do botão do cartão. */
export const HIDE_TEST_SOCKET_ACTION = 'stealthHideTest';

/** Modo de rolagem do teste: só quem rolou vê o cartão (o «self roll» do Foundry). */
const SELF_ROLL = 'selfroll';

const FLAG = `flags.${SYSTEM_ID}.esconderijo`;

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

/**
 * Transforma as opções da janela num teste de esconderijo. Se a opção deixou de valer enquanto a
 * janela estava aberta (o mestre zerou ou encerrou a cena, por exemplo), avisa e rola um teste
 * comum.
 * @param {Actor} actor
 * @param {object} options Opções devolvidas pela janela pré-teste (com `esconderijo: true`).
 */
export function withHideTest(actor, options) {
  const { esconderijo, dt, ...rest } = options;
  const info = hideTestInfoFor(actor);
  if (!esconderijo || !info) {
    ui.notifications.warn(t('DESORDEM.Furtividade.Erro.TesteBloqueado'));
    return { ...rest, ...(dt !== undefined ? { dt } : {}) };
  }
  return {
    ...rest,
    ignoreFear: true,
    controlFear: false,
    embraceFear: false,
    showDt: false,
    rollMode: SELF_ROLL,
    esconderijoFlag: createHideFlag({ combatantId: info.combatantId }),
  };
}

/** Dados do teste como o cartão os mostra agora (sem o dado de pavor, que não vale aqui). */
function currentTest(test) {
  const sides = test.sides ?? [];
  const values = (test.values ?? []).slice(0, sides.length);
  const result = resolveWithValues(test.plan, test.values);
  return { sides, values, critical: Boolean(result.criticalSuccess) };
}

/** O participante do registro, se a cena ainda está em andamento. */
function participantOf(flag) {
  const stealth = findStealth();
  if (!stealth?.system.ativa) return null;
  return stealth.combatants.get(flag.combatantId) ?? null;
}

/**
 * Guarda os dados de esconderijo (executado pelo mestre ativo, ou pelo mestre que clicou).
 * Nada do que o jogador mandou é usado além dos índices escolhidos, que são conferidos.
 * @param {ChatMessage} message Cartão do teste.
 * @param {string} userId Quem clicou.
 * @param {number[]} keep Índices dos dados que ficam (só importa com 4 dados).
 */
export async function applyHideTest(message, userId, keep) {
  const info = message?.flags?.[SYSTEM_ID];
  const flag = info?.esconderijo;
  const test = info?.teste;
  if (!flag || !test) return;

  const combatant = participantOf(flag);
  const requester = game.users.get(userId);
  if (!combatant?.actor || !requester) return;
  // Só um dono do personagem (ou o mestre) guarda os dados dele, e só de quem não se escondeu
  if (!combatant.actor.testUserPermission(requester, 'OWNER')) return;
  if (combatant.system.escondeu) return;

  const { sides, values, critical } = currentTest(test);
  const chosen = normalizeHideKeep(values, keep);
  if (!chosen) return;

  const reserved = reserveHide(flag, Date.now());
  if (!reserved) return;
  await message.update({ [FLAG]: reserved });
  try {
    const dados = hideDiceFromTest({ sides, values, keep: chosen }).filter(Boolean);
    // Crítico: rola um dado extra igual ao maior dado do teste (exceção ao limite de dados)
    let extra = null;
    const extraSides = critical ? critExtraSides(sides) : 0;
    if (extraSides) {
      const roll = await new Roll(`1d${extraSides}`).evaluate();
      extra = { lados: extraSides, valor: roll.total };
    }
    const all = extra ? [...dados, extra] : dados;
    await combatant.update({ system: hideTestPatch(all) });
    await message.update({ [FLAG]: finishHide(reserved, { dados, extra }) });
    // Aviso público: só a quantidade, nunca os valores
    await postStealthNotice({
      actor: combatant.actor,
      titulo: t('DESORDEM.Furtividade.Chat.Titulo'),
      texto: t('DESORDEM.Furtividade.Chat.escondeu', { nome: combatant.name, n: all.length }),
    });
  } catch (error) {
    console.error(`${SYSTEM_ID} | falha ao guardar os dados de esconderijo`, error);
    await message.update({ [FLAG]: releaseHide(reserved) });
  }
}

/** O mestre grava direto; o jogador pede ao mestre ativo por socket. */
function requestApply(message, keep) {
  if (game.user.isGM) return applyHideTest(message, game.user.id, keep);
  if (!game.users.activeGM) {
    ui.notifications.warn(t('DESORDEM.Furtividade.Erro.SemMestre'));
    return undefined;
  }
  return game.socket.emit(SOCKET, {
    action: HIDE_TEST_SOCKET_ACTION,
    messageId: message.id,
    keep: [...keep],
  });
}

/** Socket (só no mestre ativo): atende o botão do cartão. */
export async function handleHideTestSocket(data, userId) {
  const keep = Array.isArray(data?.keep) ? data.keep.slice(0, 4) : [];
  await applyHideTest(game.messages.get(data?.messageId), userId, keep);
}

/** Face de um dado (só dígitos passam para o HTML, veja die-face.js). */
function dieFace(sides, value) {
  const wrapper = document.createElement('span');
  wrapper.innerHTML = buildDieFace({ sides, value, size: 'grande' });
  return wrapper.firstElementChild;
}

/**
 * Hook renderChatMessageHTML: barra do teste de esconderijo. Mostra os dados que viram esconderijo
 * (com 4 dados, o jogador escolhe 3 clicando neles) e o botão de uso único.
 */
export function renderHideBar(message, html) {
  const info = message.flags?.[SYSTEM_ID];
  const flag = info?.esconderijo;
  const test = info?.teste;
  const container = html.querySelector('.message-content');
  if (!flag || !test || !container) return;
  // Rolagem privada: quem não pode ver o conteúdo (os «???» do Foundry) também não vê a barra,
  // senão os valores dos dados apareceriam aqui embaixo. Sem a propriedade, usa `visible`.
  const contentVisible = message.isContentVisible ?? message.visible ?? true;
  if (!contentVisible) return;

  const current = currentTest(test);
  const combatant = participantOf(flag);
  const view = hideBarView(flag, current, {
    canApply: Boolean(combatant?.actor?.isOwner),
    alreadyHidden: Boolean(combatant?.system.escondeu),
    now: Date.now(),
  });

  const doc = html.ownerDocument;
  const bar = doc.createElement('div');
  bar.className = 'desordem-teste__avanco desordem-esconderijo-barra';
  const text = doc.createElement('span');
  text.className = 'desordem-teste__avanco-texto';
  bar.append(text);

  // Já guardado: mostra os dados (o cartão é privado, só quem rolou o vê)
  if (view.applied) {
    text.textContent = t('DESORDEM.Furtividade.Barra.Guardado', { n: view.appliedCount });
    const row = doc.createElement('span');
    row.className = 'desordem-esconderijo-barra__dados';
    for (const die of flag.dados ?? []) row.append(dieFace(die.lados, die.valor));
    if (view.extra) {
      const plus = doc.createElement('span');
      plus.className = 'desordem-esconderijo-barra__extra';
      plus.textContent = t('DESORDEM.Furtividade.Barra.Extra');
      row.append(plus, dieFace(view.extra.lados, view.extra.valor));
    }
    bar.append(row);
    container.append(bar);
    return;
  }

  text.textContent = view.alreadyHidden
    ? t('DESORDEM.Furtividade.Barra.JaEscondido')
    : t('DESORDEM.Furtividade.Barra.Titulo');
  if (view.critical && view.critSides) {
    const crit = doc.createElement('span');
    crit.className = 'desordem-ficha__dica';
    crit.textContent = t('DESORDEM.Furtividade.Barra.Critico', { dado: view.critSides });
    bar.append(crit);
  }
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

  // Escolha dos dados que ficam (só com 4 dados; com até 3, ficam todos)
  const keep = new Set(defaultHideKeep(current.values));
  const button = doc.createElement('button');
  button.type = 'button';
  const updateButton = () => {
    const ok = !view.mustChoose || keep.size === view.keepCount;
    button.disabled = !ok;
    button.textContent = t('DESORDEM.Furtividade.Barra.Guardar', { n: keep.size });
  };

  if (view.mustChoose) {
    const hint = doc.createElement('span');
    hint.className = 'desordem-ficha__dica';
    hint.textContent = t('DESORDEM.Furtividade.Barra.Escolher', { n: view.keepCount });
    const row = doc.createElement('span');
    row.className = 'desordem-esconderijo-barra__dados';
    current.values.forEach((value, index) => {
      const chip = doc.createElement('button');
      chip.type = 'button';
      chip.className = 'desordem-esconderijo-barra__escolha';
      chip.classList.toggle('is-fora', !keep.has(index));
      chip.setAttribute('aria-pressed', String(keep.has(index)));
      chip.append(dieFace(current.sides[index], value));
      chip.addEventListener('click', (event) => {
        event.preventDefault();
        if (keep.has(index)) keep.delete(index);
        else keep.add(index);
        chip.classList.toggle('is-fora', !keep.has(index));
        chip.setAttribute('aria-pressed', String(keep.has(index)));
        updateButton();
      });
      row.append(chip);
    });
    bar.append(hint, row);
  }

  updateButton();
  button.addEventListener('click', async (event) => {
    event.preventDefault();
    button.disabled = true;
    try {
      await requestApply(message, [...keep]);
    } finally {
      // Se o cartão não for redesenhado (mestre ausente, por exemplo), o botão volta
      globalThis.setTimeout(() => updateButton(), 5000);
    }
  });
  bar.append(button);
  container.append(bar);
}
