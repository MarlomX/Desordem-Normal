/**
 * Ação "Avançar" da perseguição (Foundry). O fluxo, sempre com o jogador clicando em cada passo:
 *   1. mini-janela: perícia, dados de fôlego a gastar e esforço extra;
 *   2. janela pré-teste normal do sistema (pavor, ímpeto, dados bônus), pulada com Shift+clique;
 *   3. teste da perícia (DT 10), com o fôlego como dados d6 e o esforço extra como +1 passo;
 *   4. grava os PA, o fôlego gasto e a rodada do participante; se houve esforço extra, rola e
 *      desconta os d4 de PV; publica um cartão resumindo o avanço.
 * Se o jogador cancelar qualquer janela antes da rolagem, nada é gasto nem gravado.
 */
import { PERICIAS, SYSTEM_ID } from '../config.js';
import {
  ADVANCE_DT,
  ADVANCE_SKILL,
  advanceGain,
  applyAdvance,
  applyEffortLoss,
  breathLimit,
  canAdvance,
  effortDiceCount,
  skillAllowed,
} from '../rolls/chase.js';
import { postMessage, render, rollSkill } from '../rolls/chat.js';
import { askRollChoices } from '../rolls/roll-dialog-chat.js';
import { findChase, updateParticipant } from './store.js';

const { DialogV2 } = foundry.applications.api;

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const renderTemplate = (path, data) => foundry.applications.handlebars.renderTemplate(path, data);

/** Participantes com um avanço em andamento (impede o duplo clique enquanto as janelas estão abertas). */
const busy = new Set();

/** Dado de fôlego: sempre d6. */
const BREATH_DIE = 6;

/** Mini-janela do avanço. Devolve a escolha validada, ou `null` se o jogador cancelou. */
async function askAdvanceChoices(participant) {
  const max = breathLimit(participant.folego);
  const used = [...participant.periciasUsadas];
  const content = await renderTemplate(`systems/${SYSTEM_ID}/templates/perseguicao/avancar.hbs`, {
    skills: Object.keys(PERICIAS).map((key) => {
      const label = t(`DESORDEM.Pericias.${key}`);
      const allowed = skillAllowed(key, used);
      return {
        key,
        selected: key === ADVANCE_SKILL,
        disabled: !allowed,
        label: allowed ? label : t('DESORDEM.Perseguicao.Avancar.PericiaUsada', { pericia: label }),
      };
    }),
    hasBreath: max > 0,
    folego: participant.folego,
    breathOptions: Array.from({ length: max + 1 }, (_, n) => ({ n })),
    effortLabel: t('DESORDEM.Perseguicao.Avancar.Esforco', {
      dados: effortDiceCount(participant.esforcoExtra),
    }),
  });

  const answer = await DialogV2.wait({
    window: { title: t('DESORDEM.Perseguicao.Avancar.Titulo') },
    classes: ['desordem-normal', 'desordem-perseguicao-dialogo'],
    content,
    modal: true,
    rejectClose: false,
    buttons: [
      {
        action: 'go',
        label: t('DESORDEM.Perseguicao.Avancar.Continuar'),
        icon: 'fa-solid fa-person-running',
        default: true,
        callback: (event, button, dialog) => {
          const root = dialog.element;
          return {
            confirmed: true,
            skill: root.querySelector('[name="skill"]')?.value,
            breath: Number(root.querySelector('[name="breath"]')?.value ?? 0),
            effort: Boolean(root.querySelector('[name="effort"]')?.checked),
          };
        },
      },
      { action: 'cancel', label: t('DESORDEM.Teste.Pre.Cancelar') },
    ],
  });
  // Só {confirmed: true} confirma: fechar no X ou cancelar devolve outra coisa.
  if (answer?.confirmed !== true) return null;

  // Nunca confia no que veio da janela: valida perícia e quantidade de fôlego.
  if (!(answer.skill in PERICIAS) || !skillAllowed(answer.skill, used)) return null;
  const breath = Number.isInteger(answer.breath) ? Math.min(Math.max(answer.breath, 0), max) : 0;
  return { skill: answer.skill, breath, effort: answer.effort === true };
}

