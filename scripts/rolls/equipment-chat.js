/* global document */
/**
 * Ligação ao Foundry dos equipamentos: atacar com uma arma, aplicar o dano da arma e usar itens.
 * No cartão de ataque, quem tem o Assumir ataque pronto pode assumi-lo até o dano ser aplicado;
 * aí o dano vai para o Guardião, e não para os alvos mirados.
 */
import { SYSTEM_ID } from '../config.js';
import { render, postMessage, rollSkill } from './chat.js';
import { computeDamage, damageBaseValue } from './damage.js';
import { damageActor } from './health.js';
import { pickDamageTarget } from './damage-dialog.js';
import { isThreat } from './threat.js';
import {
  itemUseChanges,
  weaponSkill,
  weaponDamageLabel,
  weaponAmmoChanges,
  weaponReady,
} from './equipment.js';
import { firstEffect } from './ability-effects-actor.js';
import { ammoOptions, markWeaponAttack, weaponTestKind } from './ability-effects.js';
import { abilityNote } from './abilities-chat.js';
import { guardButtons, registerGuardHandler } from './guardian-chat.js';
import { canGuardWeaponCard, guardWeaponCard } from './guardian.js';

const TEMPLATE_ATAQUE = `systems/${SYSTEM_ID}/templates/chat/ataque.hbs`;

const SOCKET = `system.${SYSTEM_ID}`;

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

/** Marca do cartão de ataque (dano, Guardião, aplicado), ou null. */
const weaponFlag = (message) => message?.flags?.[SYSTEM_ID]?.danoArma ?? null;

/** Quem atacou (o ator que fala pela mensagem). */
const attackerOf = (message) => ChatMessage.getSpeakerActor(message.speaker);

/**
 * Ataque com uma arma: teste da perícia da arma (DT 7 por padrão) e, se acertar, um cartão com o
 * dano (rolagem alta + modificador da arma) e o botão de aplicá-lo aos alvos mirados.
 * @param {Actor} actor
 * @param {Item} weapon Item do tipo arma.
 * @param {Object} [options] Opções do teste de perícia (dt, extraDice, stepMods, helpers...).
 * @returns {Promise<{result: object, amount: (number|null)}>}
 */
/**
 * Companheiro animal (efeito `companheiro`): o dado dele nos ataques do tipo do efeito (corpo a
 * corpo, por padrão), até o animal se ferir (dado em 1).
 * @returns {number[]} [dado] se o companheiro ajuda neste ataque, senão [].
 */
export function weaponCompanionDice(actor, weapon) {
  const { system } = weapon;
  const companion = firstEffect(actor, 'companheiro');
  if (!companion || actor.system.cena?.animalFerido) return [];
  const kind = system.tipo === 'corpo' ? 'ataqueCorpo' : 'ataqueDistancia';
  const fits = companion.params.teste === 'qualquer' || companion.params.teste === kind;
  return fits ? [companion.params.dado] : [];
}

/**
 * Companheiro na defesa (efeito `companheiro` de «Defesa» ou «Qualquer teste»): o dado dele no
 * teste de defesa do cartão (Defender-se ou esquiva), até o animal se ferir.
 * @returns {number[]} [dado] se o companheiro ajuda na defesa, senão [].
 */
export function defenseCompanionDice(actor) {
  const companion = firstEffect(actor, 'companheiro');
  if (!companion || actor.system.cena?.animalFerido) return [];
  return ['defesa', 'qualquer'].includes(companion.params.teste) ? [companion.params.dado] : [];
}

/**
 * A arma pode atacar? A consumível sem unidades não pode (avisa e devolve `false`).
 * @param {Item} weapon
 */
export function canAttackWith(weapon) {
  if (weaponReady(weapon.system)) return true;
  ui.notifications.warn(t('DESORDEM.Equipamento.SemMunicao', { nome: weapon.name }));
  return false;
}

