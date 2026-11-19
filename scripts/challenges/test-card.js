/**
 * Teste estendido pela janela pré-teste (Foundry). Como o avanço da perseguição, o teste estendido
 * não tem janela própria: é uma opção da janela pré-teste («usar no desafio»).
 *   - Antes da rolagem (`withExtendedTest`): confere que o desafio ainda está ativo e que o
 *     personagem participa, e guarda na mensagem o registro do teste (flag `desafio`).
 *   - No cartão do chat (`renderChallengeBar`, hook renderChatMessageHTML): mostra quanto o teste
 *     vale e, para o dono do personagem e para o mestre, um botão de uso único que soma os pontos.
 *     Na escalada, um teste que falhou mostra «aplicar queda» no lugar de «somar». Com custo por
 *     teste (o arrombar, por exemplo), uma segunda barra tem o botão «pagar PV».
 *   - Somar e cair (`applyChallengePoints`): sempre o mestre grava (os desafios são uma
 *     configuração do mundo). O jogador pede por socket só com o id da mensagem; o mestre confere o
 *     dono, reserva o clique (contra o duplo clique) e recalcula o valor dos dados que o cartão tem
 *     agora (a Análise pode ter mudado o resultado).
 *   - Pagar o custo (`applyCost`): como o esforço extra da perseguição, quem rolou (ou o mestre)
 *     desconta o PV do próprio personagem, sem passar pelo mestre.
 * Nada disso é automático: o dano e a perda de PV só acontecem quando alguém clica no cartão.
 */
import { SYSTEM_ID } from '../config.js';
import { resolveWithValues } from '../rolls/abilities.js';
import {
  finishAdvanceFlag,
  isAdvanceClaimable,
  releaseAdvance,
  reserveAdvance,
} from '../rolls/chase.js';
import {
  applyChallengeFailure,
  applyChallengeTest,
  challengeBarView,
  challengeTestChoices,
  challengeTestGain,
  challengeTestSuccess,
  costBarView,
  createChallengeTestFlag,
  currentPoints,
  failureKind,
  loseHitPoints,
  sustainStepMods,
} from '../rolls/challenge.js';
import { SOCKET } from '../chase/store.js';
import { getChallenge, mutateChallenge, readChallenges, worldActorId } from './store.js';

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

/** Caminho do registro na mensagem (para `message.update`). */
const FLAG = `flags.${SYSTEM_ID}.desafio`;

/** Caminho do custo por teste dentro do registro (tem a sua própria reserva). */
const COST_FLAG = `${FLAG}.custo`;

/** Nome mostrado do desafio (o padrão, se o mestre apagou o nome). */
const shownName = (nome) => nome || t('DESORDEM.Desafio.Estendido.SemNome');

/** Desafios que a janela pré-teste oferece a este personagem (ativos, de que ele participa). */
export const challengeChoicesFor = (actor) =>
  challengeTestChoices(readChallenges(), worldActorId(actor), { isGM: game.user.isGM }).map(
    (entry) => ({
      ...entry,
      nome: shownName(entry.nome),
    }),
  );

/**
 * Prepara as opções de um teste que vale para um teste estendido: guarda o registro na mensagem.
 * Se o desafio deixou de valer enquanto a janela estava aberta (o mestre encerrou, por exemplo),
 * avisa e rola um teste comum.
 * @param {Actor} actor
 * @param {object} options Opções devolvidas pela janela pré-teste (com `estendido`).
 */
export function withExtendedTest(actor, options) {
  const { estendido, ...rest } = options;
  const actorId = worldActorId(actor);
  const challenge = getChallenge(estendido.id);
  const joined = challenge?.participantes.some((entry) => entry.actorId === actorId);
  if (!challenge?.ativo || !joined) {
    ui.notifications.warn(t('DESORDEM.Desafio.Teste.Indisponivel'));
    return rest;
  }
  const desafioFlag = createChallengeTestFlag({
    challenge,
    actorId,
    dt: estendido.dt,
    abordagem: estendido.abordagem,
  });
  // Sustentar: as reduções que a janela pré-teste calculou (uma por rodada já sustentada, sempre
  // no dado mais forte), as mesmas que a prévia mostrou
  const reductions = desafioFlag.tipo === 'sustentar' ? sustainStepMods(estendido.reducao) : [];
  const stepMods = reductions.length ? [...(rest.stepMods ?? []), ...reductions] : rest.stepMods;
  return { ...rest, ...(stepMods ? { stepMods } : {}), desafioFlag };
}

/** Resultado do teste do cartão com os dados como estão agora (depois de Análise ou Prontidão). */
const currentResult = (test) => resolveWithValues(test.plan, test.values);

