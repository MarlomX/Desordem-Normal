/**
 * Aba Equipamento e aba Habilidades da ficha: itens, escolhas e linhas de habilidade.
 * Parte de `context.js` (v0.28.7). Lógica pura, sem Foundry.
 */
import {
  HANDS,
  armorSummary,
  handsInUse,
  handsOf,
  isMartial,
  isNatural,
  isShield,
  itemUseState,
  weaponDamageLabel,
  weaponReady,
  weaponSkill,
} from '../../rolls/equipment.js';
import { itemUsePlan, ownEffects } from '../../rolls/ability-effects.js';
import { abilityControls } from '../ability-controls.js';

/** Ícone padrão do Foundry para itens (a sacola): itens que ainda estão com ele não mostram miniatura. */
export const DEFAULT_ITEM_ICON = 'icons/svg/item-bag.svg';

/**
 * Miniatura de um item nas listas da ficha (v0.23.4): a imagem escolhida, ou vazio quando o item
 * não tem imagem ou ainda está com a sacola padrão (para a lista não ficar cheia de sacolas iguais).
 * @param {string} img `item.img`.
 * @returns {string} Caminho da imagem, ou `''` para não mostrar.
 */
export function itemThumb(img) {
  const path = typeof img === 'string' ? img.trim() : '';
  return path && path !== DEFAULT_ITEM_ICON ? path : '';
}

/**
 * Equipamento da ficha: armas, armaduras e outros itens, com mãos em uso e pontos de armadura.
 * Itens que não podem ser equipados agora (sem mãos livres, ou já há uma armadura vestida) vêm
 * com `blocked` verdadeiro, para a caixa de equipar ficar desativada.
 * @param {{id: string, name: string, type: string, system: Object}[]} items Itens do personagem.
 * @param {Object} options
 * @param {(kind: string) => string} options.kindLabel Nome traduzido do tipo de arma.
 * @param {(hands: number) => string} options.handsLabel Texto de "uma mão" / "duas mãos".
 * @param {(skillKey: string) => string} options.skillLabel Nome traduzido da perícia.
 * @param {(category: string) => string} [options.categoryLabel] Nome da categoria da arma.
 * @param {(item: Object) => string} [options.effectsText] Resumo dos efeitos do item, um por
 *   linha (mostrado embaixo do nome); vazio = sem efeitos.
 * @param {boolean} [options.proficient=true] O personagem tem proficiência marcial (sem ela, a
 *   caixa de equipar das armas, armaduras e escudos marciais fica travada).
 * @param {{extra?: number, extraSpent?: number}} [options.armorBonus] Armadura extra (pontos e
 *   gastos), somada no resumo de pontos.
 * @param {(kind: string, category: string) => string} [options.armorKindLabel] Rótulo do
 *   subtipo com a categoria já traduzida («Armadura marcial», «Escudo simples»).
 * @param {boolean} [options.editable=true]
 */
