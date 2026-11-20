/* global document */
/**
 * Primeiros socorros pela ficha (Foundry). A lógica fica em `first-aid.js`.
 *
 * 1. O botão ao lado da Medicina abre uma janela: quem é o paciente (o token mirado vem
 *    escolhido) e se há maleta de medicamentos. A DT é 7 + 3 por uso anterior no paciente.
 * 2. Passa pela janela pré-teste (já com as reduções de passo na prévia) e rola Mente + Medicina.
 * 3. O mestre ativo vê o teste chegar e soma 1 ao contador do paciente na cena (aba Condição).
 * 4. Se passou, o cartão ganha o botão «Aplicar primeiros socorros», de uso único, para o dono do
 *    curandeiro ou do paciente. Quem aplica é sempre o mestre (por socket), lendo o resultado do
 *    próprio teste: o paciente moribundo perde a condição, recupera 1 PV e acorda.
 */
import { SYSTEM_ID } from '../config.js';
import { postMessage, render, rollTest, skillTestOptions, testDicePreview } from './chat.js';
import { askRollChoices } from './roll-dialog-chat.js';
import { resolveWithValues } from './abilities.js';
import { firstAidDt, firstAidOutcome, firstAidStepMods, hasMedicalKit } from './first-aid.js';

const TEMPLATE_DIALOG = `systems/${SYSTEM_ID}/templates/dialog/socorro.hbs`;
const SOCKET = `system.${SYSTEM_ID}`;
const SKILL = 'medicina';

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

/** Marca de primeiros socorros guardada no teste. */
const aidFlag = (message) => message?.flags?.[SYSTEM_ID]?.primeirosSocorros ?? null;

/** Contador do paciente: quantas vezes recebeu primeiros socorros nesta cena. */
const usesOf = (actor) => actor?.system?.cena?.primeirosSocorros ?? 0;

/**
 * Pacientes possíveis: o token mirado (se for personagem), o próprio curandeiro e os personagens
 * com token na cena.
 */
function patientCandidates(healer) {
  const list = [];
  const add = (actor) => {
    if (actor?.type === 'personagem' && !list.includes(actor)) list.push(actor);
  };
  for (const token of game.user.targets) add(token.actor);
  add(healer);
  for (const token of globalThis.canvas?.scene?.tokens ?? []) add(token.actor);
  return list;
}

/** Nome do paciente na lista da janela: «Nome (moribundo, DT 10)». */
function patientLabel(actor, healer) {
  const parts = [];
  if (actor === healer) parts.push(t('DESORDEM.Socorro.EmSi'));
  if (actor.system.estado?.moribundo) parts.push(t('DESORDEM.Ficha.Estado.moribundo'));
  parts.push(t('DESORDEM.Socorro.DT', { dt: firstAidDt(usesOf(actor)) }));
  return `${actor.name} (${parts.join(', ')})`;
}

/** Janela: paciente e maleta. Devolve {patient, kit} ou null. */
async function askPatient(healer) {
  const patients = patientCandidates(healer);
  const answer = await foundry.applications.api.DialogV2.wait({
    window: { title: t('DESORDEM.Socorro.Titulo') },
    classes: ['desordem-normal', 'desordem-oposto-janela'],
    content: await render(TEMPLATE_DIALOG, {
      patients: patients.map((actor, index) => ({
        uuid: actor.uuid,
        label: patientLabel(actor, healer),
        selected: index === 0,
      })),
      kit: hasMedicalKit(healer.items.contents),
    }),
    modal: true,
    rejectClose: false,
    buttons: [
      {
        action: 'ok',
        label: t('DESORDEM.Socorro.Continuar'),
        icon: 'fa-solid fa-kit-medical',
        default: true,
        callback: (event, button) => ({
          confirmed: true,
          patient: button.form.elements.patient?.value ?? '',
          kit: Boolean(button.form.elements.kit?.checked),
        }),
      },
      { action: 'cancel', label: t('DESORDEM.Teste.Pre.Cancelar') },
    ],
  });
  if (answer?.confirmed !== true) return null;
  const patient = patients.find((actor) => actor.uuid === answer.patient);
  return patient ? { patient, kit: answer.kit } : null;
}

/**
 * Botão de primeiros socorros da ficha: escolhe o paciente, passa pela janela pré-teste e rola
 * Mente + Medicina contra a DT do paciente.
 * @param {Actor} healer Quem presta os socorros.
 * @param {Event} [event] Clique (Shift pula a janela pré-teste).
 */
export async function startFirstAid(healer, event) {
  const choice = await askPatient(healer);
  if (!choice) return null;
  const { patient, kit } = choice;
  const dt = firstAidDt(usesOf(patient));
  // As reduções tiram passos do maior dado do teste como ele está agora (com os passos da ficha)
  const dice = testDicePreview(healer, SKILL);
  const stepMods = firstAidStepMods(
    { kit, self: patient.uuid === healer.uuid },
    dice.attrDie,
    dice.skillDie,
  );
  const options = await askRollChoices(healer, {
    skillKey: SKILL,
    dt,
    stepMods,
    shift: event?.shiftKey,
  });
  if (!options) return null;
  const test = skillTestOptions(healer, SKILL, undefined, {
    ...options,
    dt: options.dt ?? dt,
    stepMods: [...stepMods, ...(options.stepMods ?? [])],
  });
  return rollTest({
    ...test,
    actor: healer,
    label: t('DESORDEM.Socorro.Rotulo', { nome: patient.name }),
    socorroFlag: {
      pacienteUuid: patient.uuid,
      pacienteNome: patient.name,
      kit,
      estado: 'pendente',
    },
  });
}

