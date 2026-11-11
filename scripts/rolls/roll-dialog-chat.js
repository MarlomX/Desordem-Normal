/* global document */
/**
 * Janela pré-teste (Foundry): o jogador escolhe dados bônus, habilidades e o que fazer com o
 * pavor antes de rolar. A lógica (opções, custos, prévia) está em `roll-dialog.js`.
 */
import { SYSTEM_ID } from '../config.js';
import { hasAbility } from './abilities.js';
import { buildBonusSlots } from './bonus.js';
import { render, testDicePreview } from './chat.js';
import {
  buildRollModel,
  emptySelection,
  evaluateSelection,
  selectionToOptions,
} from './roll-dialog.js';

const TEMPLATE = `systems/${SYSTEM_ID}/templates/dialog/pre-teste.hbs`;

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

/** Lê a escolha atual dos campos da janela. */
function readSelection(form) {
  const fields = form.elements;
  return {
    bonus: [Number(fields.bonus0?.value), Number(fields.bonus1?.value)],
    active: [...form.querySelectorAll('input[name="active"]:checked')].map((box) => box.value),
    controlFear: Boolean(fields.controlFear?.checked),
    embraceFear: Boolean(fields.embraceFear?.checked),
  };
}

/** Cria o desenho de um dado para a prévia. */
function previewDie(sides, { discarded = false, fear = false } = {}) {
  const el = document.createElement('span');
  el.className = `desordem-forma desordem-forma--mini desordem-d-${sides}`;
  if (fear) el.classList.add('desordem-forma--pavor');
  if (discarded) el.classList.add('is-descartado');
  const value = document.createElement('span');
  value.className = 'desordem-forma__valor';
  value.textContent = String(sides);
  el.append(value);
  return el;
}

/** Atualiza prévia, avisos, resumo e o botão de rolar conforme as escolhas. */
function refresh(form, root, model) {
  const evaluation = evaluateSelection(model, readSelection(form));

  // Espaços de dado bônus
  evaluation.selection.bonus.forEach((sides, index) => {
    const slot = root.querySelector(`[data-bonus-slot="${index}"]`);
    if (!slot) return;
    slot.className = slot.className.replace(/desordem-d-\d+/, `desordem-d-${sides}`);
    slot.classList.toggle('is-vazio', sides === 0);
    slot.querySelector('.desordem-forma__valor').textContent = sides === 0 ? '✕' : String(sides);
  });

  // Prévia dos dados
  const preview = root.querySelector('[data-previa]');
  preview.replaceChildren(
    ...evaluation.rolledSides.map((sides) => previewDie(sides)),
    ...evaluation.discardedExtras.map((sides) => previewDie(sides, { discarded: true })),
    ...(evaluation.fear?.die ? [previewDie(evaluation.fear.die, { fear: true })] : []),
  );

  // Aviso do limite de dados
  const warning = [];
  if (evaluation.discardedExtras.length) {
    warning.push(
      t('DESORDEM.Teste.Pre.Descartados', {
        dados: evaluation.discardedExtras.map((sides) => `d${sides}`).join(', '),
      }),
    );
  }
  if (evaluation.rolledSides.length > evaluation.summedDice) {
    warning.push(t('DESORDEM.Teste.Pre.SomamTres'));
  }
  root.querySelector('[data-aviso]').textContent = warning.join(' ');

  // Resumo de custos
  const costs = [];
  if (evaluation.pdCost) costs.push(t('DESORDEM.Teste.Pre.CustoPD', { n: evaluation.pdCost }));
  if (evaluation.impetoCost) {
    costs.push(t('DESORDEM.Teste.Pre.CustoImpeto', { n: evaluation.impetoCost }));
  }
  const summary = costs.length
    ? t('DESORDEM.Teste.Pre.Resumo', {
        custos: costs.join(' · '),
        pd: evaluation.pdLeft,
        impeto: evaluation.impetoLeft,
      })
    : t('DESORDEM.Teste.Pre.SemCusto');
  const errors = evaluation.errors.map((key) => t(`DESORDEM.Teste.Pre.Erro.${key}`));
  root.querySelector('[data-resumo]').textContent = [summary, ...errors].join(' ');
  root.classList.toggle('tem-erro', !evaluation.valid);

  const roll = root.closest('.application')?.querySelector('[data-action="roll"]');
  if (roll) roll.disabled = !evaluation.valid;
}

