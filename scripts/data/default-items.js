/**
 * Itens que toda ficha nova ganha: por enquanto, a arma «Desarmado» (soco e chute, dano RB não
 * letal). Vale para personagens e criaturas; o mestre pode apagar ou editar o item depois.
 */
import { SYSTEM_ID } from '../config.js';
import { needsUnarmed, unarmedWeaponData } from '../rolls/equipment.js';

/** Tipos de ator que ganham o «Desarmado». */
const ACTOR_TYPES = ['personagem', 'criatura'];

/**
 * Hook `preCreateActor`: roda no navegador de quem cria a ficha, antes de ela existir, e põe o
 * «Desarmado» nos itens de origem. Fichas duplicadas ou importadas que já têm o item (pela marca
 * na flag) ficam como estão.
 * @param {Actor} actor Ficha ainda não criada (só os dados de origem).
 */
function addUnarmed(actor) {
  if (!ACTOR_TYPES.includes(actor.type)) return;
  const items = actor._source.items ?? [];
  if (!needsUnarmed(items, SYSTEM_ID)) return;
  const unarmed = unarmedWeaponData(SYSTEM_ID, {
    nome: game.i18n.localize('DESORDEM.Item.Desarmado.Nome'),
    descricao: game.i18n.localize('DESORDEM.Item.Desarmado.Descricao'),
  });
  actor.updateSource({ items: [...items, unarmed] });
}

/** Registra o hook (chamar uma vez, no `init`). */
export function registerDefaultItems() {
  Hooks.on('preCreateActor', (actor) => addUnarmed(actor));
}
