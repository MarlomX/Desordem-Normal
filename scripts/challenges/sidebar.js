/* global document */
/**
 * Guia «Desafios» da barra lateral (Foundry v13) e o plano B dela.
 *
 * Como a guia é registrada (o v13 não documenta um método para isso):
 * 1. No `init`, acrescenta uma entrada em `foundry.applications.sidebar.Sidebar.TABS` (o registro
 *    estático das abas: ícone e dica de cada uma) e reordena as chaves para a guia ficar logo
 *    depois de Cenas. É esse registro que desenha o botão da guia na barra.
 * 2. No `ready`, cria a aplicação da guia (`ui.desafios`), uma subclasse de `AbstractSidebarTab`
 *    com `tabName = 'desafios'`, e a desenha. O Foundry põe o conteúdo dentro da barra lateral.
 *
 * Plano B: se algo disso falhar (a API mudou, por exemplo), a mesma lista abre numa janela
 * flutuante, por um botão na aba de combate e por `game.desordem.desafios.abrir()`.
 *
 * O conteúdo (template, dados e ações) é o mesmo nos dois casos.
 */
import { SYSTEM_ID } from '../config.js';
import {
  CHALLENGE_TYPES,
  MAX_CHALLENGES,
  TYPE_ICONS,
  challengeView,
  sidebarOrder,
  updateChallengeField,
  visibleChallenges,
} from '../rolls/challenge.js';
import { lockStatus } from '../rolls/lock.js';
import DesafioApp, { confirmDeleteChallenge } from './app.js';
import QuadroApp from './board-app.js';
import { actorInfo, createChallenge, mutateChallenge, readChallenges } from './store.js';

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

const t = (key) => game.i18n.localize(key);

/** Nome da guia (chave em `Sidebar.TABS` e em `ui`). */
export const TAB_NAME = 'desafios';

const TEMPLATE = `systems/${SYSTEM_ID}/templates/desafios/guia.hbs`;

/**
 * Situação da guia: 'pendente' (antes do ready), 'ok' (a guia funciona) ou 'falhou' (vale o plano
 * B). O botão da aba de combate só aparece com 'falhou', para não piscar enquanto o mundo carrega.
 */
let tabState = 'pendente';

/** Dados da lista (iguais na guia e na janela flutuante). */
async function listContext() {
  const isGM = game.user.isGM;
  const data = readChallenges();
  return {
    isGM,
    podeCriar: isGM && data.desafios.length < MAX_CHALLENGES,
    // Botões de criar: um por tipo de desafio
    // Chaves montadas aqui (conferidas à mão): DESORDEM.Desafio.Tipo.{estendido,arrombar,escalar}
    tipos: CHALLENGE_TYPES.map((tipo) => ({
      tipo,
      icone: TYPE_ICONS[tipo],
      rotulo: t(`DESORDEM.Desafio.Tipo.${tipo}`),
    })),
    // Jogador: vê os desafios «todos» e os «participantes» em que controla algum personagem
    desafios: visibleChallenges(data, {
      isGM,
      ownedActorIds: isGM ? [] : game.actors.filter((actor) => actor.isOwner).map((a) => a.id),
    }).map((challenge) => ({
      ...challengeView(challenge, { isGM, actorInfo }),
      icone: TYPE_ICONS[challenge.tipo] ?? TYPE_ICONS.estendido,
      tipoRotulo: t(`DESORDEM.Desafio.Tipo.${challenge.tipo}`),
      // Selo para o mestre: quem mais vê este desafio (chave montada, conferida à mão:
      // DESORDEM.Desafio.Visibilidade.{participantes,mestre})
      seloVisibilidade:
        isGM && challenge.visibilidade !== 'todos'
          ? t(`DESORDEM.Desafio.Visibilidade.${challenge.visibilidade}`)
          : '',
      // Chave montada (conferida à mão): DESORDEM.Desafio.Unidade.{tipo}
      unidade: t(`DESORDEM.Desafio.Unidade.${challenge.tipo}`),
      // Destrancar: selo de fechadura estragada (o «concluído» já vem da vista)
      estragada: challenge.tipo === 'destrancar' && lockStatus(challenge.fechadura) === 'estragada',
    })),
  };
}

