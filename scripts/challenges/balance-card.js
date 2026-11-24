/**
 * Equilíbrio (Foundry). O jogador clica em «Rolar equilíbrio» no cartão de desafios da ficha: o
 * sistema rola 2d10 e posta um cartão próprio no chat (não é um teste de atributo + perícia, então
 * não passa pela janela pré-teste, não tem pavor nem crítico). O conteúdo do cartão (os dois d10,
 * os d4 somados e os botões) é desenhado pelo hook renderChatMessageHTML a partir do registro
 * guardado na mensagem (flag `equilibrio`, veja scripts/rolls/balance.js).
 *
 * Os botões: «registrar rodada» (equilibrou), «usar dado de equilíbrio» (rola um d4), «somar ao
 * 1º/2º» (escolhe o d10), «cair», e a Análise e a Prontidão sobre os d10. Quem grava é sempre o
 * mestre ativo: o jogador manda por socket só o id da mensagem e o passo (com o valor que rolou,
 * no d4 e na Prontidão, conferido pelo mestre). O mestre confere o dono, reserva o cartão contra o
 * duplo clique e grava no cartão e no desafio. Nada de dano: a queda vai pela Penalidade do desafio.
 */
import { SYSTEM_ID } from '../config.js';
import { postMessage, render } from '../rolls/chat.js';
import { askReroll, rerollLabel } from '../rolls/abilities-chat.js';
import { adjustLabel } from '../sheets/ability-controls.js';
import { applyAnalysis } from '../rolls/abilities.js';
import { canPay, payUpdates } from '../rolls/ability-effects.js';
import {
  actorEffects,
  adjustResource,
  firstEffect,
  rerollActors,
  resourceUpdates,
  roundUseUpdate,
  usableThisRound,
  walletOf,
} from '../rolls/ability-effects-actor.js';
import {
  BALANCE_BONUS_SIDES,
  BALANCE_SIDES,
  analyseBalance,
  assignBonusDie,
  balanceRerollCandidates,
  balanceState,
  balanceView,
  createBalanceFlag,
  finishBalance,
  releaseBalance,
  rerollBalance,
  reserveBalance,
  rollBonusDie,
} from '../rolls/balance.js';
import {
  applyBalanceFall,
  currentPoints,
  participantReserve,
  registerBalanceRound,
  spendBalanceDie,
} from '../rolls/challenge.js';
import { getChallenge, mutateChallenge, worldActorId } from './store.js';
import { t } from '../shared/i18n.js';
import { SOCKET, onSocketAction, hasActiveGM } from '../shared/socket.js';
import { createLock } from '../shared/lock.js';

const warn = (key, data) => ui.notifications.warn(t(key, data));

/** Caminho do registro na mensagem (para `message.update`). */
const FLAG = `flags.${SYSTEM_ID}.equilibrio`;

const TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/equilibrio.hbs`;

/** Passos que o socket aceita. */
const OPS = new Set(['registrar', 'dado', 'somar', 'cair', 'analise', 'repetir']);

/** Dado de Acrobacia do personagem (para o tamanho da reserva). */
const acrobaciaOf = (actor) => Number(actor?.system?.pericias?.acrobacia) || 0;

/** Mostra a rolagem nos dados 3D (se o módulo estiver ativo), sem criar outra mensagem. */
async function showDice(roll) {
  try {
    await game.dice3d?.showForRoll?.(roll, game.user, true);
  } catch {
    // Sem dados 3D: o valor aparece no cartão
  }
}

/**
 * Rola o equilíbrio de um personagem num desafio (botão da ficha): 2d10 e o cartão no chat.
 * Só vale se o desafio está ativo e o personagem participa.
 */
export async function rollBalance(actor, challengeId) {
  const challenge = getChallenge(challengeId);
  const actorId = worldActorId(actor);
  const joined = challenge?.participantes.some((entry) => entry.actorId === actorId);
  if (challenge?.tipo !== 'equilibrio' || !challenge.ativo || !joined) {
    warn('DESORDEM.Desafio.Teste.Indisponivel');
    return null;
  }
  const roll = await new Roll(`2d${BALANCE_SIDES}`).evaluate();
  const values = roll.dice[0].results.map((result) => result.result);
  const flag = createBalanceFlag({ desafioId: challenge.id, actorId, values });
  if (!flag) return null;
  const content = await render(TEMPLATE, {
    titulo: t('DESORDEM.Desafio.Equilibrio.Titulo', {
      nome: actor.name,
      desafio: challenge.nome || t('DESORDEM.Desafio.Tipo.equilibrio'),
    }),
  });
  return postMessage({ actor, content, rolls: [roll], flags: { equilibrio: flag } });
}

// ---------- Pedidos (o jogador) ----------

/** O mestre atende direto; o jogador pede ao mestre ativo por socket. */
function request(message, payload) {
  if (game.user.isGM) return applyBalanceStep(message, game.user.id, payload);
  if (!hasActiveGM()) return undefined;
  return game.socket.emit(SOCKET, {
    action: 'challengeBalance',
    messageId: message.id,
    ...payload,
  });
}

/** Rola o d4 (no cliente de quem clicou, aparecendo nos dados 3D) e pede para guardar. */
async function requestBonusDie(message) {
  const roll = await new Roll(`1d${BALANCE_BONUS_SIDES}`).evaluate();
  await showDice(roll);
  return request(message, { op: 'dado', value: roll.total });
}

/** Janela de um campo só (Análise e Prontidão). */
async function ask({ title, content, read }) {
  return foundry.applications.api.DialogV2.prompt({
    window: { title },
    content,
    ok: {
      label: t('DESORDEM.Habilidade.Confirmar'),
      callback: (event, button) => read(button.form),
    },
    rejectClose: false,
    modal: true,
  });
}

/** Análise sobre os d10: o dono escolhe os valores novos e paga os marcadores. */
async function requestAnalysis(message, actor) {
  const flag = message.flags[SYSTEM_ID].equilibrio;
  // Recurso do efeito `ajusteDados` (na análise, os marcadores)
  const resource = adjustResource(actor);
  if (!resource) return undefined;
  const points = resource.points;
  const fields = flag.base
    .map(
      (value, i) =>
        `<label class="desordem-ficha__campo"><span>d${BALANCE_SIDES} (${value})</span><input type="number" name="die${i}" value="${value}" min="1" max="${BALANCE_SIDES}"></label>`,
    )
    .join('');
  const newBase = await ask({
    title: t('DESORDEM.Habilidade.AnaliseTitulo'),
    content: `<p>${t('DESORDEM.Habilidade.AnaliseDica', { pontos: points })}</p>${fields}`,
    read: (form) => flag.base.map((_, i) => Number(form.elements[`die${i}`].value)),
  });
  if (!newBase) return undefined;
  let applied;
  try {
    applied = applyAnalysis({
      values: flag.base,
      sides: [BALANCE_SIDES, BALANCE_SIDES],
      newValues: newBase,
      points,
    });
  } catch {
    warn('DESORDEM.Habilidade.AnaliseInvalida');
    return undefined;
  }
  if (applied.cost === 0) return undefined;
  await actor.update(resourceUpdates({ [resource.chave]: points - applied.cost }));
  return request(message, {
    op: 'analise',
    values: applied.values,
    note: t('DESORDEM.Habilidade.AnaliseNota', {
      nome: actor.name,
      habilidade: firstEffect(actor, 'ajusteDados')?.itemName ?? '',
      pontos: applied.cost,
    }),
  });
}

/**
 * Prontidão (efeito `rerrolar`): gasta o custo (2 PD) e rola de novo um d10 que não tirou 1 (uma
 * vez por cartão; em combate, também uma vez por rodada).
 * @param {ChatMessage} message Cartão de equilíbrio.
 * @param {Actor|null} speaker Quem faz o equilíbrio (para a escolha do mestre).
 */
async function requestReroll(message, speaker) {
  const flag = message.flags[SYSTEM_ID].equilibrio;
  const actors = rerollActors(speaker);
  if (!actors.length) return warn('DESORDEM.Habilidade.ProntidaoIndisponivel');
  const dice = balanceRerollCandidates(flag).map((index) => ({
    index,
    label: `d${BALANCE_SIDES} = ${flag.base[index]}`,
  }));
  const choice = await askReroll(actors, dice);
  if (!choice) return undefined;
  const { actor, index } = choice;
  const entries = actorEffects(actor);
  const entry = firstEffect(actor, 'rerrolar', null, entries);
  const wallet = walletOf(actor, entries);
  if (!entry || !usableThisRound(actor, entry) || !canPay(entry.params.custo, wallet)) {
    return warn('DESORDEM.Habilidade.ProntidaoIndisponivel');
  }
  const roll = await new Roll(`1d${BALANCE_SIDES}`).evaluate();
  await showDice(roll);
  await actor.update({ ...payUpdates(entry.params.custo, wallet), ...roundUseUpdate(entry) });
  return request(message, {
    op: 'repetir',
    index,
    value: roll.total,
    note: t('DESORDEM.Habilidade.ProntidaoNota', {
      nome: actor.name,
      habilidade: entry.itemName,
      dado: BALANCE_SIDES,
      de: flag.base[index],
      para: roll.total,
    }),
  });
}

// ---------- O mestre grava ----------

/** Mensagens sendo atendidas agora (dois pedidos juntos não leem o cartão ainda «aberto»). */
const inFlight = createLock();

/** O pedido pode ser feito por este usuário? */
function allowed(op, actor, requester) {
  if (requester.isGM) return true;
  // Prontidão: quem pede precisa controlar um personagem com a habilidade (pode ser um aliado)
  if (op === 'repetir') {
    return game.actors.some(
      (other) =>
        other.testUserPermission(requester, 'OWNER') && Boolean(firstEffect(other, 'rerrolar')),
    );
  }
  return actor.testUserPermission(requester, 'OWNER');
}

/** Atende um passo do cartão (mestre ativo, um pedido por mensagem). */
export async function applyBalanceStep(message, userId, payload) {
  if (!message || !OPS.has(payload?.op)) return;
  await inFlight.run(message.id, () => applyNow(message, userId, payload));
}

async function applyNow(message, userId, { op, value, index, values, note }) {
  const flag = message.flags?.[SYSTEM_ID]?.equilibrio;
  const actor = flag && game.actors.get(flag.actorId);
  const requester = game.users.get(userId);
  if (!flag || !actor || !requester || !allowed(op, actor, requester)) return;

  const reserved = reserveBalance(flag, Date.now());
  if (!reserved) return;
  await message.update({ [FLAG]: reserved });
  const cleanNote = typeof note === 'string' ? note : '';
  try {
    let next = null;
    if (op === 'dado') {
      // Primeiro confere o d4 no cartão; depois desconta da reserva do desafio
      const rolled = rollBonusDie(reserved, Number(value));
      let spent = false;
      if (rolled) {
        await mutateChallenge(flag.desafioId, (challenge) => {
          const changed = spendBalanceDie(challenge, flag.actorId, acrobaciaOf(actor));
          if (!changed) return challenge;
          spent = true;
          return changed;
        });
      }
      next = spent ? rolled : null;
    } else if (op === 'somar') {
      next = assignBonusDie(reserved, Number(index));
    } else if (op === 'analise') {
      next = analyseBalance(reserved, (values ?? []).map(Number), cleanNote);
    } else if (op === 'repetir') {
      next = rerollBalance(reserved, Number(index), Number(value), cleanNote);
    } else if (op === 'registrar' || op === 'cair') {
      next = await finishRound(reserved, op);
    }
    await message.update({
      [FLAG]: next
        ? next.estado === 'aplicando'
          ? releaseBalance(next)
          : next
        : releaseBalance(reserved),
    });
  } catch (error) {
    console.error(`${SYSTEM_ID} | falha no cartão de equilíbrio`, error);
    await message.update({ [FLAG]: releaseBalance(reserved) });
  }
}

/** Fim da rodada no desafio: equilibrou (soma uma rodada) ou caiu (zera e recarrega a reserva). */
async function finishRound(flag, op) {
  const { balanced } = balanceState(flag);
  if (flag.pendente !== null) return null;
  if (op === 'registrar' && !balanced) return null;
  if (op === 'cair' && balanced) return null;
  let depois = null;
  await mutateChallenge(flag.desafioId, (challenge) => {
    if (op === 'registrar') {
      const round = registerBalanceRound(challenge, flag.actorId);
      if (!round) return challenge;
      depois = round.depois;
      return round.challenge;
    }
    const fallen = applyBalanceFall(challenge, flag.actorId);
    if (!fallen) return challenge;
    depois = currentPoints(fallen, flag.actorId);
    return fallen;
  });
  if (depois === null) return null;
  return finishBalance(flag, op === 'registrar' ? 'registrado' : 'caiu', depois);
}

/** Socket: o mestre ativo atende os botões do cartão de equilíbrio. */
export function registerBalanceSocket() {
  onSocketAction('challengeBalance', async (data, userId) => {
    const { op, value, index, values, note } = data;
    await applyBalanceStep(game.messages.get(data.messageId), userId, {
      op,
      value,
      index,
      values,
      note,
    });
  });
}

// ---------- O cartão ----------

/** Botão do cartão (desliga ao clicar; volta se o cartão não for redesenhado). */
function cardButton(doc, label, onClick) {
  const button = doc.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', async (event) => {
    event.preventDefault();
    button.disabled = true;
    try {
      await onClick();
    } finally {
      globalThis.setTimeout(() => {
        button.disabled = false;
      }, 5000);
    }
  });
  return button;
}

/** Texto de um d10: «6 + 2 = 8» (com os d4 somados) ou só «6». */
const dieText = (base, extra) => (extra ? `${base} + ${extra} = ${base + extra}` : String(base));

/** Hook renderChatMessageHTML: os d10, a situação e os botões do cartão de equilíbrio. */
export function renderBalanceCard(message, html) {
  const flag = message.flags?.[SYSTEM_ID]?.equilibrio;
  const container = html.querySelector('[data-equilibrio]');
  if (!flag || !container || !message.isContentVisible) return;

  const actor = game.actors.get(flag.actorId);
  const challenge = getChallenge(flag.desafioId);
  const entry = challenge?.participantes.find((item) => item.actorId === flag.actorId);
  // Repetir dado (Prontidão): um botão só, se algum personagem do usuário estiver pronto
  const ready = rerollActors(actor);
  const analysis = actor?.isOwner ? adjustResource(actor) : null;
  const view = balanceView(flag, {
    canAct: Boolean(actor?.isOwner),
    reserve: challenge ? participantReserve(challenge, flag.actorId, acrobaciaOf(actor)) : 0,
    rounds: entry?.pontos ?? 0,
    target: challenge?.pa ?? 1,
    active: Boolean(challenge?.ativo && entry),
    now: Date.now(),
    canAnalyse: Boolean(actor?.isOwner) && (analysis?.points ?? 0) > 0,
    canReroll: ready.length > 0,
  });
  const doc = html.ownerDocument;
  const add = (tag, className, text) => {
    const element = doc.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    container.append(element);
    return element;
  };

  // Os dois d10 e a diferença
  const dice = add('div', 'desordem-equilibrio__dados');
  for (const i of [0, 1]) {
    const die = doc.createElement('span');
    die.className = 'desordem-equilibrio__dado';
    die.textContent = dieText(view.base[i], view.somas[i]);
    dice.append(die);
  }
  add(
    'p',
    `desordem-equilibrio__situacao ${view.balanced ? 'is-equilibrado' : 'is-caindo'}`,
    t(
      view.balanced
        ? 'DESORDEM.Desafio.Equilibrio.Equilibrado'
        : 'DESORDEM.Desafio.Equilibrio.Caindo',
      {
        diff: view.diff,
      },
    ),
  );
  if (view.dados.length) {
    add(
      'p',
      'desordem-ficha__dica',
      t('DESORDEM.Desafio.Equilibrio.DadosUsados', { dados: view.dados.join(', ') }),
    );
  }
  for (const nota of view.notas) add('p', 'desordem-ficha__dica', nota);

  // Fim da rodada, ou o desafio que fechou
  if (view.estado === 'registrado') {
    add(
      'p',
      'desordem-teste__avanco-texto',
      view.depois >= (challenge?.pa ?? Infinity)
        ? t('DESORDEM.Desafio.Equilibrio.Atravessou')
        : t('DESORDEM.Desafio.Equilibrio.Registrado', { n: view.depois }),
    );
    return;
  }
  if (view.estado === 'caiu') {
    add('p', 'desordem-teste__avanco-texto', t('DESORDEM.Desafio.Equilibrio.Caiu'));
    return;
  }
  if (view.fechado) {
    add('p', 'desordem-ficha__dica', t('DESORDEM.Desafio.Barra.Fechado'));
    return;
  }
  if (view.busy) add('p', 'desordem-ficha__dica', t('DESORDEM.Perseguicao.Barra.Aplicando'));

  const bar = add('div', 'desordem-teste__avanco desordem-equilibrio__acoes');
  if (view.showRegister) {
    const label = view.crosses
      ? t('DESORDEM.Desafio.Equilibrio.BotaoAtravessar')
      : t('DESORDEM.Desafio.Equilibrio.BotaoRegistrar');
    bar.append(cardButton(doc, label, () => request(message, { op: 'registrar' })));
  }
  if (view.showAssign) {
    add(
      'p',
      'desordem-ficha__dica',
      t('DESORDEM.Desafio.Equilibrio.Pendente', { valor: view.pendente }),
    );
    for (const i of [0, 1]) {
      const label = t('DESORDEM.Desafio.Equilibrio.Somar', {
        n: i + 1,
        de: view.values[i],
        para: view.assignPreview[i],
      });
      bar.append(cardButton(doc, label, () => request(message, { op: 'somar', index: i })));
    }
  }
  if (view.showSpend) {
    const label = t('DESORDEM.Desafio.Equilibrio.BotaoDado', { n: view.reserve });
    bar.append(cardButton(doc, label, () => requestBonusDie(message)));
  }
  if (view.showFall) {
    bar.append(
      cardButton(doc, t('DESORDEM.Desafio.Equilibrio.BotaoCair'), () =>
        request(message, { op: 'cair' }),
      ),
    );
  }
  if (!view.balanced && view.reserve === 0 && view.showFall) {
    add('p', 'desordem-ficha__dica', t('DESORDEM.Desafio.Equilibrio.SemDados'));
  }
  if (view.showAnalyse) {
    bar.append(
      cardButton(doc, analysis ? adjustLabel(analysis, t) : '', () =>
        requestAnalysis(message, actor),
      ),
    );
  }
  if (view.showReroll) {
    bar.append(cardButton(doc, rerollLabel(ready[0]), () => requestReroll(message, actor)));
  }
  if (!bar.children.length) bar.remove();
}
