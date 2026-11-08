/**
 * Regras do equipamento aplicadas a qualquer alteração de item (ficha, ficha do item ou macro):
 * no máximo duas mãos ocupadas e uma só armadura vestida.
 */
import { checkEquipment } from './equipment.js';

const t = (key) => game.i18n.localize(key);

/** Itens do personagem no formato usado pela lógica pura, sem o item indicado. */
function siblingsOf(item) {
  return item.parent.items
    .filter((other) => other.id !== item.id)
    .map((other) => ({ id: other.id, type: other.type, system: other.system }));
}

/** Campo que a regra controla em cada tipo de item (o que o torna "equipado"). */
const equipField = (type) => (type === 'armadura' ? 'vestida' : 'empunhada');

/** Bloqueia a alteração (e restaura a ficha) se ela violar os limites do equipamento. */
function guardUpdate(item, changes) {
  if (!item.parent?.items) return undefined;
  const { system = {} } = foundry.utils.expandObject(changes);
  if (!['empunhada', 'vestida', 'maos'].some((key) => key in system)) return undefined;
  const merged = foundry.utils.mergeObject(item.toObject().system, system, { inplace: false });
  const { ok, reason } = checkEquipment(siblingsOf(item), { type: item.type, system: merged });
  if (ok) return undefined;
  ui.notifications.warn(t(`DESORDEM.Equipamento.Bloqueio.${reason}`));
  // Redesenha as fichas depois do cancelamento, para a caixa marcada voltar ao estado real
  Promise.resolve().then(() => {
    item.sheet?.render();
    item.parent.sheet?.render();
  });
  return false;
}

/** Um item que chega já empunhado ou vestido, mas sem espaço, entra desequipado. */
function guardCreate(item) {
  if (!item.parent?.items) return;
  const { ok } = checkEquipment(siblingsOf(item), { type: item.type, system: item.system });
  if (!ok) item.updateSource({ [`system.${equipField(item.type)}`]: false });
}

/** Registra os ganchos (chamar uma vez, no `init`). */
export function registerEquipmentGuards() {
  Hooks.on('preUpdateItem', guardUpdate);
  Hooks.on('preCreateItem', guardCreate);
}