/**
 * Mensagens sendo atendidas agora pelo mestre. A reserva na mensagem só vale depois que o servidor
 * confirma a gravação; esta trava local impede que dois pedidos chegados juntos (o duplo clique
 * do jogador e o do mestre, por exemplo) leiam os dois a mensagem ainda «pendente».
 */
const inFlight = new Set();

/**
 * Soma os pontos do teste ao desafio ou, na escalada que falhou, aplica a queda (executado pelo
 * mestre ativo, um pedido por mensagem).
 */
export async function applyChallengePoints(message, userId) {
  if (!message || inFlight.has(message.id)) return;
  inFlight.add(message.id);
  try {
    await applyNow(message, userId);
  } finally {
    inFlight.delete(message.id);
  }
}

async function applyNow(message, userId) {
  const info = message?.flags?.[SYSTEM_ID];
  const flag = info?.desafio;
  const test = info?.teste;
  if (!flag || !test) return;

  const actor = game.actors.get(flag.actorId);
  const requester = game.users.get(userId);
  if (!actor || !requester) return;
  // Nunca confia no pedido: só um dono do personagem (ou o mestre) soma os pontos dele.
  if (!actor.testUserPermission(requester, 'OWNER')) return;

  const reserved = reserveAdvance(flag, Date.now());
  if (!reserved) return;
  await message.update({ [FLAG]: reserved });
  try {
    // O valor vem dos dados que o cartão tem agora, e não de algo enviado pelo jogador.
    const result = currentResult(test);
    if (failureKind(flag) && !challengeTestSuccess(result, flag.dt)) {
      await applyFailureNow(message, reserved, actor, result);
      return;
    }
    const gain = challengeTestGain(result, flag);
    let depois = null;
    await mutateChallenge(flag.desafioId, (challenge) => {
      const next = applyChallengeTest(challenge, flag.actorId, gain);
      if (!next) return challenge;
      depois = currentPoints(next, flag.actorId);
      return next;
    });
    // Desafio encerrado, excluído ou sem o personagem: nada somado (a barra mostra o motivo)
    await message.update({
      [FLAG]:
        depois === null
          ? releaseAdvance(reserved)
          : { ...finishAdvanceFlag(reserved, gain), depois },
    });
  } catch (error) {
    console.error(`${SYSTEM_ID} | falha ao somar os pontos do teste estendido`, error);
    await message.update({ [FLAG]: releaseAdvance(reserved) });
  }
}

/**
 * Falha com consequência, aplicada pelo botão do cartão:
 * - queda (escalar): dano igual aos pontos acumulados (lidos agora, não na rolagem), que zeram;
 * - dano (alcançar): dano igual à RB (segura, e as ações zeram) ou à RA (arriscada);
 * - soltar (sustentar): sem dano; as rodadas zeram.
 * Chegando a 0 PV, o cartão avisa; o teste de lesão é do jogador.
 */
async function applyFailureNow(message, reserved, actor, result) {
  let outcome = null;
  await mutateChallenge(reserved.desafioId, (challenge) => {
    const failure = applyChallengeFailure(challenge, reserved, result);
    if (!failure) return challenge;
    outcome = { ...failure, depois: currentPoints(failure.challenge, reserved.actorId) };
    return failure.challenge;
  });
  if (!outcome) {
    await message.update({ [FLAG]: releaseAdvance(reserved) });
    return;
  }
  const loss = loseHitPoints(actor.system.pv.value, outcome.dano);
  if (loss.applied > 0) await actor.update({ 'system.pv.value': loss.pv });
  await message.update({
    // Guarda o dano da regra (mesmo que o PV tenha parado em 0) e qual falha foi aplicada
    [FLAG]: {
      ...finishAdvanceFlag(reserved, 0),
      dano: outcome.dano,
      zerou: loss.reachedZero,
      falhaAplicada: outcome.kind,
      depois: outcome.depois,
    },
  });
  if (loss.reachedZero) ui.notifications.warn(t('DESORDEM.Desafio.Barra.ZeroPv'));
}

/** O mestre aplica direto; o jogador pede ao mestre ativo por socket. */
function requestApply(message) {
  if (game.user.isGM) return applyChallengePoints(message, game.user.id);
  if (!game.users.activeGM) {
    ui.notifications.warn(t('DESORDEM.Perseguicao.Erro.SemMestre'));
    return undefined;
  }
  return game.socket.emit(SOCKET, { action: 'challengePoints', messageId: message.id });
}

/** Socket: o mestre ativo atende os botões «somar pontos» e «aplicar queda» dos jogadores. */
export function registerChallengeSocket() {
  game.socket.on(SOCKET, async (data, userId) => {
    if (game.users.activeGM?.id !== game.user.id) return;
    if (data?.action !== 'challengePoints') return;
    await applyChallengePoints(game.messages.get(data.messageId), userId);
  });
}