/**
 * Depois do teste de ataque (feito, acertando ou não): marca que ESTA ARMA já atacou nesta cena
 * (efeito «primeiro ataque da cena») e, na arma consumível, gasta uma unidade e avisa no chat que
 * o gasto foi automático. Em 0, a arma só fica zerada.
 * @param {Actor} actor
 * @param {Item} weapon
 */
export async function afterWeaponAttack(actor, weapon) {
  const attacked = markWeaponAttack(actor.system.cena, weapon.id);
  if (attacked) await actor.update({ 'system.cena.armasAtacaram': attacked });
  const changes = weaponAmmoChanges(weapon.system);
  if (!changes) return;
  // Guarda o número antes de gravar: o `update` do Foundry reorganiza o objeto recebido
  // (`'system.quantidade'` vira `system.quantidade`), e lê-lo depois dava «undefined»
  const remaining = changes['system.quantidade'];
  await weapon.update(changes);
  const text = t('DESORDEM.Equipamento.MunicaoGasta', { nome: weapon.name, restantes: remaining });
  await postMessage({
    actor,
    content: `<p class="desordem-ficha__dica">${Handlebars.escapeExpression(text)}</p>`,
  });
}

/**
 * Munição escolhida para o ataque (efeito `municao`), conferida no próprio ator: precisa valer para
 * o alcance da arma e ter unidade sobrando. `null` sem munição.
 * @param {Actor} actor
 * @param {Item} weapon
 * @param {string|null} ammoId Item de munição marcado na janela pré-teste.
 */
export function ammoFor(actor, weapon, ammoId) {
  if (!ammoId || !weapon) return null;
  return ammoOptions([...actor.items], weapon.system).find((ammo) => ammo.id === ammoId) ?? null;
}

/**
 * Gasta uma unidade da munição usada no ataque (como o uso de um item: unidade, ou uso de uma
 * unidade) e avisa no chat que o gasto foi automático.
 * @param {Actor} actor
 * @param {string} ammoId
 */
export async function spendAmmo(actor, ammoId) {
  const item = actor.items.get(ammoId);
  const changes = item ? itemUseChanges(item.system) : null;
  if (!changes) return;
  // Guarda o número antes de gravar (o `update` reorganiza o objeto recebido)
  const remaining = changes['system.quantidade'] ?? item.system.quantidade;
  await item.update(changes);
  const text = t('DESORDEM.Equipamento.MunicaoUsada', { nome: item.name, restantes: remaining });
  await postMessage({
    actor,
    content: `<p class="desordem-ficha__dica">${Handlebars.escapeExpression(text)}</p>`,
  });
}

export async function attackWithWeapon(actor, weapon, options = {}) {
  const { system } = weapon;
  if (!canAttackWith(weapon)) return { result: null, amount: null };
  const companionDice = weaponCompanionDice(actor, weapon);
  const companion = companionDice.length > 0;
  const result = await rollSkill(actor, weaponSkill(system), {
    dt: 7,
    // Tipo do ataque para os filtros dos dados extras (a janela pré-teste já manda o mesmo)
    testKind: weaponTestKind(system),
    ...options,
    // Os efeitos da arma só valem no ataque com ela
    weaponId: weapon.id,
    extraDice: [...companionDice, ...(options.extraDice ?? [])],
  });
  // O teste foi feito: marca o ataque da cena e gasta a unidade da arma consumível
  await afterWeaponAttack(actor, weapon);
  // Munição marcada na janela (ex.: aljava): gasta uma unidade, acertando ou não
  const ammo = ammoFor(actor, weapon, options.municaoId);
  if (ammo) await spendAmmo(actor, ammo.id);
  // O dado do companheiro é o primeiro dado extra do teste
  if (companion && result.dice[2]?.source === 'extra' && result.dice[2].value === 1) {
    await actor.update({ 'system.cena.animalFerido': true });
    await abilityNote(actor, {
      entry: firstEffect(actor, 'companheiro'),
      text: t('DESORDEM.Habilidade.AnimalFerido'),
    });
  }
  if (!result.success) return { result, amount: null };
  // Dano: RA (ou RB) + modificador da arma + bônus da munição
  const amount = computeDamage(result, system.bonusDano + (ammo?.dano ?? 0), system.baseDano);
  await postMessage({
    actor,
    content: await render(TEMPLATE_ATAQUE, {
      name: actor.name,
      weapon: weapon.name,
      amount,
      high: damageBaseValue(result, system.baseDano),
      base: system.baseDano === 'rb' ? 'RB' : 'RA',
      formula: weaponDamageLabel(system.bonusDano + (ammo?.dano ?? 0), system.baseDano),
      nonLethal: system.naoLetal,
    }),
    flags: { danoArma: { amount, naoLetal: system.naoLetal } },
  });
  return { result, amount };
}

