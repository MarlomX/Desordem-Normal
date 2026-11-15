/* global document */
/**
 * Liga a perseguição ao Foundry: redesenha a janela e as fichas quando o estado muda, abre a
 * janela sozinha para quem participa e coloca o botão na aba de combate.
 */
import { PERICIAS } from '../config.js';
import {
  CHASE_COMBAT_TYPE,
  sanitizeParticipantPatch,
  shouldAutoOpen,
  trackerAction,
} from '../rolls/chase.js';
import PerseguicaoApp from './app.js';
import { SOCKET, createChase, currentAccess, findChase } from './store.js';

const t = (key) => game.i18n.localize(key);

/** O documento (Combat ou Combatant) pertence a uma perseguição? */
function isChaseDocument(doc) {
  const combat = doc?.documentName === 'Combatant' ? doc.parent : doc;
  return combat?.type === CHASE_COMBAT_TYPE;
}

/** Redesenha só o cartão de perseguição das fichas abertas (as demais partes ficam como estão). */
function refreshSheets() {
  for (const app of foundry.applications.instances.values()) {
    if (app.rendered && app.constructor.PARTS?.perseguicao) app.render({ parts: ['perseguicao'] });
  }
}

/** Atualiza tudo que mostra o estado da perseguição. */
function refreshAll() {
  PerseguicaoApp.refresh();
  refreshSheets();
}

/**
 * Coloca na aba de combate o botão "Nova perseguição" (mestre, sem perseguição) ou "Abrir
 * perseguição". O Foundry redesenha a aba com frequência, então a barra é refeita a cada vez.
 */
function injectTrackerBar(html) {
  const root = html?.querySelector ? html : html?.[0];
  if (!root) return;
  root.querySelector('.desordem-perseguicao-barra')?.remove();

  const action = trackerAction(currentAccess());
  if (!action) return;

  const bar = document.createElement('div');
  bar.className = 'desordem-perseguicao-barra';
  const button = document.createElement('button');
  button.type = 'button';
  const icon = document.createElement('i');
  icon.className = 'fa-solid fa-person-running';
  icon.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  label.textContent = t(
    action === 'criar' ? 'DESORDEM.Perseguicao.Nova' : 'DESORDEM.Perseguicao.Abrir',
  );
  button.append(icon, label);
  button.addEventListener('click', async () => {
    if (action === 'criar') await createChase();
    await PerseguicaoApp.open();
  });
  bar.append(button);

  const header = root.querySelector('[data-application-part="header"]');
  if (header) header.insertAdjacentElement('afterend', bar);
  else root.prepend(bar);
}

/** Registra todos os hooks da perseguição (chamado uma vez, no init). */
export function registerChaseHooks() {
  for (const name of [
    'createCombat',
    'updateCombat',
    'deleteCombat',
    'createCombatant',
    'updateCombatant',
    'deleteCombatant',
  ]) {
    Hooks.on(name, (doc) => {
      if (isChaseDocument(doc)) refreshAll();
    });
  }

  // Abertura automática da janela
  Hooks.on('createCombat', (combat, options, userId) => {
    if (combat.type !== CHASE_COMBAT_TYPE) return;
    const who = { isGM: game.user.isGM, isAuthor: userId === game.user.id, ownsParticipant: false };
    if (shouldAutoOpen('created', who)) PerseguicaoApp.open();
  });

  Hooks.on('updateCombat', (combat, changes, options, userId) => {
    if (combat.type !== CHASE_COMBAT_TYPE || changes.system?.ativa !== true) return;
    const who = {
      isGM: game.user.isGM,
      isAuthor: userId === game.user.id,
      ownsParticipant: combat.combatants.some((combatant) => combatant.actor?.isOwner),
    };
    if (shouldAutoOpen('started', who)) PerseguicaoApp.open();
  });

  Hooks.on('createCombatant', (combatant) => {
    const combat = combatant.parent;
    if (combat?.type !== CHASE_COMBAT_TYPE || !combat.system.ativa) return;
    const who = {
      isGM: game.user.isGM,
      isAuthor: false,
      ownsParticipant: Boolean(combatant.actor?.isOwner),
    };
    if (shouldAutoOpen('joined', who)) PerseguicaoApp.open();
  });

  // Botão na aba de combate
  Hooks.on('renderCombatTracker', (app, html) => injectTrackerBar(html));
}

/**
 * Socket: quando um jogador não pode editar o próprio participante, pede ao mestre ativo que
 * grave. O mestre confere que o pedido vem de um dono do personagem e limpa os dados recebidos.
 */
export function registerChaseSocket() {
  game.socket.on(SOCKET, async (data, userId) => {
    if (data?.action !== 'chaseParticipant') return;
    if (game.users.activeGM?.id !== game.user.id) return;
    const combat = game.combats.get(data.combatId);
    if (combat?.type !== CHASE_COMBAT_TYPE) return;
    const combatant = combat.combatants.get(data.combatantId);
    const requester = game.users.get(userId);
    if (!combatant?.actor || !requester) return;
    if (!combatant.actor.testUserPermission(requester, 'OWNER')) return;
    const patch = sanitizeParticipantPatch(data.patch, Object.keys(PERICIAS));
    if (Object.keys(patch).length) await combatant.update({ system: patch });
  });
}

/** Interface para macros e testes no console: `game.desordem.perseguicao`. */
export const chaseApi = {
  abrir: () => PerseguicaoApp.open(),
  criar: () => createChase(),
  encontrar: () => findChase(),
};
