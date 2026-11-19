/* global document */
/**
 * Combate por fases na aba de combate do Foundry. Não substitui o rastreador: a cada desenho dele
 * (hook `renderCombatTracker`), acrescenta a barra da fase atual e separa as linhas dos
 * combatentes, que o Foundry já montou, em quatro áreas: «Fase geral», «Ataques à distância»,
 * «Corpo a corpo» e «Não agiu». As linhas são movidas, não recriadas, então o menu do botão
 * direito, o destaque do token e os botões de ocultar e de derrotado continuam sendo do Foundry.
 *
 * Só o mestre muda as fases (botões em cada linha e ◀ ▶ na barra); os jogadores veem. A lógica
 * fica em `rolls/phases.js`. Perseguição e furtividade (combates de tipo próprio) não mudam.
 */
import { SYSTEM_ID } from '../config.js';
import {
  AREAS,
  NOT_ACTED,
  PHASES,
  actedBefore,
  currentPhase,
  groupByArea,
  isPhaseCombat,
  movePhase,
  shiftPhase,
} from '../rolls/phases.js';

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

/** Classe posta na raiz do rastreador quando as fases estão ligadas (o CSS esconde a iniciativa). */
const ROOT_CLASS = 'desordem-combate-fases';

/** Ícones dos botões de cada área (Font Awesome). */
const AREA_ICONS = {
  geral: 'fa-person-walking',
  distancia: 'fa-crosshairs',
  corpo: 'fa-hand-fist',
  nenhuma: 'fa-rotate-left',
};

/** Registro da fase atual guardado no combate. */
const combatFlag = (combat) => combat.getFlag(SYSTEM_ID, 'fase');

/** Registro das fases em que o combatente agiu, guardado nele. */
const combatantFlag = (combatant) => combatant.getFlag(SYSTEM_ID, 'fases');

/** Cria um elemento com classe e, se houver, texto. */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Ícone do Font Awesome. */
function icon(name) {
  const node = el('i', `fa-solid ${name}`);
  node.setAttribute('aria-hidden', 'true');
  return node;
}

/**
 * Impede que o clique num botão nosso chegue à linha do combatente (o Foundry usaria o clique
 * para selecionar o token ou abrir a ficha).
 */
function isolate(button) {
  for (const type of ['pointerdown', 'mousedown', 'dblclick', 'contextmenu']) {
    button.addEventListener(type, (event) => event.stopPropagation());
  }
}

/** O mestre troca a fase atual (◀ volta, ▶ avança). */
async function stepCombatPhase(combat, delta) {
  if (!game.user.isGM) return;
  await combat.update({
    [`flags.${SYSTEM_ID}.fase`]: shiftPhase(combatFlag(combat), combat.round, delta),
  });
}

/**
 * O mestre põe o combatente numa área. Clique: move (corrige); Shift+clique: soma a fase às que
 * ele já tinha nesta rodada (Prontidão), com um aviso.
 */
async function moveCombatant(combatant, target, add) {
  if (!game.user.isGM) return;
  const combat = combatant.parent;
  const entry = combatantFlag(combatant);
  if (add && actedBefore(entry, combat.round, target)) {
    ui.notifications.info(t('DESORDEM.Combate.SegundaFase', { nome: combatant.name }));
  }
  await combatant.update({
    [`flags.${SYSTEM_ID}.fases`]: movePhase(entry, combat.round, target, { add }),
  });
}

/** Barra do topo: rodada, fase atual e, para o mestre, os botões de trocar de fase. */
function buildPhaseBar(combat) {
  const phase = currentPhase(combatFlag(combat), combat.round);
  const bar = el('div', 'desordem-fases-barra');
  bar.dataset.fase = phase;

  const info = el('div', 'desordem-fases-barra__info');
  const round = combat.round > 0 ? t('DESORDEM.Combate.Rodada', { n: combat.round }) : '';
  if (round) info.append(el('span', 'desordem-fases-barra__rodada', round));
  info.append(el('strong', 'desordem-fases-barra__fase', t(`DESORDEM.Combate.Fase.${phase}`)));

  const steps = el('ol', 'desordem-fases-barra__passos');
  for (const key of PHASES) {
    const item = el('li', 'desordem-fases-barra__passo');
    item.classList.toggle('is-atual', key === phase);
    item.classList.toggle('is-passada', PHASES.indexOf(key) < PHASES.indexOf(phase));
    item.title = t(`DESORDEM.Combate.Fase.${key}`);
    item.append(icon(AREA_ICONS[key]));
    steps.append(item);
  }

  if (game.user.isGM) {
    const back = el('button', 'desordem-fases-barra__botao');
    back.type = 'button';
    back.title = t('DESORDEM.Combate.FaseAnterior');
    back.append(icon('fa-caret-left'));
    back.disabled = phase === PHASES[0];
    back.addEventListener('click', () => stepCombatPhase(combat, -1));
    const next = el('button', 'desordem-fases-barra__botao');
    next.type = 'button';
    next.title = t('DESORDEM.Combate.ProximaFase');
    next.append(icon('fa-caret-right'));
    next.disabled = phase === PHASES[PHASES.length - 1];
    next.addEventListener('click', () => stepCombatPhase(combat, 1));
    bar.append(back, info, steps, next);
  } else {
    bar.append(info, steps);
  }
  if (combat.round === 0) {
    bar.append(el('p', 'desordem-fases-barra__dica', t('DESORDEM.Combate.DicaIniciar')));
  }
  return bar;
}