/**
 * Marca o cartão de ataque como aplicado (o Assumir ataque some). Quem não pode editar a mensagem
 * pede ao mestre ativo.
 */
async function markWeaponDamage(message) {
  if (weaponFlag(message)?.aplicado) return;
  if (message.canUserModify(game.user, 'update')) {
    await message.update({ [`flags.${SYSTEM_ID}.danoArma.aplicado`]: true });
  } else if (game.users.activeGM) {
    game.socket.emit(SOCKET, { action: 'weaponDamageApplied', messageId: message.id });
  }
}

/**
 * Aplica o dano do cartão de ataque por quem clicou: no Guardião, se alguém assumiu o ataque;
 * senão, nos tokens mirados (alvos); sem alvo mirado, em quem a pessoa escolher na janela «Quem
 * recebe» (personagem ou criatura da cena). Cada alvo que a pessoa controla passa pela janela
 * Resolver dano (Shift+clique: dano cheio, sem janela). Numa criatura que o jogador não controla,
 * o mestre aplica (com a RD, sem janela). O cartão só é marcado se algum dano foi aplicado.
 * @param {ChatMessage} message
 * @param {boolean} [shift=false] Shift+clique.
 */
async function applyWeaponDamage(message, shift = false) {
  const data = weaponFlag(message);
  if (!data) return;
  let targets;
  if (data.guardiao) {
    const guardian = await foundry.utils.fromUuid(data.guardiao.actorUuid);
    targets = guardian ? [guardian] : [];
  } else {
    targets = [...game.user.targets].map((token) => token.actor).filter(Boolean);
    if (!targets.length) {
      // Sem alvo: escolher personagem ou criatura (o personagem não precisa estar na cena)
      const picked = await pickDamageTarget();
      targets = picked ? [picked] : [];
    }
  }
  if (!targets.length) return;
  let applied = false;
  for (const target of targets) {
    if (!target.isOwner) {
      // Criatura do mestre: pede a ele que aplique (o mestre também marca o cartão)
      if (isThreat(target) && requestCreatureDamage(message, target)) continue;
      ui.notifications.warn(t('DESORDEM.Equipamento.SoMestre', { nome: target.name }));
      continue;
    }
    const result = await damageActor(target, data.amount, { nonLethal: data.naoLetal, shift });
    if (result) applied = true;
  }
  if (applied) await markWeaponDamage(message);
}

/**
 * Hook renderChatMessageHTML: liga o botão de aplicar dano do cartão de ataque, mostra o Guardião
 * (se alguém assumiu) e põe o botão de assumir o ataque enquanto ainda dá.
 */
