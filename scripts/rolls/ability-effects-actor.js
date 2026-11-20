/**
 * Efeitos de habilidade de um ator do Foundry: junta os itens do ator com a lógica pura de
 * ability-effects.js. Só lê o ator (e `game.combat`, para o limite por rodada); quem grava é
 * quem chama.
 */
import {
  collectEffects,
  effectKey,
  effectsOfType,
  resourceDefs,
  resourceValue,
  roundLimitOk,
  triggerChanges,
} from './ability-effects.js';

/**
 * Todos os efeitos das habilidades do ator, cada um com `itemId` e `itemName`.
 * `actor.items` é uma Collection do Foundry, que pode ser percorrida como uma lista.
 */
export function actorEffects(actor) {
  return collectEffects(actor?.items ?? []);
}

/** Primeiro efeito de um tipo (de um item, se `itemId` for informado), ou `null`. */
export function firstEffect(actor, tipo, itemId = null, entries = actorEffects(actor)) {
  return effectsOfType(entries, tipo, itemId)[0] ?? null;
}

/**
 * Recursos do ator: definições (máximo, nome...) e valores atuais, já limitados ao máximo.
 * Uma criatura não tem `recursosHab`: todos valem 0.
 * @returns {{defs: Object<string, object>, values: Object<string, number>}}
 */
export function actorResources(actor, entries = actorEffects(actor)) {
  const defs = resourceDefs(entries);
  const stored = actor?.system?.recursosHab ?? {};
  const values = Object.fromEntries(
    Object.keys(defs).map((chave) => [chave, resourceValue(stored, defs, chave)]),
  );
  return { defs, values };
}

/**
 * Recurso gasto no ajuste dos dados depois de rolar (efeito `ajusteDados`; na análise, os
 * marcadores) e quanto o ator tem dele. `null` se o ator não tem o efeito ou o recurso.
 * @returns {{chave: string, points: number}|null}
 */
export function adjustResource(actor) {
  const entries = actorEffects(actor);
  const entry = firstEffect(actor, 'ajusteDados', null, entries);
  if (!entry) return null;
  const { defs, values } = actorResources(actor, entries);
  const chave = entry.params.recurso;
  return defs[chave] ? { chave, points: values[chave] } : null;
}

/**
 * Quem pode repetir um dado (efeito `rerrolar`, ex.: Prontidão) num cartão de teste: o primeiro,
 * entre o token selecionado no mapa, quem fez o teste e o personagem atribuído ao usuário, que
 * seja do usuário e tenha o efeito. Assim o botão aparece no próprio teste mesmo rolando pela
 * ficha, sem token selecionado.
 * @param {Actor|null} speaker Ator que fez o teste.
 * @returns {Actor|null}
 */
export function rerollActor(speaker) {
  const candidates = [
    globalThis.canvas?.tokens?.controlled?.[0]?.actor,
    speaker,
    game.user?.character,
  ];
  return candidates.find((actor) => actor?.isOwner && firstEffect(actor, 'rerrolar')) ?? null;
}

/** O que o ator tem para pagar custos: PD, PV e recursos (`canPay`, `payUpdates`). */
export function walletOf(actor, entries = actorEffects(actor)) {
  return {
    pd: actor?.system?.pd?.value ?? 0,
    pv: actor?.system?.pv?.value ?? 0,
    recursos: actorResources(actor, entries).values,
  };
}

/** Caminhos de gravação dos recursos que mudaram (`{chave: valor}` → `system.recursosHab.*`). */
export function resourceUpdates(changes) {
  return Object.fromEntries(
    Object.entries(changes).map(([chave, value]) => [`system.recursosHab.${chave}`, value]),
  );
}

/**
 * Gravação dos ganhos de um gatilho (efeitos `ganharRecurso`), ex.: `'falha'`, `'perdeOposto'`.
 * Vazio se nada muda ou se o ator não tem recursos de habilidade (criaturas).
 * @param {Actor} actor
 * @param {string} trigger
 * @param {string|null} [itemId] Só os efeitos deste item.
 * @param {Object<string, number>} [values] Valores de partida (padrão: os do ator).
 */
export function triggerUpdates(actor, trigger, itemId = null, values = null) {
  if (!actor?.system?.recursosHab) return {};
  const entries = actorEffects(actor);
  const start = values ?? actorResources(actor, entries).values;
  return resourceUpdates(triggerChanges(entries, start, trigger, itemId));
}

/** Combate e rodada atuais (`null` fora de combate ou antes de o combate começar). */
export function currentRound() {
  const combat = game.combat;
  return combat?.started ? { combate: combat.id, rodada: combat.round } : null;
}

/** O efeito ainda pode ser usado nesta rodada? (Efeitos sem limite: sempre.) */
export function usableThisRound(actor, entry) {
  if (entry?.params?.limite !== 'rodadaCombate') return true;
  return roundLimitOk(actor?.system?.usosRodada?.[effectKey(entry)], currentRound());
}

/** Gravação que marca o uso do efeito nesta rodada (nada fora de combate ou sem limite). */
export function roundUseUpdate(entry) {
  const now = currentRound();
  if (!now || entry?.params?.limite !== 'rodadaCombate') return {};
  return { [`system.usosRodada.${effectKey(entry)}`]: now };
}