/** Ator do registro (sempre um ator do mundo). */
const actorOfFlag = (flag) => game.actors.get(flag.actorId) ?? null;

/**
 * Quem pode pagar o custo aqui: o dono do personagem que pode mexer na mensagem (quem rolou, ou o
 * mestre). Mesmo critério do esforço extra da perseguição.
 */
function canPayHere(message, flag) {
  if (!game.user.isGM && !message.isAuthor) return false;
  return Boolean(actorOfFlag(flag)?.isOwner);
}

/** Desconta o custo por teste (feito por quem clicou: quem rolou, ou o mestre). */
async function applyCost(message) {
  const flag = message.flags?.[SYSTEM_ID]?.desafio;
  const custo = flag?.custo;
  const actor = flag && actorOfFlag(flag);
  if (!custo || !actor?.isOwner) return;

  const reserved = reserveAdvance(custo, Date.now());
  if (!reserved) return;
  await message.update({ [COST_FLAG]: reserved });
  try {
    // Usa o PV de agora (ele pode ter mudado desde a rolagem)
    const loss = loseHitPoints(actor.system.pv.value, custo.pv);
    if (loss.applied > 0) await actor.update({ 'system.pv.value': loss.pv });
    await message.update({
      [COST_FLAG]: {
        ...reserved,
        estado: 'aplicado',
        aplicado: loss.applied,
        zerou: loss.reachedZero,
        reservadoEm: null,
      },
    });
    if (loss.reachedZero) ui.notifications.warn(t('DESORDEM.Desafio.Barra.ZeroPv'));
  } catch (error) {
    console.error(`${SYSTEM_ID} | falha ao descontar o custo do teste estendido`, error);
    await message.update({ [COST_FLAG]: releaseAdvance(reserved) });
  }
}

/** Botão de uso único dos cartões (desliga ao clicar e volta se o cartão não for redesenhado). */
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

/** Aviso «aplicando...» enquanto a reserva está de pé. */
function busyNote(doc) {
  const busy = doc.createElement('span');
  busy.className = 'desordem-ficha__dica';
  busy.textContent = t('DESORDEM.Perseguicao.Barra.Aplicando');
  return busy;
}

/** Texto de um resultado já aplicado (pontos somados, queda, dano ou soltar). */
function appliedText(view, nome) {
  const withZero = (text) =>
    view.appliedZerou ? `${text} ${t('DESORDEM.Desafio.Barra.ZeroPv')}` : text;
  if (view.appliedFalha === 'queda') {
    return withZero(t('DESORDEM.Desafio.Barra.QuedaAplicada', { dano: view.appliedDano, nome }));
  }
  if (view.appliedFalha === 'dano') {
    return withZero(t('DESORDEM.Desafio.Barra.DanoAplicado', { dano: view.appliedDano, nome }));
  }
  if (view.appliedFalha === 'soltar') return t('DESORDEM.Desafio.Barra.Soltou', { nome });
  if (view.tipo === 'alcancar') {
    return view.appliedDepois >= 2
      ? t('DESORDEM.Desafio.Barra.Alcancou', { nome })
      : t('DESORDEM.Desafio.Barra.AcaoRegistrada', { nome, n: view.appliedDepois ?? 1 });
  }
  if (view.tipo === 'sustentar') {
    return t('DESORDEM.Desafio.Barra.Sustentando', { nome, n: view.appliedDepois ?? 1 });
  }
  return t('DESORDEM.Desafio.Barra.Somado', { pontos: view.appliedPontos, nome });
}

/** O que o teste vale, antes do clique (o detalhe depois de «Nome (DT x):»). */
function pendingDetail(view) {
  if (view.falha === 'queda') return t('DESORDEM.Desafio.Barra.Queda', { dano: view.dano });
  if (view.falha === 'dano') {
    return t(view.zera ? 'DESORDEM.Desafio.Barra.DanoZera' : 'DESORDEM.Desafio.Barra.Dano', {
      dano: view.dano,
    });
  }
  if (view.falha === 'soltar') return t('DESORDEM.Desafio.Barra.Solta');
  if (view.tipo === 'alcancar') {
    return t(
      view.abordagem === 'arriscada'
        ? 'DESORDEM.Desafio.Barra.PassouAlcanca'
        : 'DESORDEM.Desafio.Barra.PassouAcao',
    );
  }
  if (view.tipo === 'sustentar') return t('DESORDEM.Desafio.Barra.PassouSustenta');
  // Chaves montadas (conferidas à mão): DESORDEM.Desafio.Barra.{passou,falhou,crit,falhaCritica}
  return t(`DESORDEM.Desafio.Barra.${view.kind}`, { pontos: view.pontos });
}

