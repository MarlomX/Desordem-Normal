/**
 * Preparação de dados para a ficha. Funções puras (sem Foundry), testadas em Node.
 */
import { DIE_STEPS } from '../rolls/dice.js';

/**
 * Opções de um seletor de dado (d4 a d12). Se o valor atual estiver fora da escada
 * (ex.: d20 de efeitos paranormais), ele é incluído para não ser perdido ao salvar.
 * @param {number} current Dado atual (número de faces).
 */
export function dieOptions(current) {
  const value = Number(current);
  const sides = DIE_STEPS.includes(value)
    ? [...DIE_STEPS]
    : [...DIE_STEPS, value].sort((a, b) => a - b);
  return sides.map((faces) => ({ value: faces, label: `d${faces}`, selected: faces === value }));
}

/**
 * @param {Record<string, number>} attributes Ex.: { fisico: 6, ... }
 * @param {string[]} keys Chaves dos atributos, na ordem de exibição.
 * @param {(key: string) => string} label Devolve o nome traduzido.
 */
export function buildAttributeRows(attributes, keys, label) {
  return keys.map((key) => ({
    key,
    label: label(key),
    options: dieOptions(attributes[key]),
  }));
}

/**
 * Linhas da lista de perícias, em ordem alfabética pelo nome traduzido.
 * @param {Record<string, number>} skills Dados das perícias do personagem.
 * @param {Record<string, string>} skillAttributes Perícia -> atributo-base.
 * @param {Object} labels
 * @param {(key: string) => string} labels.skillLabel
 * @param {(key: string) => string} labels.attrLabel
 */
export function buildSkillRows(skills, skillAttributes, { skillLabel, attrLabel }) {
  return Object.entries(skillAttributes)
    .map(([key, attrKey]) => ({
      key,
      label: skillLabel(key),
      attrLabel: attrLabel(attrKey),
      options: dieOptions(skills[key]),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
}

/**
 * Linhas das áreas de Aptidão (mesmo formato dos atributos: um dado por área).
 * @param {Record<string, number>} aptitudes Ex.: { erudicao: 6, ... }
 * @param {string[]} keys Chaves das áreas, na ordem de exibição.
 * @param {(key: string) => string} label Devolve o nome traduzido.
 */
export function buildAptitudeRows(aptitudes, keys, label) {
  return buildAttributeRows(aptitudes, keys, label);
}