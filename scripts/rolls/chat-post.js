/**
 * Básico do chat (v0.28.2): desenhar o template de um cartão e publicar a mensagem. Saiu de
 * `chat.js` para que os módulos que só publicam avisos (habilidades, companheiro) não precisem
 * importar o teste inteiro (o que criava imports circulares). `chat.js` reexporta os dois.
 */
import { SYSTEM_ID } from '../config.js';
import { renderTemplate } from '../shared/templates.js';

/** HTML do template do cartão com os dados (o mesmo que `renderTemplate`). */
export const render = (template, context) => renderTemplate(template, context);

/**
 * Publica uma mensagem de rolagem no chat, respeitando o modo de rolagem. `rollMode` força um modo
 * (por exemplo 'selfroll', só quem rolou vê); sem ele, vale o modo escolhido no chat.
 */
export async function postMessage({ actor, content, rolls = [], flags, rollMode }) {
  const messageData = {
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls,
    sound: rolls.length ? CONFIG.sounds.dice : undefined,
    ...(flags ? { flags: { [SYSTEM_ID]: flags } } : {}),
  };
  ChatMessage.applyRollMode(messageData, rollMode ?? game.settings.get('core', 'rollMode'));
  return ChatMessage.create(messageData);
}
