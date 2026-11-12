/* global document */
/**
 * Janela pré-teste (Foundry): o jogador escolhe dados bônus, habilidades e o que fazer com o
 * pavor antes de rolar. A lógica (opções, custos, prévia) está em `roll-dialog.js`.
 */
import { SYSTEM_ID } from '../config.js';
import { hasAbility } from './abilities.js';
import { render, testDicePreview } from './chat.js';
import { buildFearDie } from '../sheets/dado-pavor.js';
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
    dt: fields.dt?.value,
  };
}

/** Cria o desenho de um dado para a prévia (o dado de pavor usa o desenho neon em SVG). */
function previewDie(sides, { fear = false } = {}) {
  const el = document.createElement('span');
  if (fear) {
    // buildFearDie só deixa dígitos no SVG, então é seguro usar como HTML
    el.className = 'desordem-previa-pavor';
    el.innerHTML = buildFearDie({ sides });
    return el;
  }
  el.className = `desordem-forma desordem-forma--grande desordem-d-${sides}`;
  const value = document.createElement('span');
  value.className = 'desordem-forma__valor';
  value.textContent = String(sides);
  el.append(value);
  return el;
}

/**
 * Cria um espaço de dado extra. Espaços travados (habilidade, pavor, dado fixo) mostram a origem e
 * não têm menu; espaços livres têm o menu de dado e valem como bônus manual.
 */
function slotElement(slot, manualIndex) {
  const wrapper = document.createElement('span');
  wrapper.className = 'desordem-pre__slot';
  wrapper.classList.toggle('is-travado', slot.locked);

  const die = document.createElement('span');
  die.className = `desordem-forma desordem-forma--grande desordem-d-${slot.sides}`;
  die.classList.toggle('is-vazio', slot.sides === 0);
  const value = document.createElement('span');
  value.className = 'desordem-forma__valor';
  value.textContent = slot.sides === 0 ? '✕' : String(slot.sides);
  die.append(value);

  if (!slot.locked) {
    const select = document.createElement('select');
    select.className = 'desordem-forma__select';
    select.name = `bonus${manualIndex}`;
    for (const sides of [0, 4, 6, 8, 10, 12]) {
      const option = document.createElement('option');
      option.value = String(sides);
      option.textContent = sides === 0 ? t('DESORDEM.Ficha.Bonus.Vazio') : `d${sides}`;
      option.selected = sides === slot.sides;
      select.append(option);
    }
    die.append(select);
  }

  const origin = document.createElement('small');
  origin.className = 'desordem-pre__origem';
  origin.textContent = t(`DESORDEM.Teste.Pre.Origem.${slot.kind}`);
  wrapper.append(die, origin);
  return wrapper;
}

/** Bloco de custo com número grande (PD ou ímpeto): "−3 PD · restam 7". */
function costBlock(kind, spent, left) {
  const block = document.createElement('div');
  block.className = `desordem-custo desordem-custo--${kind}`;
  block.classList.toggle('is-negativo', left < 0);
  const amount = document.createElement('strong');
  amount.textContent = `−${spent}`;
  const unit = document.createElement('span');
  unit.className = 'desordem-custo__unidade';
  unit.textContent = t(`DESORDEM.Teste.Pre.Unidade.${kind}`);
  const remaining = document.createElement('small');
  remaining.textContent = t('DESORDEM.Teste.Pre.Restam', { n: left });
  block.append(amount, unit, remaining);
  return block;
}

