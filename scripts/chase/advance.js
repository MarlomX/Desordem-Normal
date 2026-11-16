/**
 * Teste de avanço da perseguição (Foundry). O avanço não tem janela própria: ele é uma opção da
 * janela pré-teste normal ("usar como teste de avanço"), em qualquer teste da ficha. Este arquivo
 * liga a escolha feita lá ao teste e ao que acontece depois dele:
 *   - antes da rolagem: o fôlego gasto vira dados d6 e o esforço extra, +1 passo na perícia;
 *   - depois da rolagem: soma os PA (DT 10 própria, independente da DT do teste), gasta o fôlego,
 *     marca "já agiu", desconta os d4 de PV do esforço extra e publica um cartão resumindo.
 * Se o jogador cancelar a janela ou o teste der erro, nada é gasto nem gravado.
 */
import { SYSTEM_ID } from '../config.js';
import {
  advanceGain,
  advanceSuccess,
  applyAdvance,
  applyEffortLoss,
  effortDiceCount,
} from '../rolls/chase.js';
import { postMessage, render, skillName } from '../rolls/chat.js';
import { chaseInfoFor, findChase, updateParticipant } from './store.js';

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

/** Dado de fôlego: sempre d6. */
const BREATH_DIE = 6;

/**
 * Prepara as opções de um teste que vale como avanço: acrescenta os dados de fôlego e o passo do
 * esforço extra e liga o gancho `onResult`. Se o avanço deixou de valer enquanto a janela estava
 * aberta (o mestre marcou "já agiu", por exemplo), avisa e rola um teste comum.
 * @param {Actor} actor
 * @param {object} options Opções devolvidas pela janela pré-teste (com `avanco`).
 * @param {string} skillKey Perícia (ou aptidão, ofício) do teste.
 */
export function withChaseAdvance(actor, options, skillKey) {
  const { avanco, ...rest } = options;
  const info = chaseInfoFor(actor, skillKey);
  if (!info || info.blocked) {
    ui.notifications.warn(t('DESORDEM.Perseguicao.Erro.AvancoBloqueado'));
    return rest;
  }
  return {
    ...rest,
    // O fôlego vai primeiro na lista de dados, para não ser cortado pelo limite de 4 dados.
    extraDice: [...Array(avanco.breath).fill(BREATH_DIE), ...(rest.extraDice ?? [])],
    stepMods: [...(rest.stepMods ?? []), ...(avanco.effort ? [{ target: 'skill', steps: 1 }] : [])],
    onResult: async (result) => {
      await rest.onResult?.(result);
      await finishAdvance({ actor, info, skillKey, avanco, result });
    },
  };
}

/** Grava o avanço depois da rolagem e publica o cartão resumo. */
async function finishAdvance({ actor, info, skillKey, avanco, result }) {
  // Usa os valores de agora (o mestre pode ter ajustado PA ou fôlego durante o teste).
  const chase = findChase();
  const combatant = chase?.combatants.get(info.combatantId);
  if (!chase?.system.ativa || !combatant) {
    ui.notifications.warn(t('DESORDEM.Perseguicao.Erro.NaoEmAndamento'));
    return;
  }
  const current = combatant.system;
  const gain = advanceGain(result);
  const patch = applyAdvance(current, {
    gain,
    breathSpent: avanco.breath,
    effort: avanco.effort,
    skillKey,
    rodadaAtual: chase.system.rodadaAtual,
  });
  await updateParticipant(combatant, patch);

  // Esforço extra: rola os d4 e desconta os PV. Chegar a 0 só avisa; o teste de lesão é do jogador.
  let effort = null;
  const rolls = [];
  if (avanco.effort) {
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
      success: advanceSuccess(result),
      titulo: t('DESORDEM.Perseguicao.Chat.Titulo', { nome: actor.name }),
      ganho: t('DESORDEM.Perseguicao.Chat.Ganho', { pa: gain, total: patch.pa }),
      pericia: t('DESORDEM.Perseguicao.Chat.Pericia', { pericia: skillName(skillKey, actor) }),
      folego: avanco.breath ? t('DESORDEM.Perseguicao.Chat.Folego', { n: avanco.breath }) : '',
      esforco: effort
        ? t('DESORDEM.Perseguicao.Chat.Esforco', { perda: effort.loss, dados: effort.dice })
        : '',
      aviso: effort?.reachedZero ? t('DESORDEM.Perseguicao.Chat.EsforcoZero') : '',
    }),
  });
}
