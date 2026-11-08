/**
 * Ligação ao Foundry das habilidades: ímpeto, análise, repetir dado, esquiva, cura, ativações para
 * o próximo teste e reinício de cena. Os botões de análise e de repetir dado aparecem nos cartões
 * de teste, só para quem pode usá-los.
 */
import { SYSTEM_ID, ATRIBUTOS } from '../config.js';
import { render, postMessage, rollSkill, rebuildTest } from './chat.js';
import {
  COSTS,
  ANALISE_MAX,
  hasAbility,
  gainAnalysis,
  applyAnalysis,
  rerollCandidates,
  replaceDie,
  sceneReset,
} from './abilities.js';

const TEMPLATE_HABILIDADE = `systems/${SYSTEM_ID}/templates/chat/habilidade.hbs`;
const TEMPLATE_CURA = `systems/${SYSTEM_ID}/templates/chat/cura.hbs`;
const SOCKET = `system.${SYSTEM_ID}`;

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const warn = (key, data) => ui.notifications.warn(t(key, data));

/** Aviso curto de uma habilidade no chat. */
export async function abilityNote(actor, text, detail = '', rolls = []) {
  return postMessage({
    actor,
    content: await render(TEMPLATE_HABILIDADE, { name: actor.name, text, detail }),
    rolls,
  });
}

/** Diálogo simples com um campo; devolve o valor escolhido ou null se for cancelado. */
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

// ---------- Ativações para o próximo teste ----------

/** Liga ou desliga uma habilidade para o próximo teste (dado extra de ímpeto, dado furtivo). */
export async function toggleActive(actor, key) {
  const active = actor.toObject().system.ativas;
  const on = active.includes(key);
  if (!on && key === 'impetoDado' && actor.system.recursos.impeto < COSTS.impetoDado) {
    warn('DESORDEM.Habilidade.ImpetoInsuficiente');
    return;
  }
  await actor.update({ 'system.ativas': on ? active.filter((k) => k !== key) : [...active, key] });
}

// ---------- Ímpeto ----------

/** Gasta 3 espaços de ímpeto para subir um passo o dado de um atributo até o fim da cena. */
export async function impetoStep(actor) {
  const bar = actor.system.recursos.impeto;
  if (bar < COSTS.impetoPasso) return warn('DESORDEM.Habilidade.ImpetoInsuficiente');
  const options = ATRIBUTOS.map(
    (key) => `<option value="${key}">${t(`DESORDEM.Atributos.${key}`)}</option>`,
  ).join('');
  const attribute = await ask({
    title: t('DESORDEM.Habilidade.ImpetoPassoTitulo'),
    content: `<label>${t('DESORDEM.Habilidade.ImpetoPassoEscolha')} <select name="atributo">${options}</select></label>`,
    read: (form) => form.elements.atributo.value,
  });
  if (!attribute) return undefined;
  const effects = [
    ...actor.toObject().system.efeitos,
    {
      nome: t('DESORDEM.Habilidade.EfeitoImpeto'),
      descricao: t('DESORDEM.Habilidade.EfeitoImpetoDescricao'),
      atributo: attribute,
      passos: 1,
      fimDeCena: true,
    },
  ];
  await actor.update({
    'system.recursos.impeto': bar - COSTS.impetoPasso,
    'system.efeitos': effects,
  });
  return abilityNote(
    actor,
    t('DESORDEM.Habilidade.ImpetoPassoTexto', { atributo: t(`DESORDEM.Atributos.${attribute}`) }),
  );
}

/** Gasta 3 espaços de ímpeto para uma ação extra (só narrativa: avisa o mestre no chat). */
export async function impetoAction(actor) {
  const bar = actor.system.recursos.impeto;
  if (bar < COSTS.impetoAcao) return warn('DESORDEM.Habilidade.ImpetoInsuficiente');
  await actor.update({ 'system.recursos.impeto': bar - COSTS.impetoAcao });
  return abilityNote(
    actor,
    t('DESORDEM.Habilidade.ImpetoAcaoTexto'),
    t('DESORDEM.Habilidade.ImpetoAcaoDetalhe'),
  );
}

// ---------- Análise ----------

/** Gasta uma ação para ganhar 2 marcadores de análise (até 4). */
export async function gainAnalysisMarkers(actor) {
  const before = actor.system.recursos.analise;
  const after = gainAnalysis(before);
  await actor.update({ 'system.recursos.analise': after });
  return abilityNote(
    actor,
    t('DESORDEM.Habilidade.AnaliseGanha', { valor: after - before }),
    `${after}/${ANALISE_MAX}`,
  );
}

// ---------- Esquiva ----------

/** Teste de Acrobacia da esquiva (livre, oposto ao ataque; a comparação é feita pela mesa). */
export function rollDodge(actor, options = {}) {
  return rollSkill(actor, 'acrobacia', {
    ...options,
    showDt: false,
    label: `${actor.name}: ${t('DESORDEM.Habilidade.EsquivaTitulo')}`,
  });
}

