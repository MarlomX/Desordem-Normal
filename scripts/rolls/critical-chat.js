/**
 * Ligação ao Foundry do efeito de falha crítica: sorteio (ou escolha do mestre) na tabela de
 * efeitos e aplicação à ficha. As regras da tabela estão em `critical-failure.js`.
 */
import { SYSTEM_ID } from '../config.js';
import { render, postMessage } from './chat.js';
import {
  DISASTER_DIE,
  DISASTERS,
  lookupDisaster,
  disasterExtraDie,
  disasterStepEffect,
  applyDisaster,
} from './critical-failure.js';
import { buildTableResultContext } from './presenter.js';
import { t } from '../shared/i18n.js';

const TEMPLATE_TABELA = `systems/${SYSTEM_ID}/templates/chat/tabela.hbs`;

/** Opções da lista "escolher o efeito" da janela (só o mestre vê). */
export const disasterChoices = () =>
  DISASTERS.map((entry) => ({ n: entry.n, label: t(`DESORDEM.FalhaCritica.${entry.key}.Nome`) }));

/**
 * Sorteia o efeito (d8) ou usa o número escolhido pelo mestre e, se o efeito perde PV ou PD,
 * rola também o d4 da perda. Não altera a ficha: isso é `applyDisasterDraw`.
 * @param {number|null} [manualValue] Número de 1 a 8 escolhido pelo mestre; null rola o d8.
 * @returns {Promise<{entry: object, rolls: Roll[], shown: number[], amount: number, manual: boolean}>}
 *   `rolls` inclui o d8 (se rolado) e o d4; `shown` é o número do d8 (o que a janela mostra).
 */
export async function drawDisaster(manualValue = null) {
  const manual = manualValue !== null;
  const rolls = [];
  let value = manualValue;
  if (!manual) {
    const roll = await new Roll(`1d${DISASTER_DIE}`).evaluate();
    rolls.push(roll);
    value = roll.total;
  }
  const entry = lookupDisaster(value);
  let amount = 0;
  const extraDie = disasterExtraDie(entry);
  if (extraDie) {
    const extra = await new Roll(`1d${extraDie}`).evaluate();
    rolls.push(extra);
    amount = extra.total;
  }
  return { entry, rolls, shown: [value], amount, manual };
}

/**
 * Aplica à ficha o efeito sorteado e publica o resultado no chat. Perder PV ou PD é uma redução
 * direta; se chegar a 0, o cartão apenas AVISA — o teste de lesão ou de trauma é feito pelo
 * jogador, no botão da ficha.
 * @param {Actor} actor
 * @param {object} pending Estado pendente do cartão (não usado aqui, por simetria com lesão/trauma).
 * @param {Awaited<ReturnType<typeof drawDisaster>>} drawn
 */
export async function applyDisasterDraw(actor, pending, drawn) {
  const { entry, amount, manual } = drawn;
  const effect =
    entry.kind === 'step'
      ? disasterStepEffect(
          entry,
          {
            name: t(`DESORDEM.FalhaCritica.${entry.key}.Nome`),
            description: t(`DESORDEM.FalhaCritica.${entry.key}.Descricao`),
          },
          foundry.utils.randomID(),
        )
      : undefined;
  const next = applyDisaster(
    {
      pv: actor.system.pv.value,
      pd: actor.system.pd.value,
      efeitos: actor.toObject().system.efeitos,
    },
    entry,
    { amount, effect },
  );

  const updates = {};
  if (entry.kind === 'hp') updates['system.pv.value'] = next.pv;
  if (entry.kind === 'pd') updates['system.pd.value'] = next.pd;
  if (entry.kind === 'step') updates['system.efeitos'] = next.efeitos;
  if (Object.keys(updates).length) await actor.update(updates);

  const context = buildTableResultContext({
    kind: 'disaster',
    entry,
    rolls: manual ? [] : [drawn.shown[0]],
    amount,
    manual,
    reachedZero: next.reachedZero,
  });
  await postMessage({
    actor,
    content: await render(TEMPLATE_TABELA, context),
    rolls: drawn.rolls,
  });
  return { entry, state: next };
}
