/**
 * Nova cena para todos (macro do mestre) e nova cena de uma criatura (botão da ficha), v0.23.3.
 * As regras de quem entra e do que muda ficam em funções puras (`sceneTargets`,
 * `creatureSceneReset`, em `abilities.js`); aqui só a conversa com o Foundry: permissão,
 * confirmação, gravação e o aviso no chat.
 */
import { creatureSceneReset, sceneTargets } from './abilities.js';
import { endScene } from './abilities-chat.js';

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

/** Nomes separados por vírgula, já escapados para entrar no HTML do chat ou do diálogo. */
const escapedNames = (actors) =>
  actors.map((actor) => foundry.utils.escapeHTML(actor.name)).join(', ');

/** Pergunta antes de mexer; `true` só se a pessoa confirmar. */
async function confirmScene(content) {
  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: { title: t('DESORDEM.Habilidade.NovaCena') },
    content,
    rejectClose: false,
    modal: true,
  });
  return confirmed === true;
}

/**
 * Macro «Nova cena» do compêndio «Macros do mestre»: reinicia a cena de todos os personagens que
 * têm dono jogador (o mesmo `endScene` do botão da aba Condição) e avisa no chat, para todos.
 * Só o mestre (ou o assistente) pode rodar; para um jogador, só aparece um aviso.
 * @returns {Promise<object[]>} Os personagens reiniciados (vazio se nada foi feito).
 */
export async function newSceneForAll() {
  if (!game.user.isGM) {
    ui.notifications.warn(t('DESORDEM.Cena.SoMestre'));
    return [];
  }
  const targets = sceneTargets(game.actors.contents);
  if (!targets.length) {
    ui.notifications.warn(t('DESORDEM.Cena.SemPersonagens'));
    return [];
  }
  const names = escapedNames(targets);
  const content = `<p>${t('DESORDEM.Cena.ConfirmarTodos', { n: targets.length })}</p><p><strong>${names}</strong></p>`;
  if (!(await confirmScene(content))) return [];

  await endScene(targets);
  // Aviso público (sem `whisper`): todos veem que a cena virou e para quem
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ user: game.user }),
    content: `<div class="desordem-chat desordem-nova-cena"><h3><i class="fa-solid fa-clapperboard" aria-hidden="true"></i> ${t('DESORDEM.Habilidade.NovaCena')}</h3><p>${names}</p></div>`,
  });
  return targets;
}

/**
 * Botão «Nova cena» da ficha da criatura: zera os passos temporários e tira os efeitos que duram
 * até o fim da cena (`creatureSceneReset`), depois de confirmar. A macro não mexe em criaturas.
 * @param {Actor} actor A criatura.
 */
export async function endCreatureScene(actor) {
  if (!actor?.isOwner) return;
  if (!(await confirmScene(`<p>${t('DESORDEM.Cena.ConfirmarCriatura')}</p>`))) return;
  await actor.update(creatureSceneReset(actor.toObject().system.efeitos));
  ui.notifications.info(t('DESORDEM.Cena.CriaturaFeita', { nome: actor.name }));
}
