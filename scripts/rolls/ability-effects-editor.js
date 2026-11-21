/**
 * Editor dos efeitos de uma habilidade: lógica pura (sem Foundry). A ficha do item só chama estas
 * funções e grava a lista que elas devolvem.
 *
 * Toda mudança devolve uma lista NOVA, já limpa por `normalizeEffects` (nunca altera a recebida).
 * Os ids de efeitos novos vêm de quem chama (no Foundry, `foundry.utils.randomID`), para que estas
 * funções continuem previsíveis nos testes.
 */
import {
  COST_KINDS,
  TRIGGERS,
  EFFECT_TYPES,
  defaultParams,
  itemEffects,
  legacyEffects,
  normalizeEffects,
} from './ability-effects.js';

/** Máximo de efeitos numa habilidade. */
export const MAX_EFFECTS = 20;

/**
 * Tipos de efeito numa habilidade de criatura: os que não dependem de PD, pavor ou recursos de
 * personagem (dado extra, ação com aviso e companheiro), sempre sem custo.
 */
export const CREATURE_EFFECT_TYPES = Object.freeze(['dadoExtra', 'acaoNota', 'companheiro']);

/** Grupo de textos de cada campo de opções (`DESORDEM.Efeito.<grupo>.<valor>`). */
const CHOICE_GROUPS = Object.freeze({
  gatilho: 'Gatilhos',
  teste: 'Testes',
  grupo: 'Grupos',
  limite: 'Limites',
  resultado: 'Resultados',
  condicao: 'Condicoes',
});

/**
 * Efeitos que o editor mostra: os da lista do item ou, com a lista vazia, os equivalentes à
 * automação antiga (`legacy` verdadeiro; na primeira edição eles viram a lista do item).
 * @param {{efeitos?: object[], automacao?: string}} system
 * @returns {{effects: object[], legacy: boolean}}
 */
export function editorEffects(system) {
  const own = normalizeEffects(system?.efeitos);
  if (own.length) return { effects: own, legacy: false };
  const effects = itemEffects(system);
  return { effects, legacy: effects.length > 0 };
}

/** Acrescenta um efeito do tipo, com os parâmetros padrão (até `MAX_EFFECTS`). */
export function addEffect(list, tipo, id) {
  if (!EFFECT_TYPES[tipo] || list.length >= MAX_EFFECTS) return normalizeEffects(list);
  return normalizeEffects([...list, { id, tipo, params: defaultParams(tipo) }]);
}

/** Tira o efeito da posição `index`. */
export function removeEffect(list, index) {
  return normalizeEffects(list.filter((_, i) => i !== index));
}

/** Move o efeito uma posição para cima (`delta` = -1) ou para baixo (+1). */
export function moveEffect(list, index, delta) {
  const target = index + delta;
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) {
    return normalizeEffects(list);
  }
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return normalizeEffects(next);
}

/**
 * Muda um parâmetro de um efeito. `path` é o nome do parâmetro (`'dado'`) ou, no custo, o campo
 * dele (`'custo.valor'`). O valor pode vir cru do formulário: a limpeza do catálogo converte.
 */
export function setEffectParam(list, index, path, value) {
  const [key, sub] = path.split('.');
  return normalizeEffects(
    list.map((effect, i) => {
      if (i !== index) return effect;
      const params = { ...effect.params };
      params[key] = sub ? { ...params[key], [sub]: value } : value;
      return { ...effect, params };
    }),
  );
}

/** Liga ou desliga uma perícia na lista de perícias de um efeito (vazia = todas). */
export function toggleEffectSkill(list, index, skill, on) {
  const current = list[index]?.params?.pericias ?? [];
  const next = on ? [...current, skill] : current.filter((key) => key !== skill);
  return setEffectParam(list, index, 'pericias', next);
}

/** Efeitos equivalentes a um modelo (automação antiga), para preencher a lista. */
export function templateEffects(key) {
  return legacyEffects(key);
}

/**
 * O efeito já tem uso automático nesta versão? (Os outros ficam gravados e passam a funcionar
 * quando a ficha e a janela pré-teste genéricas chegarem.)
 * @param {object} effect
 */
