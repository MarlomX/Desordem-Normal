/**
 * Avisos de habilidade no chat (v0.28.2): o cartão «usou a habilidade» e o companheiro animal
 * ferido. Saíram de `abilities-chat.js` porque o teste (`chat.js`) também os usa; antes o teste
 * importava as habilidades e as habilidades importavam o teste (import circular).
 * `abilities-chat.js` reexporta tudo.
 */
import { SYSTEM_ID, PERICIAS, APTIDOES } from '../config.js';
import { describeEffect } from './ability-effects-editor.js';
import { firstEffect } from './ability-effects-actor.js';
import { render, postMessage } from './chat-post.js';
import { t } from '../shared/i18n.js';

const TEMPLATE_HABILIDADE = `systems/${SYSTEM_ID}/templates/chat/habilidade.hbs`;

/** Nome de uma perícia ou de uma área de Aptidão (resumos dos efeitos). */
export function skillName(key) {
  if (PERICIAS[key]) return t(`DESORDEM.Pericias.${key}`);
  if (APTIDOES.includes(key)) {
    return `${t('DESORDEM.Ficha.Aptidoes')}: ${t(`DESORDEM.Aptidoes.${key}`)}`;
  }
  return key;
}

/**
 * Aviso de habilidade no chat. O personagem já aparece no cabeçalho da mensagem; o título do
 * cartão é o nome da habilidade (sem ele, o nome do personagem), e abaixo vem o resumo do efeito
 * usado, se houver.
 * @param {Actor} actor
 * @param {Object} note
 * @param {string} [note.title] Nome da habilidade.
 * @param {string} note.text O que aconteceu («rola de novo o d6: 3 → 1.»).
 * @param {string} [note.detail] Linha extra (ex.: «3/4»).
 * @param {object} [note.entry] Efeito usado: o cartão mostra o resumo dele.
 * @param {Roll[]} [note.rolls]
 */
export async function abilityNote(
  actor,
  { title = '', text, detail = '', entry = null, rolls = [] },
) {
  const effect = entry ? describeEffect(entry, { t, skill: skillName }) : '';
  return postMessage({
    actor,
    content: await render(TEMPLATE_HABILIDADE, {
      title: title || entry?.itemName || actor.name,
      text,
      detail,
      effect,
    }),
    rolls,
  });
}

/**
 * O companheiro animal se feriu (o dado dele deu 1): marca `system.cena.animalFerido` (ele não
 * ajuda mais até a Nova cena) e avisa no chat. Personagens e criaturas têm o mesmo campo.
 * @param {Actor} actor
 */
export async function markCompanionHurt(actor) {
  if (actor.system.cena?.animalFerido) return;
  await actor.update({ 'system.cena.animalFerido': true });
  await abilityNote(actor, {
    entry: firstEffect(actor, 'companheiro'),
    text: t('DESORDEM.Habilidade.AnimalFerido'),
  });
}