/** Ações dos botões da lista (só o mestre vê os botões; os handlers conferem de novo). */
const LIST_ACTIONS = {
  /**
   * Novo desafio do tipo do botão (teste estendido, arrombar ou escalar): cria com os padrões do
   * tipo e abre a janela dele. O nome padrão é o nome do tipo.
   */
  async newChallenge(event, target) {
    if (!game.user.isGM) return;
    const tipo = CHALLENGE_TYPES.includes(target.dataset.tipo) ? target.dataset.tipo : 'estendido';
    // Chaves montadas aqui (conferidas à mão): DESORDEM.Desafio.Tipo.{estendido,arrombar,escalar}
    const id = await createChallenge(t(`DESORDEM.Desafio.Tipo.${tipo}`), tipo);
    if (id) await DesafioApp.open(id);
  },
  async openChallenge(event, target) {
    await DesafioApp.open(target.dataset.challengeId);
  },
  async toggleActive(event, target) {
    await mutateChallenge(target.dataset.challengeId, (challenge) =>
      updateChallengeField(challenge, 'ativo', !challenge.ativo),
    );
  },
  /** Destrancar: o quadro de teoria (qualquer um pode olhar; participantes e mestre editam). */
  async openLockBoard(event, target) {
    await QuadroApp.open(target.dataset.challengeId);
  },
  async deleteChallenge(event, target) {
    await confirmDeleteChallenge(target.dataset.challengeId);
  },
};

/** Janela flutuante com a lista (plano B, e para abrir pelo console ou por macro). */
export class DesafiosListaApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static #instance = null;

  static DEFAULT_OPTIONS = {
    id: 'desordem-desafios-lista',
    classes: ['desordem-normal', 'perseguicao', 'desordem-desafios-lista'],
    position: { width: 360, height: 520 },
    window: { title: 'DESORDEM.Desafio.Guia', icon: 'fa-solid fa-flag-checkered', resizable: true },
    actions: LIST_ACTIONS,
  };

  static PARTS = { lista: { template: TEMPLATE, scrollable: [''] } };

  static async open() {
    DesafiosListaApp.#instance ??= new DesafiosListaApp();
    await DesafiosListaApp.#instance.render({ force: true });
    DesafiosListaApp.#instance.bringToFront?.();
    return DesafiosListaApp.#instance;
  }

  static refresh() {
    if (DesafiosListaApp.#instance?.rendered) DesafiosListaApp.#instance.render();
  }

  async _prepareContext(options) {
    return { ...(await super._prepareContext(options)), ...(await listContext()) };
  }
}

/**
 * Classe da guia, criada só quando a API existe (assim um Foundry sem ela não quebra ao
 * carregar o sistema: vale o plano B).
 */
function defineTabClass() {
  const AbstractSidebarTab = foundry.applications.sidebar?.AbstractSidebarTab;
  if (!AbstractSidebarTab) return null;
  return class DesafiosGuia extends HandlebarsApplicationMixin(AbstractSidebarTab) {
    /** Nome da guia: o Foundry liga o botão da barra a esta aplicação por ele. */
    static tabName = TAB_NAME;

    static DEFAULT_OPTIONS = {
      classes: ['desordem-normal', 'desordem-desafios-guia'],
      window: { title: 'DESORDEM.Desafio.Guia' },
      actions: LIST_ACTIONS,
    };

    static PARTS = { lista: { template: TEMPLATE, scrollable: [''] } };

    async _prepareContext(options) {
      return { ...(await super._prepareContext(options)), ...(await listContext()) };
    }
  };
}