/** Atualiza prévia, espaços, bloqueios, custos e o botão de rolar conforme as escolhas. */
function refresh(form, root, model) {
  const evaluation = evaluateSelection(model, readSelection(form));

  // Espaços de dado extra (refeitos a cada mudança; os bônus manuais mantêm seus valores)
  let manualIndex = 0;
  root
    .querySelector('[data-slots]')
    .replaceChildren(
      ...evaluation.slots.map((slot) => slotElement(slot, slot.locked ? -1 : manualIndex++)),
    );

  // Habilidades e pavor abraçado sem espaço livre ficam bloqueados (menos as já marcadas)
  const noRoom = t('DESORDEM.Teste.Pre.SemEspaco');
  for (const option of root.querySelectorAll('[data-opcao]')) {
    const key = option.dataset.opcao;
    const input = option.querySelector('input');
    const blocked =
      key === 'embrace' ? evaluation.blocked.embrace : evaluation.blocked.abilities.includes(key);
    const unavailable = model.abilities.some((a) => a.key === key && !a.available);
    input.disabled = unavailable || blocked;
    option.classList.toggle('is-indisponivel', unavailable || blocked);
    option.querySelector('[data-motivo]').textContent = blocked ? noRoom : '';
  }

  // Prévia dos dados rolados (o dado de pavor normal aparece por último, fora do limite)
  root
    .querySelector('[data-previa]')
    .replaceChildren(
      ...evaluation.rolledSides.map((sides) => previewDie(sides)),
      ...(evaluation.fear?.die ? [previewDie(evaluation.fear.die, { fear: true })] : []),
    );

  // Custos em destaque
  const costs = root.querySelector('[data-custos]');
  const blocks = [];
  if (evaluation.pdCost) blocks.push(costBlock('pd', evaluation.pdCost, evaluation.pdLeft));
  if (evaluation.impetoCost) {
    blocks.push(costBlock('impeto', evaluation.impetoCost, evaluation.impetoLeft));
  }
  if (blocks.length) {
    costs.replaceChildren(...blocks);
  } else {
    const none = document.createElement('span');
    none.className = 'desordem-custo__nenhum';
    none.textContent = t('DESORDEM.Teste.Pre.SemCusto');
    costs.replaceChildren(none);
  }
  root.querySelector('[data-erro]').textContent = evaluation.errors
    .map((key) => t(`DESORDEM.Teste.Pre.Erro.${key}`))
    .join(' ');
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
 * @param {number} [config.dt=7] DT padrão do teste (editável na janela).
 * @param {boolean} [config.showDt=true] Falso em testes sem DT (esquiva).
 * @param {boolean} [config.shift] Pular a janela (Shift+clique).
 */
export async function askRollChoices(
  actor,
  {
    skillKey,
    attribute,
    baseExtraDice = [],
    ignoreFear = false,
    dt = 7,
    showDt = true,
    shift = false,
  },
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
    dt,
    showDt,
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
    showDt,
    dt,
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

  const answer = await foundry.applications.api.DialogV2.wait({
    window: { title: t('DESORDEM.Teste.Pre.Titulo') },
    classes: ['desordem-normal', 'desordem-pre-teste'],
    content,
    modal: true,
    rejectClose: false,
    render: (event, dialog) => {
      const root = dialog.element.querySelector('.desordem-pre');
      const form = root.closest('form') ?? dialog.element.querySelector('form');
      form.addEventListener('change', () => refresh(form, root, model));
      form.addEventListener('input', (event) => {
        if (event.target.name === 'dt') refresh(form, root, model);
      });
      for (const button of root.querySelectorAll('[data-dt-passo]')) {
        button.addEventListener('click', () => {
          const field = form.elements.dt;
          field.value = String(
            Math.max(1, Number(field.value || dt) + Number(button.dataset.dtPasso)),
          );
          refresh(form, root, model);
        });
      }
      refresh(form, root, model);
    },
    buttons: [
      {
        action: 'roll',
        label: t('DESORDEM.Teste.Pre.Rolar'),
        icon: 'fa-solid fa-dice-d20',
        default: true,
        callback: (event, button) => ({ confirmed: true, selection: readSelection(button.form) }),
      },
      { action: 'cancel', label: t('DESORDEM.Teste.Pre.Cancelar') },
    ],
  });
  // Só o botão Rolar confirma. Cancelar e fechar a janela devolvem outra coisa (o nome da ação
  // ou null) e não podem rolar.
  if (answer?.confirmed !== true) return null;
  return selectionToOptions(model, answer.selection);
}

export { emptySelection };
