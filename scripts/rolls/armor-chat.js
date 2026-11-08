/**
 * Ligação ao Foundry dos pontos de armadura: lê as armaduras do ator, pergunta se o jogador quer
 * gastar um ponto contra um dano físico e atualiza o item.
 */
import { armorSummary, pickArmorToSpend, ARMOR_REDUCTION } from './equipment.js';

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

/** Armaduras do ator no formato usado pela lógica pura. */
export function armorList(actor) {
  return actor.items
    .filter((item) => item.type === 'armadura')
    .map((item) => ({
      id: item.id,
      pontos: item.system.pontos,
      gastos: item.system.gastos,
      vestida: item.system.vestida,
    }));
}

/** Pontos de armadura restantes dos itens vestidos. */
export function armorAvailable(actor) {
  return armorSummary(armorList(actor)).available;
}

/**
 * Pergunta se o jogador quer gastar 1 ponto de armadura para reduzir o dano.
 * @returns {Promise<boolean>}
 */
export async function askSpendArmor(actor, amount) {
  const answer = await foundry.applications.api.DialogV2.confirm({
    window: { title: t('DESORDEM.Armadura.Titulo') },
    content: `<p>${t('DESORDEM.Armadura.Pergunta', {
      dano: amount,
      reducao: ARMOR_REDUCTION,
      restantes: armorAvailable(actor),
    })}</p>`,
    rejectClose: false,
    modal: true,
  });
  return answer === true;
}

/**
 * Gasta um ponto de armadura do ator (da primeira armadura vestida que ainda tem pontos).
 * @returns {Promise<boolean>} Se algum ponto foi gasto.
 */
export async function spendArmorPoint(actor) {
  const id = pickArmorToSpend(armorList(actor));
  if (!id) return false;
  const item = actor.items.get(id);
  await item.update({ 'system.gastos': item.system.gastos + 1 });
  return true;
}