export function buildEquipmentRows(
  items,
  {
    kindLabel,
    handsLabel,
    skillLabel,
    categoryLabel = (category) => category,
    effectsText = () => '',
    proficient = true,
    armorBonus = {},
    armorKindLabel = (kind, category) => `${kind} ${category}`,
    editable = true,
  },
) {
  const of = (type) => items.filter((item) => item.type === type);
  const weapons = of('arma');
  const armors = of('armadura');
  const others = of('item');
  // Mãos: armas, itens e escudos empunhados
  const shields = armors.filter((a) => isShield(a.system));
  const hands = handsInUse([...weapons, ...others, ...shields].map((i) => i.system));
  const shieldHeld = shields.some((a) => a.system.empunhada);
  // Equipar fica bloqueado se o item não está equipado e não cabe
  const cannotHold = (system) => !system.empunhada && hands.used + handsOf(system) > HANDS;
  // Resumo dos efeitos, uma linha por efeito (fica visível embaixo do nome, sem passar o mouse)
  const effectLines = (item) =>
    String(effectsText(item) ?? '')
      .split('\n')
      .filter(Boolean);
  return {
    weapons: weapons.map((item) => {
      const { id, name, system } = item;
      // Miniatura (vazia com a sacola padrão; v0.23.4)
      const thumb = itemThumb(item.img);
      const natural = isNatural(system);
      // Marcial sem proficiência: não pode ser empunhada (se já estiver, só um aviso na linha)
      const lacksProficiency = isMartial(system) && !proficient;
      return {
        id,
        name,
        thumb,
        descricao: system.descricao,
        effects: effectLines(item),
        kindLabel: kindLabel(system.tipo),
        categoryLabel: categoryLabel(system.categoria),
        handsLabel: handsLabel(handsOf(system)),
        damageLabel: weaponDamageLabel(system.bonusDano, system.baseDano),
        skillLabel: skillLabel(weaponSkill(system)),
        empunhada: system.empunhada,
        naoLetal: system.naoLetal,
        // Arma natural: sem caixa de empunhar (não ocupa as mãos)
        natural,
        // Arma de arremesso: quantidade na linha; sem unidades, o Atacar fica desativado
        consumivel: Boolean(system.consumivel),
        quantidade: system.quantidade ?? 0,
        canAttack: editable && weaponReady(system),
        lacksProficiency,
        // Caixa de empunhar: desativada se não cabe ou se falta proficiência (só para empunhar;
        // uma arma já empunhada sempre pode ser guardada)
        blockReason: system.empunhada
          ? null
          : lacksProficiency
            ? 'proficiencia'
            : !natural && cannotHold(system)
              ? 'maos'
              : null,
        locked: !editable,
        blocked:
          !editable ||
          (!system.empunhada && (lacksProficiency || (!natural && cannotHold(system)))),
      };
    }),
    armors: armors.map((item) => {
      const { id, name, system } = item;
      // Miniatura (vazia com a sacola padrão; v0.23.4)
      const thumb = itemThumb(item.img);
      const shield = isShield(system);
      const lacksProficiency = isMartial(system) && !proficient;
      // Equipado: escudo empunhado ou armadura vestida (várias armaduras podem ser vestidas)
      const equipped = shield ? Boolean(system.empunhada) : Boolean(system.vestida);
      const blockReason = equipped
        ? null
        : lacksProficiency
          ? 'proficiencia'
          : shield && shieldHeld
            ? 'escudo'
            : shield && cannotHold(system)
              ? 'maos'
              : null;
      return {
        id,
        name,
        thumb,
        descricao: system.descricao,
        effects: effectLines(item),
        shield,
        kindLabel: armorKindLabel(
          system.subtipo ?? 'armadura',
          categoryLabel(system.categoria ?? 'simples'),
        ),
        pontos: system.pontos,
        restantes: Math.max(0, Math.min(system.restantes, system.pontos)),
        vestida: system.vestida,
        empunhada: Boolean(system.empunhada),
        // Campo da caixa de equipar na linha: vestida (armadura) ou empunhada (escudo)
        equipField: shield ? 'empunhada' : 'vestida',
        equipped,
        lacksProficiency,
        blockReason,
        locked: !editable,
        blocked: !editable || blockReason !== null,
      };
    }),
    others: others.map((item) => {
      const { id, name, system } = item;
      // Miniatura (vazia com a sacola padrão; v0.23.4)
      const thumb = itemThumb(item.img);
      // Efeitos de uso (cura, passo no alvo, ação com aviso): o botão Usar aparece mesmo sem limite
      const useState = itemUseState(system, itemUsePlan(ownEffects(item)).hasUse);
      return {
        id,
        name,
        thumb,
        descricao: system.descricao,
        effects: effectLines(item),
        quantidade: system.quantidade,
        usos: system.usos,
        usosMax: system.usosMax,
        hasUsos: system.usosMax > 0,
        handsLabel: handsLabel(handsOf(system)),
        empunhada: system.empunhada,
        showUse: useState.show,
        canUse: editable && useState.canUse,
        locked: !editable,
        blocked: !editable || cannotHold(system),
      };
    }),
    hands,
    armorTotals: armorSummary(
      armors.map((a) => a.system),
      armorBonus,
    ),
  };
}

/** Opções de um seletor simples (valor, texto e marca do atual). */
export function buildChoices(values, current, label) {
  return values.map((value) => ({ value, label: label(value), selected: value === current }));
}

/**
 * Linhas das habilidades da ficha: a de perfil primeiro, depois as outras por nome. Cada linha
 * traz os contadores dos recursos e os botões dos efeitos da habilidade (os da lista ou, com a
 * lista vazia, os equivalentes à automação antiga): veja `abilityControls`.
 * @param {{id: string, name: string, system: Object}[]} items Habilidades do personagem.
 * @param {Object} options
 * @param {Object<string, number>} options.resources Valores guardados dos recursos das habilidades.
 * @param {boolean} options.hurtCompanion O animal está ferido nesta cena.
 * @param {boolean} [options.editable=true]
 * @param {Function} [options.t] Tradução (nos testes, a própria chave).
 * @param {(key: string) => string} [options.skill] Nome de uma perícia.
 */
export function buildAbilityRows(
  items,
  {
    resources,
    hurtCompanion,
    editable = true,
    openIds = [],
    t = (key) => key,
    skill = (key) => key,
  },
) {
  const rows = items.map((item) => {
    const { id, name, system } = item;
    // Miniatura (vazia com a sacola padrão; v0.23.4)
    const thumb = itemThumb(item.img);
    const controls = abilityControls(item, resources ?? {}, { t, skill });
    return {
      id,
      name,
      thumb,
      descricao: system.descricao,
      perfil: system.perfil,
      locked: !editable,
      open: openIds.includes(id),
      counters: controls.counters,
      buttons: controls.buttons,
      showCompanion: controls.showCompanion,
      animalFerido: hurtCompanion,
    };
  });
  return rows.sort(
    (a, b) => Number(b.perfil) - Number(a.perfil) || a.name.localeCompare(b.name, 'pt-BR'),
  );
}