export function effectSupported(effect) {
  const { params } = effect;
  switch (effect.tipo) {
    // Barras e botões da ficha (v0.20.4), janela pré-teste genérica (v0.20.5) e cartão do teste
    case 'recurso':
    case 'dadoExtra':
    case 'passoCondicional':
    case 'ajusteDados':
    case 'rerrolar':
    case 'defesaLivre':
    case 'passoCena':
    case 'acaoNota':
    case 'testeAcao':
    case 'companheiro':
    case 'interceptar':
      return true;
    case 'ganharRecurso':
      // Todos os gatilhos têm uso desde a v0.20.7 (ao se defender, início do combate)
      return TRIGGERS.includes(params.gatilho);
    default:
      return false;
  }
}

// ---------- Textos ----------

/**
 * Resumo em texto de um efeito («+d8 em Crime ou Furtividade — custa 3 PD»).
 * @param {object} effect
 * @param {object} labels
 * @param {(key: string, data?: object) => string} labels.t Tradução (`game.i18n`).
 * @param {(key: string) => string} labels.skill Nome de uma perícia.
 */
export function describeEffect(effect, { t, skill }) {
  const p = effect.params;
  const key = (name) => `DESORDEM.Efeito.Resumo.${name}`;
  const cost = costText(p.custo, t);
  const limit = p.limite === 'rodadaCombate' ? t(key('PorRodada')) : '';
  const skills = (list) => (list.length ? list.map(skill).join(', ') : t(key('QualquerPericia')));
  switch (effect.tipo) {
    case 'recurso':
      return t(key('recurso'), {
        nome: p.nome || p.chave || '?',
        chave: p.chave || '?',
        maximo: p.maximo,
        esvazia: p.esvazia ? t(key('Esvazia')) : '',
      });
    case 'ganharRecurso':
      return t(key('ganharRecurso'), {
        quantidade: p.quantidade,
        recurso: p.recurso || '?',
        quando: t(key(`Quando.${p.gatilho}`)),
      });
    case 'dadoExtra':
      return t(key('dadoExtra'), {
        dado: p.dado,
        pericias: skills(p.pericias),
        teste: p.teste === 'qualquer' ? '' : ` (${t(`DESORDEM.Efeito.Testes.${p.teste}`)})`,
        custo: cost,
      });
    case 'ajusteDados':
      return t(key('ajusteDados'), { recurso: p.recurso || '?' });
    case 'rerrolar':
      return t(key('rerrolar'), { custo: cost, limite: limit });
    case 'passoCena':
      return t(key('passoCena'), {
        passos: p.passos,
        atributo: p.atributo
          ? t(`DESORDEM.Atributos.${p.atributo}`)
          : t('DESORDEM.Efeito.AEscolha').toLowerCase(),
        custo: cost,
      });
    case 'acaoNota':
      return t(key('acaoNota'), { custo: cost, texto: p.texto ? `: ${p.texto}` : '' });
    case 'testeAcao':
      return t(key('testeAcao'), {
        pericia: skill(p.pericia),
        dt: p.dt,
        custo: cost,
        resultado:
          p.resultado === 'curarPV'
            ? t(key('Cura')) + (p.umaVezPorAlvo ? t(key('UmaVez')) : '')
            : t(key('Dados'), { dado: p.dado, margem: p.margem }),
      });
    case 'companheiro':
      return t(key('companheiro'), {
        dado: p.dado,
        teste: t(`DESORDEM.Efeito.Testes.${p.teste}`),
      });
    case 'defesaLivre':
      return t(key('defesaLivre'), { pericia: skill(p.pericia), limite: limit });
    case 'passoCondicional':
      return t(key('passoCondicional'), {
        passos: p.passos,
        atributo:
          !p.atributo || p.atributo === 'todos'
            ? t('DESORDEM.Efeito.TodosAtributos')
            : t(`DESORDEM.Atributos.${p.atributo}`),
        condicao: t(`DESORDEM.Efeito.Condicoes.${p.condicao}`),
      });
    case 'interceptar':
      return t(key('interceptar'), { custo: cost, limite: limit });
    default:
      return '';
  }
}