/** Texto da barra principal. */
function mainText(view) {
  const nome = shownName(view.nome);
  if (view.applied) return appliedText(view, nome);
  if (view.fechado) return t('DESORDEM.Desafio.Barra.Fechado');
  // Chaves montadas aqui (conferidas à mão): DESORDEM.Desafio.Abordagem.{rapida,cautelosa,
  // segura,arriscada}
  const titulo = view.abordagem
    ? t('DESORDEM.Desafio.Barra.TituloEscalar', {
        nome,
        abordagem: t(`DESORDEM.Desafio.Abordagem.${view.abordagem}`),
        dt: view.dt,
      })
    : t('DESORDEM.Desafio.Barra.Titulo', { nome, dt: view.dt });
  const passos = view.passos ? ` ${t('DESORDEM.Desafio.Barra.Passos', { n: view.passos })}` : '';
  return `${titulo}: ${pendingDetail(view)}${passos}`;
}

/** Rótulo do botão principal (o que o clique faz). */
function buttonLabel(view) {
  if (view.falha === 'queda') return t('DESORDEM.Desafio.Barra.AplicarQueda', { dano: view.dano });
  if (view.falha === 'dano') return t('DESORDEM.Desafio.Barra.AplicarDano', { dano: view.dano });
  if (view.falha === 'soltar') return t('DESORDEM.Desafio.Barra.BotaoSoltar');
  if (view.tipo === 'alcancar') {
    return t(
      view.abordagem === 'arriscada'
        ? 'DESORDEM.Desafio.Barra.BotaoAlcancou'
        : 'DESORDEM.Desafio.Barra.BotaoAcao',
    );
  }
  if (view.tipo === 'sustentar') return t('DESORDEM.Desafio.Barra.BotaoContinuar');
  return t('DESORDEM.Desafio.Barra.Somar', { pontos: view.pontos });
}

/** Barra principal: quanto o teste vale e o botão «somar» (ou «aplicar queda»). */
function mainBar(message, flag, test, doc) {
  const now = Date.now();
  const claimable = isAdvanceClaimable(flag, now);
  const view = challengeBarView(flag, currentResult(test), {
    canApply: Boolean(game.actors.get(flag.actorId)?.isOwner),
    claimable,
    busy: flag.estado === 'aplicando' && !claimable,
    challenge: getChallenge(flag.desafioId),
  });
  const bar = doc.createElement('div');
  bar.className = 'desordem-teste__avanco desordem-teste__desafio';
  const text = doc.createElement('span');
  text.className = 'desordem-teste__avanco-texto';
  text.textContent = mainText(view);
  bar.append(text);
  if (view.busy) bar.append(busyNote(doc));
  if (view.showButton) bar.append(cardButton(doc, buttonLabel(view), () => requestApply(message)));
  return bar;
}

/** Barra do custo por teste: «pagar N PV» (passando ou falhando). `null` sem custo. */
function costBar(message, flag, doc) {
  const custo = flag.custo;
  if (!custo) return null;
  const now = Date.now();
  const claimable = isAdvanceClaimable(custo, now);
  const view = costBarView(custo, {
    canApply: canPayHere(message, flag),
    claimable,
    busy: custo.estado === 'aplicando' && !claimable,
  });
  if (!view) return null;
  const bar = doc.createElement('div');
  bar.className = 'desordem-teste__avanco desordem-teste__desafio-custo';
  const text = doc.createElement('span');
  text.className = 'desordem-teste__avanco-texto';
  if (view.applied) {
    text.textContent = t('DESORDEM.Desafio.Barra.CustoPago', { pv: view.appliedPv });
    if (view.zerou) text.textContent += ` ${t('DESORDEM.Desafio.Barra.ZeroPv')}`;
  } else {
    text.textContent = t('DESORDEM.Desafio.Barra.Custo', { pv: view.pv });
  }
  bar.append(text);
  if (view.busy) bar.append(busyNote(doc));
  if (view.showButton) {
    bar.append(
      cardButton(doc, t('DESORDEM.Desafio.Barra.Pagar', { pv: view.pv }), () => applyCost(message)),
    );
  }
  return bar;
}

/** Hook renderChatMessageHTML: as barras do teste estendido no cartão do teste. */
export function renderChallengeBar(message, html) {
  const info = message.flags?.[SYSTEM_ID];
  const flag = info?.desafio;
  const test = info?.teste;
  const container = html.querySelector('.message-content');
  // Rolagem privada: quem só vê «???» não vê as barras (elas entregariam o resultado)
  if (!flag || !test || !container || !message.isContentVisible) return;
  const doc = html.ownerDocument;
  container.append(mainBar(message, flag, test, doc));
  const cost = costBar(message, flag, doc);
  if (cost) container.append(cost);
}