/**
 * Abre a janela pré-teste e devolve as opções para a rolagem (`extraDice`, `active`, `controlFear`,
 * `embraceFear`), ou `null` se o jogador cancelar. Com Shift, rola direto, sem janela.
 * @param {Actor} actor
 * @param {Object} config
 * @param {string} config.skillKey Perícia ou aptidão do teste.
 * @param {string} [config.attribute] Atributo, se não for o padrão da perícia.
 * @param {number[]} [config.baseExtraDice] Dados extras fixos do teste (companheiro, não letal).
 * @param {boolean} [config.ignoreFear] Testes que não sofrem o dado de pavor.
 * @param {boolean} [config.shift] Pular a janela (Shift+clique).
 */
export async function askRollChoices(
  actor,
  { skillKey, attribute, baseExtraDice = [], ignoreFear = false, shift = false },
) {
  if (shift) return {};
  const dice = testDicePreview(actor, skillKey, attribute);
  const model = buildRollModel({
    skillKey,
    attrDie: dice.attrDie,
    skillDie: dice.skillDie,
    baseExtraDice,
    has: { impeto: hasAbility(actor, 'impeto'), sorrateiro: hasAbility(actor, 'sorrateiro') },
    resources: { impeto: actor.system.recursos.impeto, pd: actor.system.pd.value },
    fearDie: actor.system.estado.pavor,
    ignoreFear,
  });

  const costText = (cost) =>
    [
      cost.pd ? t('DESORDEM.Teste.Pre.CustoPD', { n: cost.pd }) : '',
      cost.impeto ? t('DESORDEM.Teste.Pre.CustoImpeto', { n: cost.impeto }) : '',
    ]
      .filter(Boolean)
      .join(' · ');
  const content = await render(TEMPLATE, {
    titulo: `${dice.attrLabel} + ${dice.skillLabel}`,
    bonusSlots: buildBonusSlots([], t('DESORDEM.Ficha.Bonus.Vazio')),
    abilities: model.abilities.map((ability) => ({
      ...ability,
      label: t(`DESORDEM.Teste.Pre.Hab.${ability.key}`, { die: ability.die }),
      costText: costText(ability.cost),
      reasonText: ability.reason ? t(`DESORDEM.Teste.Pre.Indisponivel.${ability.reason}`) : '',
    })),
    fear: model.fear && {
      ...model.fear,
      title: t('DESORDEM.Teste.Pre.Pavor', { die: model.fear.die }),
      controlText: model.fear.controlPossible
        ? t('DESORDEM.Teste.Pre.ControlarEfeito', {
            custo: model.fear.controlCost,
            die: model.fear.controlledDie,
          })
        : t('DESORDEM.Teste.Pre.ControlarNaoDesce'),
      embraceText: t('DESORDEM.Teste.Pre.AbracarEfeito', { custo: model.fear.embraceCost }),
    },
  });

  const selection = await foundry.applications.api.DialogV2.wait({
    window: { title: t('DESORDEM.Teste.Pre.Titulo') },
    classes: ['desordem-normal', 'desordem-pre-teste'],
    content,
    modal: true,
    rejectClose: false,
    render: (event, dialog) => {
      const root = dialog.element.querySelector('.desordem-pre');
      const form = root.closest('form') ?? dialog.element.querySelector('form');
      form.addEventListener('change', () => refresh(form, root, model));
      refresh(form, root, model);
    },
    buttons: [
      {
        action: 'roll',
        label: t('DESORDEM.Teste.Pre.Rolar'),
        icon: 'fa-solid fa-dice-d20',
        default: true,
        callback: (event, button) => readSelection(button.form),
      },
      { action: 'cancel', label: t('DESORDEM.Teste.Pre.Cancelar'), callback: () => null },
    ],
  });
  return selection ? selectionToOptions(model, selection) : null;
}

export { emptySelection };
