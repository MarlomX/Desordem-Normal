/**
 * Ações iguais nas fichas de personagem e de criatura (v0.28.5). Antes cada ficha tinha a sua
 * cópia. São funções comuns (`function`, não flecha) porque o ApplicationV2 chama as ações com
 * `this` = a ficha; as duas classes continuam declarando os mesmos `actions` (os mesmos
 * `data-action` dos templates).
 */
import { attributeChoiceUpdate } from '../rolls/attribute.js';
import { removeEffect } from '../rolls/effects.js';
import { setSteps, stepBy, stepIndicator, stepLimits } from '../rolls/steps.js';
import { proposeOpposed } from '../opposed/opposed-chat.js';
import {
  createConditionEffect,
  openConditionEffect,
  pickConditionEffect,
} from './condition-effects-ui.js';
import { t } from '../shared/i18n.js';

/**
 * HTML de uma nota pronto para leitura: links de documentos (`@UUID[...]`), rolagens em linha e,
 * para quem é dono, os blocos secretos.
 * @param {Actor} actor
 * @param {string} html
 */
export function enrichActorNote(actor, html) {
  return foundry.applications.ux.TextEditor.implementation.enrichHTML(html, {
    secrets: actor.isOwner,
    relativeTo: actor,
    rollData: actor.getRollData?.() ?? {},
  });
}

/** Ação `addEffect`: efeito vazio no fim da lista, já aberto na janela de edição. */
export async function addEffect() {
  await createConditionEffect(this.document);
}

/** Ação `editEffect`: abre o efeito da linha (`data-index`) na janela de edição. */
export async function editEffect(event, target) {
  await openConditionEffect(this.document, Number(target.dataset.index));
}

/** Ação `pickEffect`: lista «Do compêndio», escolhe um Item de efeito e o copia para a ficha. */
export async function pickEffect() {
  await pickConditionEffect(this.document);
}

/** Ação `removeEffect`: tira o efeito da linha (`data-index`). */
export async function removeEffectAction(event, target) {
  const effects = this.document.toObject().system.efeitos;
  await this.document.update({
    'system.efeitos': removeEffect(effects, Number(target.dataset.index)),
  });
}

/** Ação `proposeOpposed`: abre a proposta de teste oposto com este ator. */
export async function proposeOpposedAction() {
  await proposeOpposed(this.document);
}

/** Ação `toggleAbilities`: abre todas as habilidades (ou fecha, se já estão todas abertas). */
export function toggleAbilities() {
  const all = [...this.element.querySelectorAll('details[data-habilidade]')];
  const open = all.some((details) => !details.open);
  for (const details of all) details.open = open;
}

/** Ação `editItem`: abre a ficha do item da linha (`data-item-id`). */
export function editItem(event, target) {
  this.document.items.get(target.dataset.itemId)?.sheet.render(true);
}

/** Ação `deleteItem`: confirma e apaga o item da linha (`data-item-id`). */
export async function deleteItem(event, target) {
  const item = this.document.items.get(target.dataset.itemId);
  if (!item) return;
  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: { title: t('DESORDEM.Item.Remover') },
    content: `<p>${t('DESORDEM.Item.ConfirmarRemover')}</p>`,
    rejectClose: false,
    modal: true,
  });
  if (confirmed === true) await item.delete();
}

/**
 * Ação `stepSteps`: muda os passos manuais (`data-key`: um atributo ou 'pericias') em
 * `data-delta`, ou zera (`data-reset`). O passo manual de um atributo não passa do que leva o
 * dado a d12 (ou d4); o geral não tem limite.
 */
export async function stepSteps(event, target) {
  const key = target.dataset.key;
  const data = this.document.toObject().system;
  const current = data.passos;
  const limits =
    key === 'pericias'
      ? undefined
      : stepLimits(
          data.atributos[key],
          stepIndicator({ steps: current, effects: data.efeitos, key }).effects,
        );
  const next = target.dataset.reset
    ? setSteps(current, key, 0)
    : stepBy(current, key, Number(target.dataset.delta), limits);
  await this.document.update({ [`system.passos.${key}`]: next[key] });
}

/**
 * Atributo-base escolhido numa linha de perícia (campo `data-key`): grava só se a escolha mudou
 * algo. Chamado no `change` do campo, com `this` = a ficha.
 * @param {HTMLSelectElement} field
 */
export async function attributeField(field) {
  const change = attributeChoiceUpdate(
    this.document.toObject().system,
    field.dataset.key,
    field.value,
  );
  if (change) await this.document.update({ [`system.${change.path}`]: change.value });
}