/** O participante ainda pode avançar? Avisa o usuário quando não. */
function checkCanAdvance(chase, combatant) {
  const { ativa, rodadaAtual } = chase.system;
  if (!ativa) {
    ui.notifications.warn(t('DESORDEM.Perseguicao.Erro.NaoEmAndamento'));
    return false;
  }
  if (!canAdvance({ ativa, rodadaAtual, participant: combatant.system })) {
    ui.notifications.warn(t('DESORDEM.Perseguicao.Erro.JaAgiu', { nome: combatant.name }));
    return false;
  }
  return true;
}

/** Faz o avanço de um participante. `shift` pula a janela pré-teste. */
export async function advanceChase(combatantId, { shift = false } = {}) {
  const chase = findChase();
  const combatant = chase?.combatants.get(combatantId);
  if (!combatant?.actor?.isOwner || busy.has(combatantId)) return;
  busy.add(combatantId);
  try {
    await runAdvance(chase, combatantId, shift);
  } finally {
    busy.delete(combatantId);
  }
}

async function runAdvance(chase, combatantId, shift) {
  const first = chase.combatants.get(combatantId);
  const { actor } = first;
  if (!checkCanAdvance(chase, first)) return;

  const choice = await askAdvanceChoices(first.system);
  if (!choice) return;

  const baseExtraDice = Array(choice.breath).fill(BREATH_DIE);
  const picked = await askRollChoices(actor, {
    skillKey: choice.skill,
    baseExtraDice,
    dt: ADVANCE_DT,
    shift,
  });
  if (!picked) return;

  // As janelas ficaram abertas por um tempo: confere de novo antes de rolar.
  const chaseNow = findChase();
  const combatant = chaseNow?.combatants.get(combatantId);
  if (!combatant || !checkCanAdvance(chaseNow, combatant)) return;

  // O fôlego vai primeiro na lista de dados, para não ser cortado pelo limite de 4 dados.
  const result = await rollSkill(actor, choice.skill, {
    ...picked,
    dt: picked.dt ?? ADVANCE_DT,
    extraDice: [...baseExtraDice, ...(picked.extraDice ?? [])],
    stepMods: choice.effort ? [{ target: 'skill', steps: 1 }] : [],
  });

  // Usa os valores de agora (o mestre pode ter ajustado PA ou fôlego durante o teste).
  const current = chaseNow.combatants.get(combatantId)?.system ?? combatant.system;
  const gain = advanceGain(result);
  const patch = applyAdvance(current, {
    gain,
    breathSpent: choice.breath,
    effort: choice.effort,
    skillKey: choice.skill,
    rodadaAtual: chaseNow.system.rodadaAtual,
  });
  await updateParticipant(combatant, patch);

  // Esforço extra: rola os d4 e desconta os PV. Chegar a 0 só avisa; o teste de lesão é do jogador.
  let effort = null;
  const rolls = [];
  if (choice.effort) {
    const dice = effortDiceCount(current.esforcoExtra);
    const roll = await new Roll(`${dice}d4`).evaluate();
    const { pv, reachedZero } = applyEffortLoss(actor.system.pv.value, roll.total);
    await actor.update({ 'system.pv.value': pv });
    effort = { dice, loss: roll.total, reachedZero };
    rolls.push(roll);
  }

  await postMessage({
    actor,
    rolls,
    content: await render(`systems/${SYSTEM_ID}/templates/chat/avanco.hbs`, {
      success: result.success,
      titulo: t('DESORDEM.Perseguicao.Chat.Titulo', { nome: actor.name }),
      ganho: t('DESORDEM.Perseguicao.Chat.Ganho', { pa: gain, total: patch.pa }),
      pericia: t('DESORDEM.Perseguicao.Chat.Pericia', {
        pericia: t(`DESORDEM.Pericias.${choice.skill}`),
      }),
      folego: choice.breath ? t('DESORDEM.Perseguicao.Chat.Folego', { n: choice.breath }) : '',
      esforco: effort
        ? t('DESORDEM.Perseguicao.Chat.Esforco', { perda: effort.loss, dados: effort.dice })
        : '',
      aviso: effort?.reachedZero ? t('DESORDEM.Perseguicao.Chat.EsforcoZero') : '',
    }),
  });
}