/** Resultado atual do teste (com análise e repetições já aplicadas). */
function testResult(message) {
  const data = message?.flags?.[SYSTEM_ID]?.teste;
  if (!data?.plan || !Array.isArray(data.values)) return null;
  return resolveWithValues(data.plan, data.values);
}

/** Ator que fez o teste (pelo orador da mensagem). */
function healerOf(message) {
  const id = message?.speaker?.actor;
  return id ? game.actors.get(id) : null;
}

/** O mestre aplica os primeiros socorros pedidos (de uso único; confere quem pediu e o teste). */
async function applyFirstAid({ messageId, userId }) {
  const message = game.messages.get(messageId);
  const flag = aidFlag(message);
  const user = game.users.get(userId);
  if (!flag || flag.estado !== 'pendente' || !user) return;
  const patient = await foundry.utils.fromUuid(flag.pacienteUuid);
  const healer = healerOf(message);
  const allowed =
    user.isGM ||
    patient?.testUserPermission(user, 'OWNER') ||
    healer?.testUserPermission(user, 'OWNER');
  if (!patient || !allowed || !testResult(message)?.success) return;
  const outcome = firstAidOutcome(patient.system);
  if (!outcome.ok) {
    ui.notifications.warn(t('DESORDEM.Socorro.NaoMoribundo', { nome: patient.name }));
    return;
  }
  await message.update({ [`flags.${SYSTEM_ID}.primeirosSocorros.estado`]: 'aplicado' });
  await patient.update(outcome.updates);
  await postMessage({
    actor: patient,
    content: `<p class="desordem-ficha__dica">${t(
      outcome.woke ? 'DESORDEM.Socorro.AplicadoAcorda' : 'DESORDEM.Socorro.Aplicado',
      { nome: Handlebars.escapeExpression(patient.name), pv: outcome.after },
    )}</p>`,
  });
}

/** Clique no botão: o mestre aplica na hora; o jogador pede ao mestre. */
function requestFirstAid(message) {
  const data = { action: 'firstAid', messageId: message.id, userId: game.user.id };
  if (game.user.isGM) return enqueue(() => applyFirstAid(data));
  if (!game.users.activeGM) {
    ui.notifications.warn(t('DESORDEM.Socorro.SemMestre'));
    return null;
  }
  game.socket.emit(SOCKET, data);
  return null;
}

/** Hook renderChatMessageHTML: põe o botão de aplicar no teste bem-sucedido. */
export function renderFirstAidButton(message, html) {
  const flag = aidFlag(message);
  if (!flag || !message.isContentVisible) return;
  const content = html.querySelector('.message-content') ?? html;
  const bar = document.createElement('div');
  bar.className = 'desordem-socorro-barra';
  if (flag.estado === 'aplicado') {
    bar.textContent = t('DESORDEM.Socorro.JaAplicado', { nome: flag.pacienteNome });
    content.append(bar);
    return;
  }
  if (!testResult(message)?.success) return;
  const patient = foundry.utils.fromUuidSync(flag.pacienteUuid);
  const healer = healerOf(message);
  if (!game.user.isGM && !patient?.isOwner && !healer?.isOwner) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = t('DESORDEM.Socorro.Aplicar', { nome: flag.pacienteNome });
  button.addEventListener('click', (event) => {
    event.preventDefault();
    button.disabled = true;
    requestFirstAid(message);
  });
  bar.append(button);
  content.append(bar);
}

/** Fila do mestre: cada gravação espera a anterior. */
let queue = Promise.resolve();
function enqueue(task) {
  queue = queue
    .then(task)
    .catch((error) => console.error(`${SYSTEM_ID} | primeiros socorros`, error));
  return queue;
}

const isActiveGM = () => game.users.activeGM?.id === game.user.id;

/**
 * O mestre conta a tentativa no paciente (contador da cena, que sobe a DT da próxima). Só conta
 * testes de quem é dono do curandeiro.
 */
async function countAttempt(message) {
  const flag = aidFlag(message);
  const healer = healerOf(message);
  if (!flag || !healer || !message.author || !healer.testUserPermission(message.author, 'OWNER')) {
    return;
  }
  const patient = await foundry.utils.fromUuid(flag.pacienteUuid);
  if (patient?.type !== 'personagem') return;
  await patient.update({ 'system.cena.primeirosSocorros': usesOf(patient) + 1 });
}

/** Registra os hooks e o socket (chamar uma vez, no `init`). */
export function registerFirstAidHooks() {
  Hooks.on('createChatMessage', (message) => {
    if (isActiveGM() && aidFlag(message)) enqueue(() => countAttempt(message));
  });
  Hooks.once('ready', () => {
    game.socket.on(SOCKET, (data) => {
      if (data?.action !== 'firstAid' || !isActiveGM()) return;
      enqueue(() => applyFirstAid(data));
    });
  });
}