/**
 * Passo 1 (init): registra o botão da guia em `Sidebar.TABS`, logo depois de Cenas. O objeto é
 * reordenado no lugar (apaga e recoloca as chaves na ordem nova), porque é a ordem das chaves que
 * define a ordem dos botões.
 */
export function registerChallengeTab() {
  const Sidebar = foundry.applications.sidebar?.Sidebar;
  if (!Sidebar?.TABS || !foundry.applications.sidebar?.AbstractSidebarTab) {
    console.warn(`${SYSTEM_ID} | barra lateral sem a API esperada: desafios em janela flutuante`);
    return;
  }
  try {
    const tabs = Sidebar.TABS;
    const entries = { ...tabs };
    entries[TAB_NAME] = { icon: 'fa-solid fa-flag-checkered', tooltip: 'DESORDEM.Desafio.Guia' };
    const order = sidebarOrder(Object.keys(entries), TAB_NAME);
    for (const key of Object.keys(tabs)) delete tabs[key];
    for (const key of order) tabs[key] = entries[key];
  } catch (error) {
    console.warn(`${SYSTEM_ID} | não foi possível registrar a guia de desafios`, error);
  }
}

/**
 * Passo 2 (ready): cria e desenha a aplicação da guia. Se não der certo, liga o plano B (botão
 * na aba de combate) e redesenha a aba de combate para o botão aparecer.
 */
export async function startChallengeTab() {
  const Tab = defineTabClass();
  if (Tab && foundry.applications.sidebar?.Sidebar?.TABS?.[TAB_NAME]) {
    try {
      ui[TAB_NAME] ??= new Tab();
      await ui[TAB_NAME].render({ force: true });
      tabState = ui[TAB_NAME].rendered ? 'ok' : 'falhou';
    } catch (error) {
      console.warn(
        `${SYSTEM_ID} | a guia de desafios não abriu: desafios em janela flutuante`,
        error,
      );
      tabState = 'falhou';
    }
  } else {
    tabState = 'falhou';
  }
  if (tabState === 'falhou') ui.combat?.render();
}

/** Redesenha a guia e a janela flutuante (chamado quando os desafios mudam). */
export function refreshChallengeList() {
  if (tabState === 'ok' && ui[TAB_NAME]?.rendered) ui[TAB_NAME].render();
  DesafiosListaApp.refresh();
}

/** Mostra a lista: ativa a guia na barra lateral ou, no plano B, abre a janela flutuante. */
export async function showChallengeList() {
  if (tabState === 'ok' && ui[TAB_NAME]) {
    try {
      ui.sidebar?.expand?.();
      ui[TAB_NAME].activate();
      return;
    } catch (error) {
      console.warn(`${SYSTEM_ID} | não foi possível ativar a guia de desafios`, error);
    }
  }
  await DesafiosListaApp.open();
}

/** Plano B: botão «Desafios» na aba de combate (só se a guia da barra lateral não funcionou). */
export function injectFallbackBar(html) {
  const root = html?.querySelector ? html : html?.[0];
  if (!root) return;
  root.querySelector('.desordem-desafios-barra')?.remove();
  if (tabState !== 'falhou') return;

  const bar = document.createElement('div');
  bar.className = 'desordem-perseguicao-barra desordem-desafios-barra';
  const button = document.createElement('button');
  button.type = 'button';
  const icon = document.createElement('i');
  icon.className = 'fa-solid fa-flag-checkered';
  icon.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  label.textContent = t('DESORDEM.Desafio.Abrir');
  button.append(icon, label);
  button.addEventListener('click', () => DesafiosListaApp.open());
  bar.append(button);

  // Depois das barras da perseguição e da furtividade (se houver), senão logo após o cabeçalho
  const anchors = root.querySelectorAll('.desordem-perseguicao-barra');
  const last = anchors[anchors.length - 1];
  const header = root.querySelector('[data-application-part="header"]');
  if (last) last.insertAdjacentElement('afterend', bar);
  else if (header) header.insertAdjacentElement('afterend', bar);
  else root.prepend(bar);
}
