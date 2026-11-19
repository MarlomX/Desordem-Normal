/**
 * Liga os desafios ao Foundry: a configuração do mundo, a guia da barra lateral (com o plano B),
 * o redesenho das janelas e das fichas quando os desafios mudam, e a interface para macros.
 */
import DesafioApp from './app.js';
import { registerChallengeSocket } from './test-card.js';
import {
  DesafiosListaApp,
  injectFallbackBar,
  refreshChallengeList,
  registerChallengeTab,
  showChallengeList,
  startChallengeTab,
} from './sidebar.js';
import {
  createChallenge,
  onChallengesChange,
  readChallenges,
  registerChallengeSetting,
} from './store.js';

/** Redesenha só o cartão de desafios das fichas abertas (as demais partes ficam como estão). */
function refreshSheets() {
  for (const app of foundry.applications.instances.values()) {
    if (app.rendered && app.constructor.PARTS?.desafios) app.render({ parts: ['desafios'] });
  }
}

/** Registra tudo que precisa existir antes do mundo carregar (chamado uma vez, no init). */
export function registerChallenges() {
  registerChallengeSetting();
  registerChallengeTab();
  onChallengesChange(() => {
    refreshChallengeList();
    DesafioApp.refreshAll();
    refreshSheets();
  });
  // Um ator renomeado (ou com outra imagem) ou apagado muda o que a lista mostra
  const hasChallenges = () => readChallenges().desafios.length > 0;
  Hooks.on('updateActor', (actor, changes) => {
    if (('name' in changes || 'img' in changes) && hasChallenges()) refreshChallengeList();
  });
  Hooks.on('deleteActor', () => {
    if (hasChallenges()) refreshChallengeList();
  });
  // Plano B: o botão na aba de combate (só aparece se a guia não funcionou)
  Hooks.on('renderCombatTracker', (app, html) => injectFallbackBar(html));
}

/** Depois que o mundo carregou (ready): cria e desenha a guia. */
export async function readyChallenges() {
  // Botão «somar pontos» do cartão do teste estendido (o mestre ativo atende os jogadores)
  registerChallengeSocket();
  await startChallengeTab();
}

/** Interface para macros e testes no console: `game.desordem.desafios`. */
export const challengeApi = {
  abrir: () => showChallengeList(),
  janela: () => DesafiosListaApp.open(),
  criar: (nome) => createChallenge(nome),
  editar: (id) => DesafioApp.open(id),
  listar: () => readChallenges().desafios,
};
