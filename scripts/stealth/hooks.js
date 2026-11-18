/* global document */
/**
 * Liga a cena de furtividade ao Foundry: redesenha a janela e o cartão das fichas quando o estado
 * muda, abre a janela sozinha para quem participa, coloca o botão na aba de combate e atende o
 * socket dos dados de esconderijo.
 */
import { shouldAutoOpen, trackerAction } from '../rolls/chase.js';
import { STEALTH_COMBAT_TYPE } from '../rolls/stealth.js';
import FurtividadeApp from './app.js';
import { HIDE_TEST_SOCKET_ACTION, handleHideTestSocket } from './hide-test.js';
import {
  HIDE_SOCKET_ACTION,
  SOCKET,
  createStealth,
  currentStealthAccess,
  findStealth,
  handleHideSocket,
  hideRevealed,
} from './store.js';

const t = (key) => game.i18n.localize(key);

/** O documento (Combat ou Combatant) pertence a uma cena de furtividade? */
function isStealthDocument(doc) {
  const combat = doc?.documentName === 'Combatant' ? doc.parent : doc;
  return combat?.type === STEALTH_COMBAT_TYPE;
}

/** Redesenha só o cartão de furtividade das fichas abertas. */
function refreshSheets() {
  for (const app of foundry.applications.instances.values()) {
    if (app.rendered && app.constructor.PARTS?.furtividade) app.render({ parts: ['furtividade'] });
  }
}

/**
 * Coloca na aba de combate o botão «Nova furtividade» (mestre, sem cena) ou «Abrir furtividade».
 * O Foundry redesenha a aba com frequência, então a barra é refeita a cada vez. Fica logo depois
 * da barra da perseguição, se ela existir.
 */
function injectTrackerBar(html) {
  const root = html?.querySelector ? html : html?.[0];
  if (!root) return;
  root.querySelector('.desordem-furtividade-barra')?.remove();

  const action = trackerAction(currentStealthAccess());
  if (!action) return;

  const bar = document.createElement('div');
  // Mesma aparência da barra da perseguição
  bar.className = 'desordem-perseguicao-barra desordem-furtividade-barra';
  const button = document.createElement('button');
  button.type = 'button';
  const icon = document.createElement('i');
  icon.className = 'fa-solid fa-user-secret';
  icon.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  label.textContent = t(
    action === 'criar' ? 'DESORDEM.Furtividade.Nova' : 'DESORDEM.Furtividade.Abrir',
  );
  button.append(icon, label);
  button.addEventListener('click', async () => {
    if (action === 'criar') await createStealth();
    await FurtividadeApp.open();
  });
  bar.append(button);

  const chaseBar = root.querySelector(
    '.desordem-perseguicao-barra:not(.desordem-furtividade-barra)',
  );
  const header = root.querySelector('[data-application-part="header"]');
  if (chaseBar) chaseBar.insertAdjacentElement('afterend', bar);
  else if (header) header.insertAdjacentElement('afterend', bar);
  else root.prepend(bar);
}

/** Registra os hooks da furtividade (chamado uma vez, no init). */
export function registerStealthHooks() {
  for (const name of [
    'createCombat',
    'updateCombat',
    'deleteCombat',
    'createCombatant',
    'updateCombatant',
    'deleteCombatant',
  ]) {
    Hooks.on(name, (doc) => {
      if (!isStealthDocument(doc)) return;
      FurtividadeApp.refresh();
      refreshSheets();
    });
  }

  // Cena apagada: o mestre esquece o que tinha revelado
  Hooks.on('deleteCombat', (combat) => {
    if (combat.type === STEALTH_COMBAT_TYPE) hideRevealed();
  });

  // Abertura automática da janela (mesmas regras da perseguição)
  Hooks.on('createCombat', (combat, options, userId) => {
    if (combat.type !== STEALTH_COMBAT_TYPE) return;
    const who = { isGM: game.user.isGM, isAuthor: userId === game.user.id, ownsParticipant: false };
    if (shouldAutoOpen('created', who)) FurtividadeApp.open();
  });

  Hooks.on('updateCombat', (combat, changes, options, userId) => {
    if (combat.type !== STEALTH_COMBAT_TYPE || changes.system?.ativa !== true) return;
    const who = {
      isGM: game.user.isGM,
      isAuthor: userId === game.user.id,
      ownsParticipant: combat.combatants.some((combatant) => combatant.actor?.isOwner),
    };
    if (shouldAutoOpen('started', who)) FurtividadeApp.open();
  });

  Hooks.on('createCombatant', (combatant) => {
    const combat = combatant.parent;
    if (combat?.type !== STEALTH_COMBAT_TYPE || !combat.system.ativa) return;
    const who = {
      isGM: game.user.isGM,
      isAuthor: false,
      ownsParticipant: Boolean(combatant.actor?.isOwner),
    };
    if (shouldAutoOpen('joined', who)) FurtividadeApp.open();
  });

  Hooks.on('renderCombatTracker', (app, html) => injectTrackerBar(html));
}

/** Socket: só o mestre ativo atende os pedidos dos jogadores sobre os dados de esconderijo. */
export function registerStealthSocket() {
  game.socket.on(SOCKET, async (data, userId) => {
    if (game.users.activeGM?.id !== game.user.id) return;
    if (data?.action === HIDE_SOCKET_ACTION) await handleHideSocket(data, userId);
    // Botão «Guardar dados de esconderijo» do cartão do teste (só o id da mensagem e os índices)
    if (data?.action === HIDE_TEST_SOCKET_ACTION) await handleHideTestSocket(data, userId);
  });
}

/** Interface para macros e testes no console: `game.desordem.furtividade`. */
export const stealthApi = {
  abrir: () => FurtividadeApp.open(),
  criar: () => createStealth(),
  encontrar: () => findStealth(),
};
