/**
 * Primeiros socorros (regras p. 22). Lógica pura, sem dependência do Foundry.
 *
 * Teste de Mente + Medicina contra DT 7, que sobe +3 a cada uso de primeiros socorros no mesmo
 * paciente na cena (o contador fica na ficha do paciente). Sem maleta de medicamentos: duas
 * reduções de passo; em si mesmo: mais duas. Se passar, o paciente moribundo perde a condição,
 * recupera 1 PV e, se estava inconsciente, acorda.
 */
import { sustainReduction, sustainStepMods } from './challenge.js';
import { collectEffects, hasTool } from './ability-effects.js';

/** DT básica e aumento por uso no mesmo paciente. */
export const FIRST_AID_DT = 7;
export const FIRST_AID_DT_STEP = 3;

/** Reduções de passo sem maleta e em si mesmo (cada uma tira um passo do maior dado). */
export const FIRST_AID_PENALTY = 2;

/**
 * DT do teste conforme quantas vezes o paciente já recebeu primeiros socorros na cena.
 * @param {number} uses Contador do paciente (valor estranho conta como 0).
 */
export function firstAidDt(uses) {
  const count = Number.isInteger(uses) && uses > 0 ? uses : 0;
  return FIRST_AID_DT + FIRST_AID_DT_STEP * count;
}

/**
 * Reduções de passo do teste: −2 sem maleta, −2 em si mesmo (as duas se somam). Como no
 * sustentar, cada redução tira um passo do MAIOR dado (atributo ou perícia; no empate, o do
 * atributo), até os dois chegarem a d4.
 * @param {{kit: boolean, self: boolean}} situation
 * @param {number} attrDie Dado do atributo do curandeiro (já com os passos da ficha).
 * @param {number} skillDie Dado da Medicina (já com os passos da ficha).
 * @returns {{target: 'attribute'|'skill', steps: number}[]}
 */
export function firstAidStepMods({ kit, self }, attrDie, skillDie) {
  const steps = (kit ? 0 : FIRST_AID_PENALTY) + (self ? FIRST_AID_PENALTY : 0);
  return sustainStepMods(sustainReduction(attrDie, skillDie, steps));
}

/** Tira acentos e caixa (para comparar nomes de itens). */
const plain = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/**
 * O curandeiro tem uma maleta de medicamentos? Primeiro procura um item geral com o efeito
 * `ferramenta` «medicina»; sem ele, um item com «maleta» ou «kit médico» no nome (sem acento nem
 * caixa), para os itens antigos. Só serve para marcar a caixa da janela; quem decide é o jogador.
 * @param {{name: string, type?: string, system?: object}[]} items
 */
export function hasMedicalKit(items) {
  const list = items ?? [];
  const entries = collectEffects(list.filter((item) => item?.type === 'item'));
  if (hasTool(entries, 'medicina')) return true;
  return list.some((item) => {
    const name = plain(item?.name);
    return name.includes('maleta') || name.includes('kit medico') || name.includes('medical kit');
  });
}

/**
 * Efeito de primeiros socorros bem-sucedidos no paciente. Só vale para quem está moribundo.
 * @param {{pv: {value: number, max: number}, estado: {moribundo: boolean, inconsciente: boolean}}} system
 * @returns {{ok: boolean, updates?: object, woke?: boolean, before?: number, after?: number}}
 *   `updates` nas chaves da ficha (`system.*`); `ok` false se o paciente não está moribundo.
 */
export function firstAidOutcome(system) {
  if (!system?.estado?.moribundo) return { ok: false };
  const before = system.pv.value;
  const after = Math.min(system.pv.max, before + 1);
  return {
    ok: true,
    woke: Boolean(system.estado.inconsciente),
    before,
    after,
    updates: {
      'system.pv.value': after,
      'system.estado.moribundo': false,
      'system.estado.inconsciente': false,
    },
  };
}
