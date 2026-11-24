/* global document */
/**
 * Liga a perseguição ao Foundry: redesenha a janela e as fichas quando o estado muda, abre a
 * janela sozinha para quem participa e coloca o botão na aba de combate.
 */
import {
  CHASE_COMBAT_TYPE,
  sanitizeParticipantPatch,
  shouldAutoOpen,
  trackerAction,
} from '../rolls/chase.js';
import { applyAdvancePoints } from './advance-card.js';
import PerseguicaoApp from './app.js';
import PontosApp from './points-app.js';
import { applyPenalty } from './penalty-card.js';
import { createChase, currentAccess, findChase } from './store.js';
import { t } from '../shared/i18n.js';
import { onSocketAction } from '../shared/socket.js';
import { refreshOpenSheets } from '../shared/sheets.js';

/** O documento (Combat ou Combatant) pertence a uma perseguição? */
function isChaseDocument(doc) {
  const combat = doc?.documentName === 'Combatant' ? doc.parent : doc;
  return combat?.type === CHASE_COMBAT_TYPE;
}

/** Atualiza tudo que mostra o estado da perseguição. */
function refreshAll() {
  PerseguicaoApp.refresh();
  // Só o cartão de perseguição das fichas abertas (as demais partes ficam como estão)
  refreshOpenSheets(['perseguicao']);
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
      if (!isChaseDocument(doc)) return;
      refreshAll();
      // A janela dos pontos só depende do encontro (os pontos), não dos participantes
      if (doc.documentName === 'Combat') PontosApp.refresh();
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
  // Botão "adicionar PA" do cartão do teste de avanço (só o id da mensagem vem do jogador)
  onSocketAction('chaseAdvancePoints', (data, userId) =>
    applyAdvancePoints(game.messages.get(data.messageId), userId),
  );
  // Botão «Aplicar penalidade» do cartão do chat (só os ids vêm do jogador)
  onSocketAction('chasePenalty', (data, userId) =>
    applyPenalty(game.messages.get(data.messageId), data.combatantId, userId),
  );
  // PA, fôlego ou «já agiu» de um participante, pedido por um dono do personagem
  onSocketAction('chaseParticipant', async (data, userId) => {
    const combat = game.combats.get(data.combatId);
    if (combat?.type !== CHASE_COMBAT_TYPE) return;
    const combatant = combat.combatants.get(data.combatantId);
    const requester = game.users.get(userId);
    if (!combatant?.actor || !requester) return;
    if (!combatant.actor.testUserPermission(requester, 'OWNER')) return;
    const patch = sanitizeParticipantPatch(data.patch);
    if (Object.keys(patch).length) await combatant.update({ system: patch });
  });
}

/** Interface para macros e testes no console: `game.desordem.perseguicao`. */
export const chaseApi = {
  abrir: () => PerseguicaoApp.open(),
  criar: () => createChase(),
  encontrar: () => findChase(),
};
