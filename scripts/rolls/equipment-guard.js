/**
 * Regras do equipamento aplicadas a qualquer alteração de item (ficha, ficha do item ou macro):
 * no máximo duas mãos ocupadas (armas, itens e escudos), um só escudo e nada marcial equipado sem
 * proficiência marcial. Armaduras vestidas não têm limite.
 */
import { checkEquipment, isShield } from './equipment.js';
import { hasMartialProficiency } from './ability-effects.js';
import { actorEffects } from './ability-effects-actor.js';

const t = (key) => game.i18n.localize(key);

/** Itens do personagem no formato usado pela lógica pura, sem o item indicado. */
function siblingsOf(item) {
  return item.parent.items
    .filter((other) => other.id !== item.id)
    .map((other) => ({ id: other.id, type: other.type, system: other.system }));
}

/**
 * O dono do item tem proficiência marcial? Só o personagem é conferido (criaturas e outros donos
 * passam sempre).
 */
function ownerProficient(item) {
  const actor = item.parent;
  if (actor?.type !== 'personagem') return true;
  return hasMartialProficiency(actor.system, actorEffects(actor));
}

/**
 * Campo que a regra controla em cada item (o que o torna "equipado"): `vestida` na armadura;
 * `empunhada` nas armas, nos itens e no escudo.
 */
const equipField = (item) =>
  item.type === 'armadura' && !isShield(item.system) ? 'vestida' : 'empunhada';

/** Bloqueia a alteração (e restaura a ficha) se ela violar os limites do equipamento. */
function guardUpdate(item, changes) {
  if (!item.parent?.items) return undefined;
  const { system = {} } = foundry.utils.expandObject(changes);
  // Só confere mudanças no que equipa o item: empunhar, vestir, empunhadura, categoria (uma arma
  // que deixa de ser natural passa a ocupar mãos) ou subtipo (armadura que vira escudo)
  const watched = ['empunhada', 'vestida', 'empunhadura', 'categoria', 'subtipo'];
  if (!watched.some((key) => key in system)) {
    return undefined;
  }
  const merged = foundry.utils.mergeObject(item.toObject().system, system, { inplace: false });
  const { ok, reason } = checkEquipment(
    siblingsOf(item),
    { type: item.type, system: merged },
    { proficient: ownerProficient(item) },
  );
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
  const { ok } = checkEquipment(
    siblingsOf(item),
    { type: item.type, system: item.system },
    { proficient: ownerProficient(item) },
  );
  if (!ok) item.updateSource({ [`system.${equipField(item)}`]: false });
}

/** Registra os ganchos (chamar uma vez, no `init`). */
export function registerEquipmentGuards() {
  Hooks.on('preUpdateItem', guardUpdate);
  Hooks.on('preCreateItem', guardCreate);
}
