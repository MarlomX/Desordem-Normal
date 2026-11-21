/**
 * Janela Resolver dano (lado Foundry): abre no navegador de quem clicou em aplicar o dano e
 * devolve as escolhas (gastar ponto de armadura, usar a redução do escudo). As contas ficam em
 * damage-resolve.js; quem grava é `damageActor` (health.js).
 */
import { SYSTEM_ID } from '../config.js';
import { render } from './chat.js';
import { ARMOR_REDUCTION } from './equipment.js';
import { damageCandidates, resolveDamage, shieldReduction } from './damage-resolve.js';
import { armorAvailable } from './armor-chat.js';
import { actorEffects } from './ability-effects-actor.js';
import { isThreat, threatDamage } from './threat.js';

const TEMPLATE = `systems/${SYSTEM_ID}/templates/dialog/dano.hbs`;

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

/**
 * Redução do escudo do ator para um dano de teste oposto: o efeito `reducaoEscudo` do escudo
 * empunhado (só ele traz o efeito, por `collectEffects`) e o resumo do teste dele.
 * @param {Actor} actor Quem recebe o dano.
 * @param {{total: number, lowRoll: number}|null} defender Resumo do teste de quem recebe.
 */
export function actorShield(actor, defender) {
  if (!defender || isThreat(actor)) return null;
  const entry = actorEffects(actor).find((e) => e.tipo === 'reducaoEscudo');
  return shieldReduction(entry?.params ?? null, defender);
}

/**
 * Abre a janela Resolver dano. Com `shift` (Shift+clique), não abre: o dano vai cheio (sem
 * armadura nem escudo; a RD da criatura continua valendo, em `damageActor`).
 * @param {Actor} actor Quem recebe o dano.
 * @param {number} amount Dano que chega.
 * @param {Object} [options]
 * @param {boolean} [options.nonLethal=false]
 * @param {boolean} [options.shift=false]
 * @param {{total: number, lowRoll: number}|null} [options.defender] Resumo do teste de quem recebe
 *   (só no teste oposto: a redução do escudo depende dele).
 * @returns {Promise<{useArmor: boolean, useShield: boolean, shield: object|null}|null>} As escolhas,
 *   ou `null` se a pessoa cancelou (o dano não é aplicado).
 */
export async function askDamage(
  actor,
  amount,
  { nonLethal = false, shift = false, defender = null } = {},
) {
  const shield = actorShield(actor, defender);
  if (shift) return { useArmor: false, useShield: false, shield };
  const threat = isThreat(actor);
  const available = threat ? 0 : armorAvailable(actor);
  // Dano final ao abrir: criatura com a RD; personagem sem armadura e com o escudo, se valer
  const initial = threat
    ? threatDamage({
        current: actor.system.pv.value,
        amount: Math.trunc(amount),
        rd: actor.system.rd,
      }).amount
    : resolveDamage({ amount, useShield: true, shield }).final;
  const content = await render(TEMPLATE, {
    name: actor.name,
    amount,
    nonLethal,
    threat,
    rd: actor.system.rd ?? 0,
    armorAvailable: available,
    armorReduction: ARMOR_REDUCTION,
    shield,
    final: initial,
  });
  const answer = await foundry.applications.api.DialogV2.wait({
    window: { title: t('DESORDEM.Dano.Janela.Titulo') },
    classes: ['desordem-normal', 'desordem-dano-dialogo'],
    content,
    modal: true,
    rejectClose: false,
    render: (event, dialog) => {
      // Atualiza o dano final a cada caixa marcada ou desmarcada
      const form = dialog.element.querySelector('form') ?? dialog.element;
      const output = dialog.element.querySelector('[data-dano-final]');
      form.addEventListener('change', () => {
        if (threat || !output) return;
        output.textContent = String(
          resolveDamage({
            amount,
            useArmor: Boolean(form.querySelector('[name="useArmor"]')?.checked),
            armorAvailable: available,
            useShield: Boolean(form.querySelector('[name="useShield"]')?.checked),
            shield,
          }).final,
        );
      });
    },
    buttons: [
      {
        action: 'apply',
        label: t('DESORDEM.Dano.Janela.Aplicar'),
        icon: 'fa-solid fa-heart-crack',
        default: true,
        callback: (event, button) => ({
          confirmed: true,
          useArmor: Boolean(button.form.querySelector('[name="useArmor"]')?.checked),
          useShield: Boolean(button.form.querySelector('[name="useShield"]')?.checked),
        }),
      },
      { action: 'cancel', label: t('DESORDEM.Dano.Janela.Cancelar') },
    ],
  });
  // Só o botão Aplicar confirma (Cancelar e fechar devolvem outra coisa)
  if (answer?.confirmed !== true) return null;
  return { useArmor: answer.useArmor, useShield: answer.useShield, shield };
}

/**
 * Sem alvo mirado: quem recebe o dano do cartão de ataque comum. O jogador com uma só ficha recebe
 * direto; com várias (ou o mestre, sempre) escolhe numa lista de personagens.
 * @returns {Promise<Actor|null>}
 */
export async function pickDamageTarget() {
  const { candidates, direct } = damageCandidates([...game.actors], { isGM: game.user.isGM });
  if (direct) return direct;
  if (!candidates.length) {
    ui.notifications.warn(t('DESORDEM.Equipamento.SemAlvo'));
    return null;
  }
  const options = candidates
    .map(
      (actor) => `<option value="${actor.id}">${Handlebars.escapeExpression(actor.name)}</option>`,
    )
    .join('');
  const id = await foundry.applications.api.DialogV2.prompt({
    window: { title: t('DESORDEM.Dano.Janela.QuemRecebe') },
    content: `<p>${t('DESORDEM.Dano.Janela.SemAlvo')}</p><select name="alvo">${options}</select>`,
    ok: {
      label: t('DESORDEM.Dano.Janela.Escolher'),
      callback: (event, button) => button.form.elements.alvo.value,
    },
    rejectClose: false,
    modal: true,
  });
  return id ? (game.actors.get(id) ?? null) : null;
}
