/* global fromUuid */
/**
 * Lado Foundry dos efeitos da aba Condição (v0.22.1), usado pelas fichas de personagem e de
 * criatura:
 * - abrir a janela de edição de um efeito (`openConditionEffect`), garantindo antes que todos os
 *   efeitos têm id gravado;
 * - criar um efeito vazio e já abri-lo (`createConditionEffect`);
 * - escolher um efeito pronto na lista «Do compêndio» (`pickConditionEffect`) ou soltar um Item de
 *   efeito na ficha (`addEffectFromItem`): nos dois casos o item é copiado para `system.efeitos`;
 * - o registro do partial do editor e a proteção que impede um Item de efeito de ficar embutido
 *   num ator (`registerConditionEffects`).
 * A lógica (cópia, ids, grupos da lista) está em rolls/effects.js e sheets/context.js.
 */
import { SYSTEM_ID, PERICIAS } from '../config.js';
import {
  CONDITION_ITEM_TYPE,
  addEffect,
  baseForMax,
  effectFromItem,
  normalizeSheetEffects,
  withEffectIds,
} from '../rolls/effects.js';
import { clearPresetText, effectText } from '../rolls/condition-tables.js';
import { normalizeEffects } from '../rolls/ability-effects.js';
import { describeEffect } from '../rolls/ability-effects-editor.js';
import { buildEffectPicker, matchesSearch } from './context.js';
import ConditionEffectApp from './condition-effect-app.js';

const TEMPLATE_PICKER = `systems/${SYSTEM_ID}/templates/dialog/efeito-compendio.hbs`;
/** Partials: nome usado no template → arquivo. */
const PARTIALS = {
  // Editor de efeitos do catálogo (ficha do item e janela do efeito)
  'desordem-normal.efeitos-editor': `systems/${SYSTEM_ID}/templates/partials/efeitos-editor.hbs`,
  // Linha de um efeito e botões Criar / Do compêndio (fichas de personagem e de criatura)
  'desordem-normal.efeito-linha': `systems/${SYSTEM_ID}/templates/partials/efeito-linha.hbs`,
  'desordem-normal.efeitos-botoes': `systems/${SYSTEM_ID}/templates/partials/efeitos-botoes.hbs`,
};

/** Tradução com ou sem dados. */
const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

/** Nome traduzido de uma perícia (para os resumos). */
const skillLabel = (key) => (PERICIAS[key] ? t(`DESORDEM.Pericias.${key}`) : key);

/** Resumo legível de um efeito do catálogo da aba Condição. */
export const describeConditionEntry = (entry) =>
  describeEffect(entry, { t, skill: skillLabel, itemType: CONDITION_ITEM_TYPE });

/**
 * Abre a janela do efeito na posição `index` da lista do ator. Se algum efeito ainda não tem id
 * gravado (os antigos, até a primeira gravação) ou tem id repetido, grava os ids antes: a janela
 * acha o efeito pelo id, não pela posição.
 * @param {Actor} actor
 * @param {number} index
 */
export async function openConditionEffect(actor, index) {
  const raw = actor.toObject().system.efeitos;
  const { list, changed } = withEffectIds(raw, () => foundry.utils.randomID());
  const effect = list[index];
  if (!effect) return null;
  if (changed) await actor.update({ 'system.efeitos': list });
  return ConditionEffectApp.open(actor, effect.id);
}

/** Cria um efeito vazio no fim da lista e abre a janela dele. */
export async function createConditionEffect(actor) {
  const id = foundry.utils.randomID();
  await actor.update({ 'system.efeitos': addEffect(actor.toObject().system.efeitos, id) });
  return ConditionEffectApp.open(actor, id);
}

/**
 * Copia um Item de efeito (do mundo ou de um compêndio) para a lista do ator. A cópia é
 * independente do item.
 * @param {Actor} actor
 * @param {Item} item Item do tipo `efeito`.
 * @returns {Promise<boolean>} Se copiou.
 */