// ---------- Cura de aliado ----------

/**
 * Cura um aliado (o token mirado): gasta PD e faz um teste de Medicina; se passar, o cartão traz o
 * botão de recuperar PV (igual à rolagem alta, somando as duas maiores em crítico) que o aliado
 * clica. Cada aliado só pode ser curado uma vez por cena.
 */
export async function healAlly(actor) {
  const target = [...game.user.targets][0]?.actor;
  if (!target) return warn('DESORDEM.Habilidade.CuraSemAlvo');
  if (target.id === actor.id) return warn('DESORDEM.Habilidade.CuraEmSi');
  if (actor.system.cena.curados.includes(target.id)) {
    return warn('DESORDEM.Habilidade.CuraJaCurou', { nome: target.name });
  }
  if (actor.system.pd.value < COSTS.curandeiro) return warn('DESORDEM.Habilidade.CuraSemPD');
  await actor.update({
    'system.pd.value': actor.system.pd.value - COSTS.curandeiro,
    'system.cena.curados': [...actor.toObject().system.cena.curados, target.id],
  });
  const result = await rollSkill(actor, 'medicina', { dt: 7 });
  if (!result.success) return result;
  await postMessage({
    actor,
    content: await render(TEMPLATE_CURA, {
      actorName: actor.name,
      alvo: target.name,
      total: result.highSum,
      resourceLabel: t('DESORDEM.Ficha.PV'),
    }),
    flags: {
      recuperacao: { recurso: 'pv', total: result.highSum, curado: false, alvoUuid: target.uuid },
    },
  });
  return result;
}

// ---------- Reinício de cena ----------

/**
 * Reinicia a cena: zera contadores, recursos e efeitos "até o fim da cena" e dá 1 PV a quem está
 * com 0. Sem argumento, vale para todos os personagens do mundo que o usuário controla (mestre).
 * @param {Actor|Actor[]} [actors]
 */
export async function endScene(actors) {
  const list = (
    actors ? [actors].flat() : game.actors.filter((a) => a.type === 'personagem')
  ).filter((actor) => actor.isOwner);
  for (const actor of list) {
    await actor.update(
      sceneReset({
        pv: actor.system.pv.value,
        contusao: actor.system.estado.contusao,
        estupor: actor.system.estado.estupor,
        efeitos: actor.toObject().system.efeitos,
        impetoInicial: hasAbility(actor, 'impetoInicial'),
      }),
    );
  }
  ui.notifications.info(t('DESORDEM.Habilidade.NovaCenaFeita', { n: list.length }));
}

// ---------- Botões nos cartões de teste ----------

const testData = (message) => message.flags?.[SYSTEM_ID]?.teste;

/** Refaz o cartão do teste com os novos valores dos dados e guarda as notas e os usos. */
async function applyRewrite(message, values, patch = {}) {
  const data = testData(message);
  if (!data) return;
  const notes = [...(data.notes ?? []), ...(patch.notes ?? [])];
  const used = { ...data.used, ...patch.used };
  const { card } = await rebuildTest({ plan: data.plan, display: data.display, values, notes });
  await message.update({
    content: card,
    [`flags.${SYSTEM_ID}.teste.values`]: values,
    [`flags.${SYSTEM_ID}.teste.notes`]: notes,
    [`flags.${SYSTEM_ID}.teste.used`]: used,
  });
}

/** Aplica a alteração direto, ou pede ao mestre ativo (socket) se o usuário não puder editar. */
async function requestRewrite(message, values, patch) {
  if (message.canUserModify(game.user, 'update')) return applyRewrite(message, values, patch);
  return game.socket.emit(SOCKET, { action: 'rewriteTest', messageId: message.id, values, patch });
}

/** Os valores pedidos cabem nos dados do cartão (o dado de pavor, no fim, não muda)? */
function validValues(data, values) {
  if (!Array.isArray(values) || values.length !== data.values.length) return false;
  return values.every((value, i) =>
    i < data.sides.length
      ? Number.isInteger(value) && value >= 1 && value <= data.sides[i]
      : value === data.values[i],
  );
}

/** Só aceita do socket o que as habilidades realmente enviam. */
function cleanPatch(patch = {}) {
  return {
    used: patch.used?.prontidao === true ? { prontidao: true } : {},
    notes: (Array.isArray(patch.notes) ? patch.notes : [])
      .slice(0, 3)
      .map((note) => String(note).slice(0, 200)),
  };
}

