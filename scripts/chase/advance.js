/**
 * Teste de avanço da perseguição (Foundry). O avanço não tem janela própria: ele é uma opção da
 * janela pré-teste normal ("usar como teste de avanço"), em qualquer teste da ficha. Este arquivo
 * liga a escolha feita lá ao teste e ao que acontece com ele:
 *   - antes da rolagem: o fôlego gasto vira dados d6 e o esforço extra, +1 passo na perícia, e o
 *     registro do avanço (com a DT escolhida) é guardado na mensagem do teste;
 *   - na rolagem: gasta o fôlego, marca "já agiu", anota a perícia e, se houve esforço extra, rola
 *     os d4 e posta o valor no chat (o PV só é descontado pelo botão do cartão, effort-card.js);
 *   - os PA NÃO são somados aqui: o cartão do teste ganha um botão (advance-card.js), que soma
 *     depois, lendo os dados como estão naquele momento (a Análise pode ter mudado o resultado).
 * Se o jogador cancelar a janela ou o teste der erro, nada é gasto nem gravado.
 */
import { SYSTEM_ID } from '../config.js';
import {
  applyAdvanceCosts,
  createAdvanceFlag,
  createEffortFlag,
  effortDiceCount,
} from '../rolls/chase.js';
import { postMessage, render } from '../rolls/chat.js';
import { chaseInfoFor, findChase, updateParticipant } from './store.js';
import { t } from '../shared/i18n.js';

/** Dado de fôlego: sempre d6. */
const BREATH_DIE = 6;

/**
 * Prepara as opções de um teste que vale como avanço: acrescenta os dados de fôlego e o passo do
 * esforço extra, guarda o registro do avanço na mensagem e liga o gancho `onResult`. Se o avanço
 * deixou de valer enquanto a janela estava aberta (o mestre marcou "já agiu", por exemplo), avisa e
 * rola um teste comum.
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
    // A DT do avanço é a que estava no campo da janela (ou a da perseguição, sem campo de DT)
    avancoFlag: createAdvanceFlag({
      combatantId: info.combatantId,
      skillKey,
      dt: avanco.dt ?? info.dt,
    }),
    onResult: async (result) => {
      await rest.onResult?.(result);
      await payCosts({ actor, info, skillKey, avanco });
    },
  };
}

/** Paga o que o avanço custa (fôlego, esforço extra, "já agiu") quando o teste é rolado. */
async function payCosts({ actor, info, skillKey, avanco }) {
  const chase = findChase();
  const combatant = chase?.combatants.get(info.combatantId);
  if (!chase?.system.ativa || !combatant) {
    ui.notifications.warn(t('DESORDEM.Perseguicao.Erro.NaoEmAndamento'));
    return;
  }
  // Usa os valores de agora (o mestre pode ter ajustado o fôlego durante o teste).
  const current = combatant.system;
  await updateParticipant(
    combatant,
    applyAdvanceCosts(current, {
      breathSpent: avanco.breath,
      effort: avanco.effort,
      skillKey,
      rodadaAtual: chase.system.rodadaAtual,
    }),
  );

  // Esforço extra: rola os d4 e mostra o valor no chat. O PV NÃO é descontado aqui: o jogador
  // aplica pelo botão do cartão (effort-card.js). Nunca dispara teste de lesão sozinho.
  if (!avanco.effort) return;
  const dice = effortDiceCount(current.esforcoExtra);
  const roll = await new Roll(`${dice}d4`).evaluate();
  await postMessage({
    actor,
    rolls: [roll],
    content: await render(`systems/${SYSTEM_ID}/templates/chat/avanco.hbs`, {
      titulo: t('DESORDEM.Perseguicao.Chat.EsforcoTitulo', { nome: actor.name }),
      esforco: t('DESORDEM.Perseguicao.Chat.Esforco', { perda: roll.total, dados: dice }),
      aviso: '',
    }),
    flags: { esforco: createEffortFlag({ actorUuid: actor.uuid, loss: roll.total, dice }) },
  });
}