export async function addEffectFromItem(actor, item) {
  if (item?.type !== CONDITION_ITEM_TYPE) return false;
  // Efeito pronto (chave conhecida): a cópia fica sem texto, e a ficha mostra o traduzido
  const effect = clearPresetText(
    effectFromItem(item.toObject(), { id: foundry.utils.randomID(), uuid: item.uuid }),
  );
  const list = [...normalizeSheetEffects(actor.toObject().system.efeitos), effect];
  await actor.update({ 'system.efeitos': list });
  ui.notifications.info(
    t('DESORDEM.Ficha.EfeitoCompendio.Adicionado', { nome: conditionEffectText(effect).nome }),
  );
  return true;
}

/**
 * Todos os Items de efeito que o usuário pode ver: os do mundo (barra de Itens) e os de cada
 * compêndio de Items visível para ele. Dos compêndios só o índice é lido (nome, pasta, efeitos),
 * sem carregar os documentos.
 * @returns {Promise<{uuid: string, name: string, source: string, folder: string, summary: string}[]>}
 */
async function collectEffectItems() {
  const summary = (efeitos) =>
    normalizeEffects(efeitos ?? [])
      .map((entry) => describeConditionEntry(entry))
      .join('; ');
  const world = game.items
    .filter((item) => item.type === CONDITION_ITEM_TYPE && item.visible)
    .map((item) => ({
      uuid: item.uuid,
      name: item.name,
      source: t('DESORDEM.Ficha.EfeitoCompendio.Mundo'),
      folder: item.folder?.name ?? '',
      summary: summary(item.system.efeitos),
    }));
  const packs = game.packs.filter((pack) => pack.documentName === 'Item' && pack.visible);
  const fromPacks = await Promise.all(
    packs.map(async (pack) => {
      const index = await pack.getIndex({ fields: ['type', 'folder', 'system.efeitos'] });
      return index
        .filter((entry) => entry.type === CONDITION_ITEM_TYPE)
        .map((entry) => ({
          uuid: entry.uuid,
          name: entry.name,
          source: pack.title,
          folder: pack.folders.get(entry.folder)?.name ?? '',
          summary: summary(entry.system?.efeitos),
        }));
    }),
  );
  return [...world, ...fromPacks.flat()];
}

/**
 * Lista «Do compêndio»: mostra os Items de efeito agrupados pela fonte, com uma busca que filtra
 * enquanto se digita (sem acento). Clicar num efeito o copia para a ficha e fecha a lista.
 * @param {Actor} actor
 */
export async function pickConditionEffect(actor) {
  const groups = buildEffectPicker(await collectEffectItems());
  const content = await foundry.applications.handlebars.renderTemplate(TEMPLATE_PICKER, {
    groups,
    empty: groups.length === 0,
  });
  // Endereço do efeito escolhido (fica vazio se a pessoa fechar ou cancelar)
  let chosen = '';
  await foundry.applications.api.DialogV2.wait({
    window: { title: t('DESORDEM.Ficha.EfeitoCompendio.Titulo'), icon: 'fa-solid fa-book' },
    classes: ['desordem-normal', 'desordem-efeito-lista'],
    position: { width: 460 },
    content,
    buttons: [{ action: 'cancel', label: t('DESORDEM.Ficha.EfeitoCompendio.Cancelar') }],
    rejectClose: false,
    render: (event, dialog) => {
      const root = dialog.element;
      const search = root.querySelector('[data-efeito-busca]');
      // Busca: esconde as entradas (e os grupos vazios) que não combinam com o texto
      search?.addEventListener('input', () => {
        for (const group of root.querySelectorAll('[data-efeito-grupo]')) {
          let visible = 0;
          for (const entry of group.querySelectorAll('[data-efeito-uuid]')) {
            const show = matchesSearch(entry.dataset.search, search.value);
            entry.hidden = !show;
            if (show) visible += 1;
          }
          group.hidden = visible === 0;
        }
      });
      search?.focus();
      for (const entry of root.querySelectorAll('[data-efeito-uuid]')) {
        entry.addEventListener('click', () => {
          chosen = entry.dataset.efeitoUuid;
          dialog.close();
        });
      }
    },
  });
  if (!chosen) return false;
  const item = await fromUuid(chosen);
  return addEffectFromItem(actor, item);
}

