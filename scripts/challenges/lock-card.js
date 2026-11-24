/**
 * Destrancar (Foundry). A fechadura de um desafio do tipo destrancar e as tentativas dos jogadores.
 *
 * A senha: o mestre gera (o Foundry rola os dados) ou digita (rolou com dados físicos). Ela vai
 * para uma mensagem sussurrada só aos mestres (flag `senha`); o desafio guarda apenas o id dessa
 * mensagem. Sem senha guardada, o mestre responde as tentativas na mesa, de boca.
 *
 * A tentativa: o jogador clica em «Tentar senha» no cartão de desafios da ficha e digita os
 * números. O pedido vai ao mestre ativo por socket (só ids e os números); ele confere o dono, conta a
 * tentativa (o total é do grupo) e posta no chat «Ana tentou 2, 5, 4, 4». Com a verificação
 * automática ligada (e uma senha guardada), o cartão já sai com a resposta de cada posição; senão o
 * mestre tem no cartão o botão «Responder pela senha» (ou responde na mesa).
 */
import { SYSTEM_ID } from '../config.js';
import { postMessage, render } from '../rolls/chat.js';
import { addParticipants, participantIds, withLock } from '../rolls/challenge.js';
import {
  LOCK_ANSWERS,
  allCorrect,
  attemptAnswered,
  crimeAttemptsPerRound,
  lockAnswers,
  lockRollFormula,
  lockStatus,
  maximumVisible,
  markUnlocked,
  normalizeSounds,
  parseSequence,
  publicAnswer,
  registerAttempt,
  resetLock,
  secretFromFlag,
  setSecretMessage,
  setSound,
  soundsActive,
  soundsFromFlag,
  validSequence,
} from '../rolls/lock.js';
import {
  addAttemptRow,
  addManualRow,
  fillAttemptSounds,
  removeBoardRow,
  setBoardSound,
  setBoardValue,
  toggleBoardMark,
} from '../rolls/lock-board.js';
import { SOCKET } from '../chase/store.js';
import { createChallenge, getChallenge, mutateChallenge, worldActorId } from './store.js';

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const warn = (key, data) => ui.notifications.warn(t(key, data));
const escape = (text) => Handlebars.escapeExpression(String(text ?? ''));

const TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/tentativa.hbs`;

/** Nome mostrado do desafio. */
const shownName = (challenge) => challenge?.nome || t('DESORDEM.Desafio.Tipo.destrancar');

/** Sequência como texto: «2, 5, 4, 4». */
const sequenceText = (values) => values.join(', ');

/** Respostas como texto: «Baixo, Certo, Alto» (chaves DESORDEM.Desafio.Fechadura.Resposta.*). */
const answersText = (answers) =>
  answers.map((answer) => t(`DESORDEM.Desafio.Fechadura.Resposta.${answer}`)).join(', ');

// ---------- Senha (o mestre) ----------

/** A senha guardada (lida da mensagem sussurrada), ou `null` se não há ou não vale mais. */
export function readSecret(challenge) {
  const lock = challenge?.fechadura;
  if (!lock?.senhaMsg) return null;
  const message = game.messages.get(lock.senhaMsg);
  return secretFromFlag(message?.flags?.[SYSTEM_ID]?.senha, challenge.id, lock);
}

/** Sussurra a senha aos mestres e guarda o id da mensagem no desafio. */
async function storeSecret(challenge, values, rolls = []) {
  const recipients = ChatMessage.getWhisperRecipients('GM').map((user) => user.id);
  const message = await ChatMessage.create({
    content: `<p><strong>${escape(t('DESORDEM.Desafio.Fechadura.SenhaTitulo', { nome: shownName(challenge) }))}</strong></p><p>${escape(sequenceText(values))}</p>`,
    whisper: recipients,
    rolls,
    flags: { [SYSTEM_ID]: { senha: { desafioId: challenge.id, valores: values } } },
  });
  await mutateChallenge(challenge.id, (current) =>
    withLock(current, (lock) => setSecretMessage(lock, message.id)),
  );
}

// ---------- Sons (o mestre; v0.27.2) ----------

/**
 * Os sons como estão no sussurro aos mestres (os três textos, mesmo incompletos), para a janela do
 * mestre. Sem mensagem (ou de outra fechadura), os três vazios. Só os mestres recebem o sussurro,
 * então num jogador isto sempre volta vazio.
 */
export function soundsDraft(challenge) {
  const id = challenge?.fechadura?.sonsMsg;
  const message = id ? game.messages.get(id) : null;
  return soundsFromFlag(message?.flags?.[SYSTEM_ID]?.sons, challenge?.id) ?? normalizeSounds({});
}

/** Os sons que valem nesta fechadura (os três preenchidos e diferentes), ou `null`. */
export function readSounds(challenge) {
  const sounds = soundsDraft(challenge);
  return soundsActive(sounds) ? sounds : null;
}

/** Texto do sussurro dos sons: «Alto = tic · Baixo = toc · Certo = clack». */
function soundsContent(challenge, sounds) {
  const lines = LOCK_ANSWERS.map(
    (answer) =>
      `${escape(t(`DESORDEM.Desafio.Fechadura.Resposta.${answer}`))} = ${escape(sounds[answer] || '—')}`,
  ).join(' · ');
  return `<p><strong>${escape(t('DESORDEM.Desafio.Fechadura.SonsTitulo', { nome: shownName(challenge) }))}</strong></p><p>${lines}</p>`;
}

/**
 * O mestre escreve um som (janela do desafio). Os três ficam num sussurro só para os mestres: a
 * primeira vez cria a mensagem e guarda o id dela na fechadura; depois, só atualiza a mensagem.
 * Os cartões já respondidos continuam com o som que tinham.
 * @param {string} challengeId
 * @param {string} answer 'alto', 'baixo' ou 'certo'.
 * @param {string} raw Texto digitado.
 */
export async function storeSound(challengeId, answer, raw) {
  const challenge = getChallenge(challengeId);
  if (!game.user.isGM || challenge?.tipo !== 'destrancar') return;
  const sounds = setSound(soundsDraft(challenge), answer, raw);
  const flag = { desafioId: challenge.id, ...sounds };
  const existing = challenge.fechadura.sonsMsg
    ? game.messages.get(challenge.fechadura.sonsMsg)
    : null;
  if (existing) {
    await existing.update({
      content: soundsContent(challenge, sounds),
      [`flags.${SYSTEM_ID}.sons`]: flag,
    });
    return;
  }
  const message = await ChatMessage.create({
    content: soundsContent(challenge, sounds),
    whisper: ChatMessage.getWhisperRecipients('GM').map((user) => user.id),
    flags: { [SYSTEM_ID]: { sons: flag } },
  });
  await mutateChallenge(challenge.id, (current) =>
    withLock(current, (lock) => ({ ...lock, sonsMsg: message.id })),
  );
}

/** Gerar senha: o Foundry rola os dados da fechadura (só os mestres veem). */
export async function generateSecret(challengeId) {
  const challenge = getChallenge(challengeId);
  if (!game.user.isGM || challenge?.tipo !== 'destrancar') return;
  // Um termo por posição («1d8 + 1d8 + 1d4 + 1d12»), para a ordem dos dados ser a da senha
  const roll = await new Roll(lockRollFormula(challenge.fechadura)).evaluate();
  const values = roll.dice.map((die) => die.results[0].result);
  await storeSecret(challenge, values, [roll]);
}

/** Janela com N campos de número (a senha do mestre e a tentativa do jogador). */
async function askSequence({ title, hint, lock }) {
  const fields = Array.from(
    { length: lock.dados },
    (_, i) =>
      `<label class="desordem-ficha__campo"><span>${i + 1}º d${lock.lados[i]}</span><input type="number" name="n${i}" min="1" max="${lock.lados[i]}" step="1" inputmode="numeric"></label>`,
  ).join('');
  const raws = await foundry.applications.api.DialogV2.prompt({
    window: { title },
    content: `${hint ? `<p class="desordem-ficha__dica">${escape(hint)}</p>` : ''}<div class="desordem-fechadura__campos">${fields}</div>`,
    ok: {
      label: t('DESORDEM.Habilidade.Confirmar'),
      callback: (event, button) =>
        Array.from({ length: lock.dados }, (_, i) => button.form.elements[`n${i}`].value),
    },
    rejectClose: false,
    modal: true,
  });
  if (!raws) return null;
  const values = parseSequence(raws, lock);
  if (!values) warn('DESORDEM.Desafio.Fechadura.Invalida');
  return values;
}

/** Definir senha: o mestre digita a senha que rolou com dados físicos. */
export async function defineSecret(challengeId) {
  const challenge = getChallenge(challengeId);
  if (!game.user.isGM || challenge?.tipo !== 'destrancar') return;
  const values = await askSequence({
    title: t('DESORDEM.Desafio.Fechadura.Definir'),
    hint: t('DESORDEM.Desafio.Fechadura.DefinirDica'),
    lock: challenge.fechadura,
  });
  if (values) await storeSecret(challenge, values);
}

/** Nova fechadura: zera as tentativas e esquece a senha (a mensagem antiga fica no chat). */
export async function resetChallengeLock(challengeId) {
  if (!game.user.isGM) return;
  await mutateChallenge(challengeId, (challenge) => withLock(challenge, (lock) => resetLock(lock)));
}

/** A fechadura estragou: cria um desafio de arrombar com os mesmos participantes e o devolve. */
export async function createForceFromLock(challengeId) {
  const challenge = getChallenge(challengeId);
  if (!game.user.isGM || !challenge) return null;
  const id = await createChallenge(shownName(challenge), 'arrombar');
  if (!id) return null;
  const people = participantIds(challenge);
  await mutateChallenge(id, (created) => addParticipants(created, people));
  return id;
}

// ---------- Tentativas ----------

/** O mestre atende direto; o jogador pede ao mestre ativo por socket. */
function request(payload) {
  if (game.user.isGM) return handleRequest(payload, game.user.id);
  if (!game.users.activeGM) {
    warn('DESORDEM.Perseguicao.Erro.SemMestre');
    return undefined;
  }
  return game.socket.emit(SOCKET, payload);
}

/** Botão «Tentar senha» da ficha: o jogador digita os números e pede ao mestre. */
export async function attemptLock(actor, challengeId) {
  const challenge = getChallenge(challengeId);
  const actorId = worldActorId(actor);
  if (
    challenge?.tipo !== 'destrancar' ||
    !challenge.ativo ||
    !challenge.participantes.some((entry) => entry.actorId === actorId) ||
    lockStatus(challenge.fechadura) !== 'aberta'
  ) {
    warn('DESORDEM.Desafio.Teste.Indisponivel');
    return undefined;
  }
  const crime = Number(actor.system?.pericias?.crime) || 0;
  const perRound = crimeAttemptsPerRound(crime);
  const lock = challenge.fechadura;
  const values = await askSequence({
    title: t('DESORDEM.Desafio.Fechadura.Tentar'),
    hint: [
      // Máximo escondido ou infinito: não diz quantas restam
      maximumVisible(lock, { isGM: game.user.isGM })
        ? t('DESORDEM.Desafio.Fechadura.Restam', { n: lock.maximo - lock.usadas })
        : '',
      perRound ? t('DESORDEM.Desafio.Fechadura.PorRodada', { n: perRound, dado: crime }) : '',
    ]
      .filter(Boolean)
      .join(' '),
    lock,
  });
  if (!values) return undefined;
  return request({ action: 'lockAttempt', challengeId, actorId, values });
}

/** Botão «Responder pela senha» do cartão (só o mestre). */
function respondFromCard(message) {
  return handleRequest({ action: 'lockRespond', messageId: message.id }, game.user.id);
}

/** Pedidos atendidos agora (evita que dois cliques juntos contem duas vezes a mesma coisa). */
const inFlight = new Set();

async function handleRequest(payload, userId) {
  // O quadro não tem trava local: cada mudança é pequena e passa pela fila de gravação do mestre
  if (payload.action === 'lockBoard') {
    await applyBoardChange(payload, userId);
    return;
  }
  const key = payload.messageId ?? `${payload.challengeId}:${payload.actorId}`;
  if (inFlight.has(key)) return;
  inFlight.add(key);
  try {
    if (payload.action === 'lockAttempt') await applyAttempt(payload, userId);
    else if (payload.action === 'lockRespond') await applyResponse(payload, userId);
  } finally {
    inFlight.delete(key);
  }
}

// ---------- Quadro de teoria ----------

/** Quem pode mexer no quadro: o mestre ou o dono de algum participante do desafio. */
export function canEditBoard(challenge, user = game.user) {
  if (!challenge || !user) return false;
  if (user.isGM) return true;
  return challenge.participantes.some((entry) =>
    game.actors.get(entry.actorId)?.testUserPermission(user, 'OWNER'),
  );
}

/**
 * Operações do quadro: nova linha, número de uma linha de teoria, marca, som anotado (v0.27.3) e
 * apagar linha.
 */
const BOARD_OPS = new Set(['nova', 'valor', 'marca', 'som', 'apagar']);

/**
 * Pede uma mudança no quadro (janela do quadro). O mestre aplica direto; o jogador pede ao mestre.
 * @param {string} challengeId
 * @param {{op: string, rowId?: string, index?: number, value?: string, mark?: string}} change
 */
export function requestBoardChange(challengeId, change) {
  return request({ action: 'lockBoard', challengeId, ...change });
}

/** Aplica uma mudança no quadro (mestre ativo), conferindo quem pediu. */
async function applyBoardChange({ challengeId, op, rowId, index, value, mark }, userId) {
  if (!BOARD_OPS.has(op)) return;
  const requester = game.users.get(userId);
  const challenge = getChallenge(challengeId);
  if (challenge?.tipo !== 'destrancar' || !canEditBoard(challenge, requester)) return;
  const newId = foundry.utils.randomID();
  const position = Number(index);
  await mutateChallenge(challengeId, (current) =>
    withLock(current, (lock) => {
      if (op === 'nova') return addManualRow(lock, newId);
      if (op === 'valor') return setBoardValue(lock, String(rowId), position, value) ?? lock;
      if (op === 'marca') return toggleBoardMark(lock, String(rowId), position, mark) ?? lock;
      // Som anotado: o texto é limpo e cortado na lógica pura (`setBoardSound`)
      if (op === 'som') return setBoardSound(lock, String(rowId), position, value) ?? lock;
      return removeBoardRow(lock, String(rowId)) ?? lock;
    }),
  );
}

/** Conta a tentativa (mestre), responde se a verificação automática estiver ligada e posta. */
async function applyAttempt({ challengeId, actorId, values }, userId) {
  const actor = game.actors.get(actorId);
  const requester = game.users.get(userId);
  if (!actor || !requester || !actor.testUserPermission(requester, 'OWNER')) return;
  const before = getChallenge(challengeId);
  if (!before?.ativo || before.tipo !== 'destrancar') return;
  if (!before.participantes.some((entry) => entry.actorId === actorId)) return;
  const guess = Array.isArray(values) ? values.map(Number) : [];
  if (!validSequence(guess, before.fechadura)) return;

  const secret = before.fechadura.auto ? readSecret(before) : null;
  // Sons da fechadura (lidos do sussurro aos mestres; este código roda no mestre ativo)
  const sounds = secret ? readSounds(before) : null;
  const rowId = foundry.utils.randomID();
  let outcome = null;
  await mutateChallenge(challengeId, (challenge) => {
    const counted = registerAttempt(challenge.fechadura);
    if (!counted) return challenge;
    const answers = secret ? lockAnswers(secret, guess) : null;
    // O que o cartão público guarda: com sons, só os sons (o significado não sai do mestre)
    const shown = publicAnswer(answers, sounds);
    // A tentativa também entra no quadro de teoria (números travados), já com os sons, se houver
    const withRow = addAttemptRow(counted, rowId, guess, shown.sons);
    const lock = allCorrect(answers) ? markUnlocked(withRow) : withRow;
    // O cartão do chat é público: só leva o máximo se os jogadores podem vê-lo
    outcome = {
      ...shown,
      status: lockStatus(lock),
      usadas: lock.usadas,
      maximo: maximumVisible(lock, { isGM: false }) ? lock.maximo : null,
    };
    return { ...challenge, fechadura: lock };
  });
  if (!outcome) return;
  const content = await render(TEMPLATE, {
    titulo: t('DESORDEM.Desafio.Fechadura.CartaoTitulo', { nome: shownName(before) }),
  });
  await postMessage({
    actor,
    content,
    flags: {
      tentativa: {
        desafioId: challengeId,
        actorId,
        valores: guess,
        // Linha desta tentativa no quadro (a resposta dada depois preenche os sons nela)
        linha: rowId,
        respostas: outcome.respostas,
        sons: outcome.sons,
        status: outcome.status,
        usadas: outcome.usadas,
        maximo: outcome.maximo,
      },
    },
    rollMode: 'publicroll',
  });
}

/** O mestre responde uma tentativa já postada, pela senha guardada. */
async function applyResponse({ messageId }, userId) {
  if (!game.users.get(userId)?.isGM) return;
  const message = game.messages.get(messageId);
  const flag = message?.flags?.[SYSTEM_ID]?.tentativa;
  if (!flag || attemptAnswered(flag)) return;
  const challenge = getChallenge(flag.desafioId);
  const secret = readSecret(challenge);
  const answers = secret && lockAnswers(secret, flag.valores);
  if (!answers) {
    warn('DESORDEM.Desafio.Fechadura.SemSenha');
    return;
  }
  // Com sons, o cartão guarda só os sons (o significado fica com o mestre)
  const shown = publicAnswer(answers, readSounds(challenge));
  const unlocked = allCorrect(answers);
  // Uma gravação só: destranca e, com sons, preenche a linha da tentativa no quadro
  if (unlocked || (shown.sons && flag.linha)) {
    await mutateChallenge(flag.desafioId, (current) =>
      withLock(current, (lock) => {
        const filled =
          shown.sons && flag.linha
            ? (fillAttemptSounds(lock, String(flag.linha), shown.sons) ?? lock)
            : lock;
        return unlocked ? markUnlocked(filled) : filled;
      }),
    );
  }
  const status = unlocked ? 'destrancada' : flag.status;
  await message.update({
    [`flags.${SYSTEM_ID}.tentativa.respostas`]: shown.respostas,
    [`flags.${SYSTEM_ID}.tentativa.sons`]: shown.sons,
    [`flags.${SYSTEM_ID}.tentativa.status`]: status,
  });
}

/** Socket: o mestre ativo atende as tentativas dos jogadores. */
export function registerLockSocket() {
  game.socket.on(SOCKET, async (data, userId) => {
    if (game.users.activeGM?.id !== game.user.id) return;
    if (data?.action === 'lockBoard') {
      // Só os campos conhecidos (o resto do pedido é ignorado)
      const { challengeId, op, rowId, index, value, mark } = data;
      await handleRequest(
        { action: 'lockBoard', challengeId, op, rowId, index, value, mark },
        userId,
      );
      return;
    }
    if (data?.action !== 'lockAttempt') return;
    await handleRequest(
      {
        action: 'lockAttempt',
        challengeId: data.challengeId,
        actorId: data.actorId,
        values: data.values,
      },
      userId,
    );
  });
}

/** Hook renderChatMessageHTML: o texto da tentativa, a resposta e o botão do mestre. */
export function renderLockAttempt(message, html) {
  const flag = message.flags?.[SYSTEM_ID]?.tentativa;
  const container = html.querySelector('[data-tentativa]');
  if (!flag || !container) return;
  const doc = html.ownerDocument;
  const line = (className, text) => {
    const p = doc.createElement('p');
    p.className = className;
    p.textContent = text;
    container.append(p);
  };
  const actor = game.actors.get(flag.actorId);
  line(
    'desordem-fechadura__tentou',
    t('DESORDEM.Desafio.Fechadura.Tentou', {
      nome: actor?.name ?? '',
      valores: sequenceText(flag.valores),
    }),
  );
  if (flag.respostas) line('desordem-fechadura__resposta', answersText(flag.respostas));
  if (flag.sons) {
    // Sons: o jogador ouve só o som de cada posição («tic · clack · toc»)
    line('desordem-fechadura__resposta', flag.sons.join(' · '));
    // O mestre vê também o significado, recalculado pela senha guardada (só ele recebe o sussurro)
    const secret = game.user.isGM ? readSecret(getChallenge(flag.desafioId)) : null;
    const meaning = secret && lockAnswers(secret, flag.valores);
    if (meaning) {
      line(
        'desordem-ficha__dica',
        t('DESORDEM.Desafio.Fechadura.SonsMestre', { respostas: answersText(meaning) }),
      );
    }
  }
  line(
    'desordem-ficha__dica',
    flag.maximo
      ? t('DESORDEM.Desafio.Fechadura.Contagem', { usadas: flag.usadas, maximo: flag.maximo })
      : t('DESORDEM.Desafio.Fechadura.ContagemSemMaximo', { usadas: flag.usadas }),
  );
  if (flag.status === 'destrancada')
    line('desordem-teste__avanco-texto', t('DESORDEM.Desafio.Fechadura.Abriu'));
  else if (flag.status === 'estragada') {
    line('desordem-teste__avanco-texto', t('DESORDEM.Desafio.Fechadura.Estragou'));
  }

  // Sem resposta ainda: o mestre pode responder pela senha guardada (ou na mesa)
  if (!attemptAnswered(flag) && game.user.isGM && readSecret(getChallenge(flag.desafioId))) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.textContent = t('DESORDEM.Desafio.Fechadura.Responder');
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      button.disabled = true;
      try {
        await respondFromCard(message);
      } finally {
        button.disabled = false;
      }
    });
    const bar = doc.createElement('div');
    bar.className = 'desordem-teste__avanco';
    bar.append(button);
    container.append(bar);
  }
}

/** Para a janela do mestre: a senha guardada como texto (ou `null`). */
export function secretText(challenge) {
  const secret = readSecret(challenge);
  return secret ? sequenceText(secret) : null;
}
