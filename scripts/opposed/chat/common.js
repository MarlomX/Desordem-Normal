/**
 * Teste oposto: templates, estado do cartão e as escolhas de cada lado (perícias, armas,
 * defesas, oponente mirado, atores da cena).
 * Parte de `opposed-chat.js` (v0.28.8).
 */
import { SYSTEM_ID } from '../../config.js';
import { OPPOSED_ACTOR_TYPES, acceptCandidates } from '../candidates.js';
import { render } from '../../rolls/chat.js';
import { weaponDamageLabel, weaponSkill } from '../../rolls/equipment.js';
import {
  buildOpposedCardContext,
  defenseChoices,
  opposedSkillChoices,
  weaponChoices,
} from '../../rolls/opposed-card.js';
import { t } from '../../shared/i18n.js';

const TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/oposto-cartao.hbs`;
export const TEMPLATE_DIALOG = `systems/${SYSTEM_ID}/templates/dialog/oposto.hbs`;
export const TEMPLATE_PICKER = `systems/${SYSTEM_ID}/templates/dialog/oposto-ator.hbs`;
const ACTOR_TYPES = OPPOSED_ACTOR_TYPES;

/** Estado do cartão guardado na mensagem (ou null, se a mensagem não é um cartão de oposto). */
export const cardState = (message) => message?.flags?.[SYSTEM_ID]?.oposto ?? null;

/** Marca do teste que responde a um cartão. */
export const answerFlag = (message) => message?.flags?.[SYSTEM_ID]?.respostaOposto ?? null;

export const otherSide = (side) => (side === 'a' ? 'b' : 'a');

/** HTML do cartão para um estado. */
export function renderCard(state) {
  const context = buildOpposedCardContext(state);
  return render(TEMPLATE, { ...context, lados: [context.a, context.b] });
}

/** Perícias que o ator pode usar na disputa simples (para os seletores das janelas). */
export function skillChoicesFor(actor) {
  return opposedSkillChoices(actor.system, {
    skill: (key) => t(`DESORDEM.Pericias.${key}`),
    aptitude: (key) => `${t('DESORDEM.Ficha.Aptidoes')}: ${t(`DESORDEM.Aptidoes.${key}`)}`,
    craft: (key) => `${t('DESORDEM.Ficha.Oficios')}: ${t(`DESORDEM.Oficios.${key}`)}`,
    extra: (group, name) => name || t(`DESORDEM.Ficha.ExtraSemNome.${group}`),
  });
}

/** Armas do ator que servem para o cartão, com «Luta, RA+2» no rótulo. */
export function weaponsFor(actor, tipo) {
  const items = actor.items.map((item) => ({
    id: item.id,
    name: item.name,
    type: item.type,
    system: item.system,
  }));
  return weaponChoices(items, tipo).map((weapon) => ({
    ...weapon,
    label: `${t(`DESORDEM.Pericias.${weaponSkill(weapon)}`)}, ${weaponDamageLabel(weapon.bonusDano, weapon.baseDano)}`,
  }));
}

/** Opções de Defender-se (Luta só contra corpo a corpo). */
export function defenseSkillsFor(attackWeapon) {
  return defenseChoices(attackWeapon).map(({ key, soCorpo }) => ({
    key,
    label: soCorpo
      ? t('DESORDEM.Oposto.DefesaSoCorpo', { pericia: t(`DESORDEM.Pericias.${key}`) })
      : t('DESORDEM.Oposto.DefesaCom', { pericia: t(`DESORDEM.Pericias.${key}`) }),
  }));
}

/** O único token mirado, se for de outro ator (o oponente sugerido). */
export function targetedOpponent(actor) {
  const targets = [...game.user.targets].map((token) => token.actor).filter(Boolean);
  if (targets.length !== 1) return null;
  const [target] = targets;
  return target.uuid !== actor.uuid && ACTOR_TYPES.includes(target.type) ? target : null;
}

/**
 * Atores com que este usuário pode aceitar um lado em aberto (regra em `acceptCandidates`): os
 * tokens selecionados, o personagem dele e, para jogadores, todos os atores de que é dono; para o
 * mestre, os tokens da cena e, se nenhum servir, qualquer personagem ou criatura do mundo (v0.25.3).
 * Nunca o ator do outro lado.
 */
export function candidateActors(excludeUuid) {
  const actorsOf = (tokens) => [...(tokens ?? [])].map((token) => token.actor);
  return acceptCandidates({
    isGM: game.user.isGM,
    controlled: actorsOf(globalThis.canvas?.tokens?.controlled),
    character: game.user.character,
    sceneActors: actorsOf(globalThis.canvas?.scene?.tokens),
    worldActors: [...game.actors],
    excludeUuid,
  });
}