/** Botões do mestre numa linha de combatente (uma área por botão). */
function buildRowControls(combatant, area) {
  const box = el('div', 'desordem-fases-ctl');
  for (const key of AREAS) {
    const button = el('button', 'desordem-fases-ctl__botao');
    button.type = 'button';
    button.classList.toggle('is-atual', key === area);
    button.title =
      key === NOT_ACTED ? t('DESORDEM.Combate.Limpar') : t(`DESORDEM.Combate.Mover.${key}`);
    button.append(icon(AREA_ICONS[key]));
    isolate(button);
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      moveCombatant(combatant, key, event.shiftKey && key !== NOT_ACTED);
    });
    box.append(button);
  }
  return box;
}

/** Selo «também agiu na fase geral» de quem agiu em mais de uma fase. */
function earlierBadge(phases) {
  const names = phases.map((phase) => t(`DESORDEM.Combate.Fase.${phase}`)).join(', ');
  const badge = el(
    'span',
    'desordem-fases-selo',
    t('DESORDEM.Combate.TambemAgiu', { fases: names }),
  );
  return badge;
}

/**
 * Desfaz a separação anterior: devolve as linhas à lista original (sem os nossos botões e selos)
 * e apaga as áreas. Num desenho que só refaz outra parte do rastreador (o cabeçalho, por exemplo),
 * as linhas antigas continuam valendo e não podem sumir junto com as áreas.
 */
function restoreRows(root) {
  const container = root.querySelector('.desordem-fases');
  if (!container) return;
  const original = root.querySelector('.desordem-fases__original');
  for (const row of container.querySelectorAll('[data-combatant-id]')) {
    row.querySelectorAll('.desordem-fases-ctl, .desordem-fases-selo').forEach((n) => n.remove());
    original?.append(row);
  }
  original?.classList.remove('desordem-fases__original');
  container.remove();
}

/**
 * Hook `renderCombatTracker`: liga as fases no rastreador do combate visto (se for um combate
 * comum). O Foundry redesenha a aba com frequência, então tudo é refeito a cada vez.
 * @param {object} app O rastreador (`ui.combat` ou a janela destacada).
 * @param {HTMLElement} html
 */
export function renderPhaseTracker(app, html) {
  const root = html?.querySelector ? html : html?.[0];
  if (!root) return;
  root.querySelector('.desordem-fases-barra')?.remove();
  restoreRows(root);
  root.classList.remove(ROOT_CLASS);

  const combat = app?.viewed;
  if (!combat || !isPhaseCombat(combat.type)) return;
  root.classList.add(ROOT_CLASS);

  // Barra da fase (fica mesmo que a separação em áreas não encontre as linhas)
  const header = root.querySelector('[data-application-part="header"]');
  const bar = buildPhaseBar(combat);
  if (header) header.insertAdjacentElement('afterend', bar);
  else root.prepend(bar);

  // Linhas dos combatentes que o Foundry desenhou (os ocultos não aparecem para os jogadores)
  const rows = [...root.querySelectorAll('[data-combatant-id]')].filter((row) =>
    combat.combatants.has(row.dataset.combatantId),
  );
  if (!rows.length) return;
  const list = rows[0].parentElement;

  const { areas, earlier } = groupByArea(
    rows.map((row) => ({
      id: row.dataset.combatantId,
      entry: combatantFlag(combat.combatants.get(row.dataset.combatantId)),
    })),
    combat.round,
  );
  const byId = new Map(rows.map((row) => [row.dataset.combatantId, row]));
  const phase = currentPhase(combatFlag(combat), combat.round);

  const container = el('div', 'desordem-fases');
  for (const area of AREAS) {
    const section = el('section', `desordem-fases__area desordem-fases__area--${area}`);
    section.classList.toggle('is-atual', area === phase);
    const title = el('h4', 'desordem-fases__titulo');
    title.append(icon(AREA_ICONS[area]), el('span', '', t(`DESORDEM.Combate.Area.${area}`)));
    title.append(el('span', 'desordem-fases__contagem', String(areas[area].length)));
    // Mesma lista (e mesmas classes) do Foundry, para as linhas manterem a aparência
    const ol = el(list.tagName.toLowerCase(), list.className);
    ol.classList.add('desordem-fases__lista');
    for (const id of areas[area]) {
      const row = byId.get(id);
      const combatant = combat.combatants.get(id);
      if (earlier[id]) row.append(earlierBadge(earlier[id]));
      if (game.user.isGM) row.append(buildRowControls(combatant, area));
      ol.append(row);
    }
    if (!areas[area].length)
      ol.append(el('li', 'desordem-fases__vazia', t('DESORDEM.Combate.Vazia')));
    section.append(title, ol);
    container.append(section);
  }
  // A lista original fica vazia e escondida (o Foundry ainda pode procurá-la)
  list.classList.add('desordem-fases__original');
  list.insertAdjacentElement('beforebegin', container);
}

/** Registra o hook (chamar uma vez, no `init`, depois dos da perseguição e da furtividade). */
export function registerPhaseTracker() {
  Hooks.on('renderCombatTracker', (app, html) => renderPhaseTracker(app, html));
}
