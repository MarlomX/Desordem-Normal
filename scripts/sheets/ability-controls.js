/**
 * Controles das habilidades na ficha do personagem: lógica pura (sem Foundry). Monta, a partir
 * dos efeitos, as barras de recurso do cabeçalho, os contadores e os botões de cada habilidade e
 * o texto de cada botão.
 */
import { itemEffects, resourceDefs, resourceValue } from '../rolls/ability-effects.js';

/** Acima deste máximo a barra vira número (com − e +), para não estourar o cabeçalho. */
export const MAX_PIPS = 10;

/** Recursos com nome e cor próprios na ficha (os das habilidades antigas). */
const KNOWN_RESOURCES = Object.freeze({
  impeto: 'DESORDEM.Habilidade.Impeto',
  analise: 'DESORDEM.Habilidade.Marcadores',
});

/**
 * Botões das habilidades antigas: mantêm o texto de antes (pelo id fixo do efeito equivalente).
 */
const LEGACY_BUTTONS = Object.freeze({
  impetoPasso: 'DESORDEM.Habilidade.ImpetoPasso',
  impetoAcao: 'DESORDEM.Habilidade.ImpetoAcao',
  analisar: 'DESORDEM.Habilidade.Analisar',
  esquiva: 'DESORDEM.Habilidade.Esquivar',
  curandeiro: 'DESORDEM.Habilidade.Curar',
});

/** O efeito vira um botão na linha da habilidade? */
export function isButtonEffect(effect) {
  if (effect.tipo === 'ganharRecurso') return effect.params.gatilho === 'acao';
  return ['passoCena', 'acaoNota', 'testeAcao', 'defesaLivre', 'interceptar'].includes(effect.tipo);
}

/** Nome de um recurso na ficha: o do efeito; sem nome, o padrão (ímpeto, marcadores) ou a chave. */
export function resourceName(def, t) {
  if (def.nome && def.nome !== def.itemName) return def.nome;
  if (KNOWN_RESOURCES[def.chave]) return t(KNOWN_RESOURCES[def.chave]);
  return def.nome || def.chave;
}

/** « (3 PD)» do botão (vazio sem custo). */
function costSuffix(cost, t) {
  if (!cost || cost.tipo === 'nenhum' || cost.valor === 0) return '';
  const amount = t(`DESORDEM.Efeito.Resumo.Custo.${cost.tipo}`, {
    valor: cost.valor,
    recurso: cost.recurso || '?',
  });
  return ` (${amount})`;
}

/**
 * Texto do botão de um efeito: o rótulo próprio; sem ele, o das habilidades antigas (pelo id) ou
 * um automático, pelo tipo e pelo custo.
 * @param {{id: string, tipo: string, params: object}} effect
 * @param {{t: Function, skill: (key: string) => string}} labels
 */
export function buttonLabel(effect, { t, skill }) {
  const p = effect.params;
  if (p.rotulo) return p.rotulo;
  if (LEGACY_BUTTONS[effect.id]) return t(LEGACY_BUTTONS[effect.id]);
  const custo = costSuffix(p.custo, t);
  const key = `DESORDEM.Efeito.Botao.${effect.tipo}`;
  switch (effect.tipo) {
    case 'ganharRecurso':
      return t(key, { quantidade: p.quantidade, recurso: p.recurso || '?', custo });
    case 'testeAcao':
      return t(key, { pericia: skill(p.pericia), custo });
    default:
      return t(key, { custo });
  }
}

/**
 * Texto do botão de ajuste de dados no cartão (efeito `ajusteDados`): o da análise, como antes;
 * com outro recurso, «Ajustar dados: Fúria (3)».
 * @param {{chave: string, points: number, def: object}} adjust Veja `adjustResource`.
 */
export function adjustLabel(adjust, t) {
  if (adjust.chave === 'analise') {
    return t('DESORDEM.Habilidade.AnaliseBotao', { pontos: adjust.points });
  }
  return t('DESORDEM.Efeito.Botao.ajusteDados', {
    nome: resourceName(adjust.def, t),
    pontos: adjust.points,
  });
}

/** Bolinhas de uma barra: n de 1 a máximo, cheias até o valor. */
function pips(value, max) {
  return Array.from({ length: max }, (_, i) => ({ n: i + 1, filled: i < value }));
}

/**
 * Barras do cabeçalho: uma por recurso definido nas habilidades do personagem.
 * @param {object[]} entries Efeitos do ator (`collectEffects`).
 * @param {Object<string, number>} stored Valores guardados (`system.recursosHab`).
 * @param {Function} t
 * @returns {{chave: string, nome: string, value: number, max: number, pips: object[]|null,
 *   tone: string}[]}
 */
export function resourceBars(entries, stored, t) {
  const defs = resourceDefs(entries);
  return Object.values(defs).map((def) => {
    const value = resourceValue(stored, defs, def.chave);
    return {
      chave: def.chave,
      nome: resourceName(def, t),
      value,
      max: def.maximo,
      pips: def.maximo <= MAX_PIPS ? pips(value, def.maximo) : null,
      // Cor da barra: ímpeto e análise têm a sua; os outros, a de destaque da ficha
      tone: KNOWN_RESOURCES[def.chave] ? def.chave : 'outro',
    };
  });
}

/**
 * Controles de uma habilidade na aba Habilidades: contadores dos recursos que ela define e um
 * botão por efeito de ação (passo na cena, ação com aviso, ganhar recurso por ação, teste com
 * efeito, defesa livre).
 * @param {{id: string, name: string, system: object}} item
 * @param {Object<string, number>} stored Valores guardados (`system.recursosHab`).
 * @param {{t: Function, skill: (key: string) => string}} labels
 */
export function abilityControls(item, stored, labels) {
  const effects = itemEffects(item.system);
  const entries = effects.map((effect) => ({ ...effect, itemId: item.id, itemName: item.name }));
  const defs = resourceDefs(entries);
  return {
    counters: Object.values(defs).map((def) => ({
      chave: def.chave,
      nome: resourceName(def, labels.t),
      value: resourceValue(stored, defs, def.chave),
      max: def.maximo,
    })),
    buttons: effects.filter(isButtonEffect).map((effect) => ({
      effectId: effect.id,
      tipo: effect.tipo,
      label: buttonLabel(effect, labels),
    })),
    showCompanion: effects.some((effect) => effect.tipo === 'companheiro'),
  };
}