export function renderEquipmentCard(message, html) {
  const button = html.querySelector('[data-desordem-aplicar-dano]');
  const data = weaponFlag(message);
  if (!button || !data) return;
  if (data.guardiao) {
    const line = document.createElement('p');
    line.className = 'desordem-ficha__dica';
    line.textContent = t('DESORDEM.Efeito.Guardiao.Alvo', {
      nome: data.guardiao.nome,
      habilidade: data.guardiao.habilidade,
    });
    button.before(line);
    button.textContent = t('DESORDEM.Equipamento.AplicarEm', { nome: data.guardiao.nome });
  }
  button.addEventListener('click', async (event) => {
    event.preventDefault();
    button.disabled = true;
    try {
      await applyWeaponDamage(message, event.shiftKey);
    } finally {
      button.disabled = false;
    }
  });
  if (!canGuardWeaponCard(data) || !message.isContentVisible) return;
  const attacker = attackerOf(message);
  const guards = guardButtons(message, { kind: 'arma', exclude: attacker ? [attacker.uuid] : [] });
  if (guards.length) button.after(...guards);
}

/** Fila do mestre para os cartões de ataque: cada gravação espera a anterior. */
let queue = Promise.resolve();
function enqueue(task) {
  queue = queue.then(task).catch((error) => console.error(`${SYSTEM_ID} | ataque`, error));
  return queue;
}

/**
 * Assumir ataque no cartão comum: o mestre confere que o cartão ainda aceita (dano não aplicado,
 * ninguém assumiu, o Guardião não é quem atacou) e grava o Guardião.
 */
registerGuardHandler('arma', {
  enqueue,
  check(message, data, guardian) {
    const flag = weaponFlag(message);
    const attacker = attackerOf(message);
    const next = guardWeaponCard(flag, guardian, attacker?.uuid ?? '');
    if (!next) return null;
    return {
      text: t('DESORDEM.Efeito.Nota.interceptarDe', { atacante: attacker?.name ?? '' }),
      apply: () => message.update({ [`flags.${SYSTEM_ID}.danoArma`]: next }),
    };
  },
});

/**
 * Jogador aplicando o dano numa criatura (que só o mestre controla): manda o pedido ao mestre
 * ativo. Sem mestre conectado, não dá (devolve `false` para o aviso de sempre).
 * @returns {boolean} Se o pedido foi enviado.
 */
function requestCreatureDamage(message, target) {
  if (!game.users.activeGM) return false;
  game.socket.emit(SOCKET, {
    action: 'weaponDamageCreature',
    messageId: message.id,
    actorUuid: target.uuid,
  });
  ui.notifications.info(t('DESORDEM.Dano.Janela.PedidoMestre', { nome: target.name }));
  return true;
}

/**
 * Dano de um cartão de ataque numa criatura, a pedido de um jogador: o mestre aplica (a RD vale;
 * sem janela, já que a criatura não tem armadura nem escudo) e marca o cartão. O valor vem do
 * cartão, não do pedido.
 */
async function applyCreatureDamage(data) {
  const message = game.messages.get(data.messageId);
  const flag = weaponFlag(message);
  if (!flag || flag.aplicado) return;
  const target = await foundry.utils.fromUuid(data.actorUuid);
  if (!target || !isThreat(target)) return;
  await damageActor(target, flag.amount, {
    nonLethal: flag.naoLetal,
    choices: { useArmor: false, useShield: false, shield: null },
  });
  await message.update({ [`flags.${SYSTEM_ID}.danoArma.aplicado`]: true });
}

/** Escuta os pedidos dos jogadores (só o mestre ativo atende): marcar o dano e dano em criatura. */
export function registerEquipmentSocket() {
  game.socket.on(SOCKET, (data) => {
    if (game.users.activeGM?.id !== game.user.id) return;
    if (data?.action === 'weaponDamageCreature') {
      enqueue(() => applyCreatureDamage(data));
      return;
    }
    if (data?.action !== 'weaponDamageApplied') return;
    const message = game.messages.get(data.messageId);
    if (!weaponFlag(message) || weaponFlag(message).aplicado) return;
    enqueue(() => message.update({ [`flags.${SYSTEM_ID}.danoArma.aplicado`]: true }));
  });
}