/** « — custa 3 PD» (vazio sem custo). */
function costText(cost, t) {
  if (!cost || cost.tipo === 'nenhum' || cost.valor === 0) return '';
  const amount = t(`DESORDEM.Efeito.Resumo.Custo.${cost.tipo}`, {
    valor: cost.valor,
    recurso: cost.recurso || '?',
  });
  return t('DESORDEM.Efeito.Resumo.ComCusto', { custo: amount });
}

// ---------- Modelo de exibição ----------

/**
 * Linhas do editor, prontas para o template: tipo, resumo, aviso de «sem uso automático» e, na
 * linha aberta, os campos com o controle certo de cada um.
 * @param {object[]} effects Lista do item (ou a da automação antiga).
 * @param {object} options
 * @param {(key: string, data?: object) => string} options.t
 * @param {{key: string, label: string}[]} options.skills Perícias, já em ordem alfabética.
 * @param {string|null} options.openId Efeito aberto para edição.
 * @param {boolean} [options.creature=false] Habilidade de criatura: o custo só tem «sem custo».
 */
export function editorRows(effects, { t, skills, openId, creature = false }) {
  const skillLabel = (key) => skills.find((s) => s.key === key)?.label ?? key;
  return effects.map((effect, index) => ({
    index,
    id: effect.id,
    tipo: effect.tipo,
    tipoLabel: t(`DESORDEM.Efeito.Tipos.${effect.tipo}`),
    summary: describeEffect(effect, { t, skill: skillLabel }),
    supported: effectSupported(effect),
    open: effect.id === openId,
    first: index === 0,
    last: index === effects.length - 1,
    fields: effect.id === openId ? effectFields(effect, index, { t, skills, creature }) : [],
  }));
}

/** Campos de um efeito aberto (um por parâmetro, na ordem do catálogo). */
function effectFields(effect, index, { t, skills, creature = false }) {
  const option = (value, label, current) => ({
    value: String(value),
    label,
    selected: value === current,
  });
  return Object.entries(EFFECT_TYPES[effect.tipo]).map(([key, field]) => {
    const value = effect.params[key];
    const base = {
      index,
      key,
      label: t(`DESORDEM.Efeito.Campos.${key}`),
      value,
      [`is${field.kind[0].toUpperCase()}${field.kind.slice(1)}`]: true,
    };
    switch (field.kind) {
      case 'int':
        return { ...base, min: field.min, max: field.max };
      case 'die':
        return { ...base, choices: field.choices.map((d) => option(d, `d${d}`, value)) };
      case 'choice':
        return {
          ...base,
          choices: field.choices.map((choice) =>
            option(choice, choiceLabel(key, choice, t), value),
          ),
        };
      case 'skill':
        return { ...base, choices: skills.map((s) => option(s.key, s.label, value)) };
      case 'skills':
        return {
          ...base,
          skills: skills.map((s) => ({ ...s, checked: value.includes(s.key) })),
        };
      case 'cost':
        return {
          ...base,
          kinds: (creature ? ['nenhum'] : COST_KINDS).map((kind) =>
            option(kind, t(`DESORDEM.Efeito.Custos.${kind}`), value.tipo),
          ),
          paid: value.tipo !== 'nenhum',
          byResource: value.tipo === 'recurso',
        };
      default:
        return base;
    }
  });
}

/** Texto de uma opção de um campo de opções. */
function choiceLabel(key, choice, t) {
  if (key === 'atributo') {
    if (choice === 'todos') return t('DESORDEM.Efeito.TodosAtributos');
    return choice ? t(`DESORDEM.Atributos.${choice}`) : t('DESORDEM.Efeito.AEscolha');
  }
  return t(`DESORDEM.Efeito.${CHOICE_GROUPS[key]}.${choice}`);
}

/**
 * Chaves de recurso já usadas (para a lista de sugestões dos campos de recurso).
 * @param {object[]} lists Listas de efeitos (a da habilidade e as do personagem).
 */
export function resourceKeys(...lists) {
  const keys = new Set();
  for (const entry of lists.flat()) {
    const { tipo, params } = entry;
    if (tipo === 'recurso' && params.chave) keys.add(params.chave);
    if (params?.recurso) keys.add(params.recurso);
    if (params?.custo?.recurso) keys.add(params.custo.recurso);
  }
  return [...keys].sort();
}