/** Escuta os pedidos de alteração de cartões (só o mestre ativo atende). */
export function registerAbilitySocket() {
  game.socket.on(SOCKET, async (data) => {
    if (data?.action !== 'rewriteTest') return;
    if (game.users.activeGM?.id !== game.user.id) return;
    const message = game.messages.get(data.messageId);
    const info = message && testData(message);
    if (!info || !validValues(info, data.values)) return;
    await applyRewrite(message, data.values, cleanPatch(data.patch));
  });
}

/** Usa a análise: o jogador escolhe os novos valores dos dados e gasta os marcadores. */
async function useAnalysis(message, actor) {
  const info = testData(message);
  const points = actor.system.recursos.analise;
  const count = info.sides.length;
  const current = info.values.slice(0, count);
  const fields = current
    .map(
      (value, i) =>
        `<label class="desordem-ficha__campo"><span>d${info.sides[i]} (${value})</span><input type="number" name="die${i}" value="${value}" min="1" max="${info.sides[i]}"></label>`,
    )
    .join('');
  const newValues = await ask({
    title: t('DESORDEM.Habilidade.AnaliseTitulo'),
    content: `<p>${t('DESORDEM.Habilidade.AnaliseDica', { pontos: points })}</p>${fields}`,
    read: (form) => current.map((_, i) => Number(form.elements[`die${i}`].value)),
  });
  if (!newValues) return;
  let applied;
  try {
    applied = applyAnalysis({ values: current, sides: info.sides, newValues, points });
  } catch {
    warn('DESORDEM.Habilidade.AnaliseInvalida');
    return;
  }
  if (applied.cost === 0) return;
  await actor.update({ 'system.recursos.analise': points - applied.cost });
  await requestRewrite(message, [...applied.values, ...info.values.slice(count)], {
    notes: [t('DESORDEM.Habilidade.AnaliseNota', { nome: actor.name, pontos: applied.cost })],
  });
}

/** Repetir dado: gasta 2 PD para rolar de novo um dado do teste cujo resultado não seja 1. */
async function useReroll(message, actor) {
  const info = testData(message);
  if (info.used?.prontidao) return warn('DESORDEM.Habilidade.ProntidaoJaUsada');
  if (actor.system.pd.value < COSTS.prontidao) return warn('DESORDEM.Habilidade.ProntidaoSemPD');
  const candidates = rerollCandidates(info.values, info.sides);
  const options = candidates
    .map((i) => `<option value="${i}">d${info.sides[i]} = ${info.values[i]}</option>`)
    .join('');
  const index = await ask({
    title: t('DESORDEM.Habilidade.ProntidaoTitulo'),
    content: `<label>${t('DESORDEM.Habilidade.ProntidaoEscolha')} <select name="dado">${options}</select></label>`,
    read: (form) => Number(form.elements.dado.value),
  });
  if (index === null || index === undefined) return;
  const roll = await new Roll(`1d${info.sides[index]}`).evaluate();
  await actor.update({ 'system.pd.value': actor.system.pd.value - COSTS.prontidao });
  const text = t('DESORDEM.Habilidade.ProntidaoNota', {
    nome: actor.name,
    dado: info.sides[index],
    de: info.values[index],
    para: roll.total,
  });
  await abilityNote(actor, text, '', [roll]);
  await requestRewrite(message, replaceDie(info.values, index, roll.total), {
    used: { prontidao: true },
    notes: [text],
  });
}

/** Acrescenta um botão à barra de habilidades do cartão. */
function addButton(bar, label, handler) {
  const button = bar.ownerDocument.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', async (event) => {
    event.preventDefault();
    button.disabled = true;
    try {
      await handler();
    } finally {
      button.disabled = false;
    }
  });
  bar.append(button);
}

/** Hook renderChatMessageHTML: mostra "usar análise" e "repetir dado" a quem pode usá-los. */
export function renderTestButtons(message, html) {
  const info = testData(message);
  const container = html.querySelector('.message-content');
  if (!info || !container) return;
  const bar = html.ownerDocument.createElement('div');
  bar.className = 'desordem-teste__habilidades';

  const owner = game.actors.get(message.speaker?.actor);
  if (owner?.isOwner && hasAbility(owner, 'analise') && owner.system.recursos.analise > 0) {
    addButton(
      bar,
      t('DESORDEM.Habilidade.AnaliseBotao', { pontos: owner.system.recursos.analise }),
      () => useAnalysis(message, owner),
    );
  }

  const mine = game.canvas?.tokens?.controlled?.[0]?.actor ?? game.user.character;
  if (
    mine?.isOwner &&
    hasAbility(mine, 'prontidao') &&
    !info.used?.prontidao &&
    mine.system.pd.value >= COSTS.prontidao &&
    rerollCandidates(info.values, info.sides).length > 0
  ) {
    addButton(bar, t('DESORDEM.Habilidade.ProntidaoBotao', { custo: COSTS.prontidao }), () =>
      useReroll(message, mine),
    );
  }

  if (bar.children.length) container.append(bar);
}
