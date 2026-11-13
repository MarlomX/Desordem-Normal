/**
 * Atributo-base de uma perícia, aptidão ou ofício. Lógica pura, sem dependência do Foundry.
 *
 * Cada perícia tem um atributo padrão (Luta usa Físico, por exemplo), mas as regras deixam o
 * mestre julgar que certas ações usam outro. Na ficha, o jogador pode trocar o atributo de uma
 * perícia de forma permanente; a escolha vale para todos os testes dela até voltar ao padrão.
 *
 * Onde a escolha fica guardada:
 * - perícias, aptidões e ofícios do livro: `system.atributosPericias[chave]`;
 * - áreas extras: o campo `atributo` do próprio item da lista (`aptidoesExtras`/`oficiosExtras`).
 * Texto vazio significa "usar o padrão".
 */
import { ATRIBUTOS, PERICIAS, APTIDOES, OFICIOS } from '../config.js';
import { EXTRA_GROUPS, findExtra, parseExtraKey, updateExtra } from './extras.js';

/** Chaves (perícias, aptidões e ofícios do livro) que têm campo em `atributosPericias`. */
export const OVERRIDABLE_KEYS = Object.freeze([...Object.keys(PERICIAS), ...APTIDOES, ...OFICIOS]);

/** Atributo padrão: o da perícia, ou Mente para aptidões e ofícios (do livro ou extras). */
export function defaultAttribute(skillKey) {
  return PERICIAS[skillKey] ?? 'mente';
}

/** Devolve o atributo se for um dos três válidos; qualquer outra coisa vira ''. */
export function validAttribute(value) {
  return ATRIBUTOS.includes(value) ? value : '';
}

/** Atributo escolhido na ficha para a chave de teste ('' se não houver escolha). */
export function storedAttribute(system, skillKey) {
  const found = findExtra(system, skillKey);
  if (found) return validAttribute(found.extra.atributo);
  return validAttribute(system?.atributosPericias?.[skillKey]);
}

/**
 * Atributo que um teste usa. Ordem: o informado na própria chamada do teste (se válido), depois a
 * escolha da ficha e, por fim, o padrão da perícia.
 * @param {object} system `actor.system`.
 * @param {string} skillKey Chave de teste (perícia, área do livro ou `aptidao:<id>`/`oficio:<id>`).
 * @param {string} [explicit] Atributo pedido explicitamente pelo chamador.
 */
export function resolveSkillAttribute(system, skillKey, explicit) {
  return (
    validAttribute(explicit) || storedAttribute(system, skillKey) || defaultAttribute(skillKey)
  );
}

/**
 * Monta a alteração de dados para a escolha de um atributo na ficha.
 * Escolher o atributo padrão (ou '') guarda '' (volta ao padrão).
 * @param {object} system `actor.system` (como dados simples, para copiar listas de extras).
 * @param {string} skillKey Chave de teste.
 * @param {string} value Atributo escolhido ('' = padrão).
 * @returns {{path: string, value: string|object[]}|null} `path` é relativo a `system`;
 *   null se a chave ou o atributo forem inválidos.
 */
export function attributeChoiceUpdate(system, skillKey, value) {
  const chosen = validAttribute(value);
  if (value !== '' && !chosen) return null;
  const stored = chosen === defaultAttribute(skillKey) ? '' : chosen;

  const parsed = parseExtraKey(skillKey);
  if (parsed) {
    const found = findExtra(system, skillKey);
    if (!found) return null;
    const list = system[EXTRA_GROUPS[parsed.group]];
    return {
      path: EXTRA_GROUPS[parsed.group],
      value: updateExtra(list, parsed.id, { atributo: stored }),
    };
  }
  if (!OVERRIDABLE_KEYS.includes(skillKey)) return null;
  return { path: `atributosPericias.${skillKey}`, value: stored };
}