/**
 * Registra os partials (`{{> "desordem-normal.efeitos-editor"}}` etc., veja `PARTIALS`) e o hook que recusa criar um Item de efeito dentro de um ator: o
 * efeito da ficha é sempre uma cópia na lista `system.efeitos` (soltar na ficha já faz a cópia).
 * Chamar uma vez, no `init`.
 */
export function registerConditionEffects() {
  foundry.applications.handlebars.loadTemplates(PARTIALS);
  Hooks.on('preCreateItem', (item) => {
    if (item.type === CONDITION_ITEM_TYPE && item.parent?.documentName === 'Actor') return false;
    return undefined;
  });
  Hooks.on('preUpdateActor', (actor, changes) => maxToBase(actor, changes));
  // Marca de até onde os dados do mundo já foram convertidos (só o mestre grava)
  game.settings.register(SYSTEM_ID, MIGRATION_SETTING, {
    scope: 'world',
    config: false,
    type: String,
    default: '',
  });
}

/**
 * Desde a v0.22.2 o PV/PD máximo é calculado (base − reduções dos efeitos). Se uma gravação
 * mudar o máximo direto (uma macro, outro módulo), a mudança vira mudança na base, para o
 * máximo calculado sair igual ao escolhido.
 * @param {Actor} actor
 * @param {object} changes Mudanças da gravação (o hook `preUpdateActor` deixa alterar).
 */
function maxToBase(actor, changes) {
  for (const key of ['pv', 'pd']) {
    const max = foundry.utils.getProperty(changes, `system.${key}.max`);
    if (max === undefined || actor.system?.[key]?.base === undefined) continue;
    if (foundry.utils.getProperty(changes, `system.${key}.base`) !== undefined) continue;
    foundry.utils.setProperty(
      changes,
      `system.${key}.base`,
      baseForMax(max, actor.system.efeitos, key),
    );
  }
}

/** Nome da configuração (oculta) com a última conversão feita nos dados do mundo. */
const MIGRATION_SETTING = 'migracaoCondicao';

/** Versão da conversão das lesões, traumas e contusão em efeitos. */
const MIGRATION_VERSION = '0.22.2';

/**
 * Grava, uma vez por mundo, a conversão da v0.22.2 nos personagens do mundo. A conversão em si já
 * acontece ao carregar cada ficha (`migrateData`), mas só é gravada quando a ficha muda; aqui ela
 * é gravada de vez, apagando do banco os campos antigos (`lesoes`, `traumas`, `estado.contusao`),
 * para nada antigo voltar depois. Roda só no navegador do mestre ativo.
 * (Atores de compêndio e tokens não vinculados continuam com a conversão ao carregar.)
 */
export async function migrateWorldConditions() {
  if (!game.user.isActiveGM) return;
  if (game.settings.get(SYSTEM_ID, MIGRATION_SETTING) === MIGRATION_VERSION) return;
  const actors = game.actors.filter((actor) => actor.type === 'personagem');
  for (const actor of actors) {
    const { system } = actor.toObject();
    try {
      // `diff: false`: grava tudo, mesmo o que o Foundry já vê igual na memória (o banco não está)
      await actor.update(
        {
          'system.efeitos': system.efeitos,
          'system.pv.base': system.pv.base,
          'system.pd.base': system.pd.base,
          'system.-=lesoes': null,
          'system.-=traumas': null,
          'system.estado.-=contusao': null,
        },
        { diff: false, render: false },
      );
    } catch (error) {
      console.error(`${SYSTEM_ID} | conversão de ${actor.name} falhou`, error);
    }
  }
  await game.settings.set(SYSTEM_ID, MIGRATION_SETTING, MIGRATION_VERSION);
  if (actors.length) {
    ui.notifications.info(t('DESORDEM.Ficha.MigracaoCondicao', { n: actors.length }));
  }
}

/**
 * Nome e descrição de um efeito para mostrar (o texto das lesões e traumas inseridos pelas
 * tabelas vem traduzido da chave enquanto não for editado).
 */
export const conditionEffectText = (effect) => effectText(effect, (key) => t(key));
