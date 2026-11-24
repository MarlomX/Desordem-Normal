/**
 * Recuperar fôlego (botão no cartão da perseguição na ficha). Pela regra é a ação da rodada, no
 * lugar de avançar: o participante recupera dois dados de fôlego (sem teto de 6) e fica marcado
 * como «já agiu». Não é um teste, então não há rolagem. Posta uma mensagem curta no chat.
 */
import { SYSTEM_ID } from '../config.js';
import { breathBlockReason, recoverBreathPatch } from '../rolls/chase.js';
import { postMessage, render } from '../rolls/chat.js';
import { findChase, updateParticipant } from './store.js';
import { t } from '../shared/i18n.js';
import { worldActorId } from '../shared/encounter.js';

/**
 * Recupera o fôlego do personagem (dono ou mestre). Se a perseguição acabou ou o participante já
 * agiu nesta rodada, avisa e não faz nada.
 * @param {Actor} actor Personagem da ficha em que o botão foi clicado.
 */
export async function recoverBreath(actor) {
  const chase = findChase();
  if (!chase || !actor?.isOwner) return;
  const id = worldActorId(actor);
  const combatant = chase.combatants.find((entry) => entry.actorId === id);
  if (!combatant) return;

  const participant = combatant.system;
  const reason = breathBlockReason({
    ativa: chase.system.ativa,
    rodadaAtual: chase.system.rodadaAtual,
    participant,
  });
  if (reason) {
    ui.notifications.warn(t('DESORDEM.Perseguicao.Pre.Bloqueio.agiu'));
    return;
  }

  const patch = recoverBreathPatch({ participant, rodadaAtual: chase.system.rodadaAtual });
  await updateParticipant(combatant, patch);
  await postMessage({
    actor,
    content: await render(`systems/${SYSTEM_ID}/templates/chat/avanco.hbs`, {
      titulo: t('DESORDEM.Perseguicao.Chat.FolegoTitulo', { nome: actor.name }),
      esforco: t('DESORDEM.Perseguicao.Chat.Folego', {
        dados: patch.folego - participant.folego,
        total: patch.folego,
      }),
      aviso: '',
    }),
  });
}
