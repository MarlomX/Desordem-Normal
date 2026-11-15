/**
 * Transforma o resultado de resolveTest em dados prontos para o template do chat.
 * Função pura (sem Foundry). A tradução dos textos acontece no template, via chaves de idioma.
 */

const OUTCOMES = {
  Sucesso: 'sucesso',
  Falha: 'falha',
  SucessoCritico: 'sucesso-critico',
  FalhaCritica: 'falha-critica',
};

function outcomeOf(result) {
  if (result.criticalFailure) return 'FalhaCritica';
  if (result.criticalSuccess) return 'SucessoCritico';
  return result.success ? 'Sucesso' : 'Falha';
}

/**
 * @param {ReturnType<import('./test.js').resolveTest>} result
 * @param {Object} [labels]
 * @param {string} [labels.label] Título da rolagem (padrão: "atributo + perícia").
 * @param {string} [labels.attrLabel] Nome do atributo, já traduzido.
 * @param {string} [labels.skillLabel] Nome da perícia, já traduzida.
 * @param {boolean} [labels.showDt=true] Falso em testes opostos: não há DT, então o cartão
 *   mostra apenas os críticos, sem "sucesso" ou "falha".
 * @param {{name: string, skillLabel: string, die: number}[]} [labels.helpers] Ajudas recebidas.
 */
export function buildChatContext(
  result,
  { label, attrLabel, skillLabel, showDt = true, helpers = [] } = {},
) {
  const outcome = outcomeOf(result);
  const neutral = !showDt && !result.criticalSuccess && !result.criticalFailure;

  // `direction` diz se o passo subiu ou desceu o dado (o cartão pinta a seta de azul ou vermelho)
  const adjustments = [];
  const { attribute, skill } = result.base;
  if (attribute.original !== attribute.final) {
    adjustments.push(stepAdjustment(attrLabel, attribute));
  }
  if (skill.original !== skill.final) {
    adjustments.push(stepAdjustment(skillLabel, skill));
  }

  // `critical` e `fumble` (dados em destaque no cartão) já vêm calculados por `resolveTest`,
  // que é quem decide o que é crítico
  const dice = result.dice.map(({ sides, value, counted, source, annulled, critical, fumble }) => ({
    sides,
    value,
    counted,
    source,
    annulled: Boolean(annulled),
    critical: Boolean(critical),
    fumble: Boolean(fumble),
  }));

  return {
    label: label ?? [attrLabel, skillLabel].filter(Boolean).join(' + '),
    dt: result.dt,
    showDt,
    helpers,
    hasHelpers: helpers.length > 0,
    modifier: result.modifier ?? 0,
    modifierLabel: (result.modifier ?? 0) > 0 ? `+${result.modifier}` : `${result.modifier ?? 0}`,
    total: result.total,
    highRoll: result.highRoll,
    lowRoll: result.lowRoll,
    success: result.success,
    criticalSuccess: result.criticalSuccess,
    criticalFailure: result.criticalFailure,
    outcomeKey: neutral ? null : `DESORDEM.Teste.${outcome}`,
    outcomeClass: neutral ? 'neutro' : OUTCOMES[outcome],
    dice,
    hasIgnored: dice.some((d) => !d.counted && !d.annulled),
    fear: result.fear ?? null,
    hasFear: Boolean(result.fear),
    devouredAll: Boolean(result.devouredAll),
    adjustments,
    discardedList: result.discardedExtras.map((sides) => `d${sides}`).join(', '),
  };
}

/** Ajuste de passo de um dado (atributo ou perícia): de qual dado para qual, e a direção. */
function stepAdjustment(name, { original, final }) {
  return { name, from: original, to: final, direction: final > original ? 'up' : 'down' };
}

/**
 * Dados do resumo de um teste oposto, a partir do retorno de `resolveOpposed`.
 * @param {ReturnType<import('./opposed.js').resolveOpposed>} outcome
 */
export function buildOpposedContext({ winner, margin, decidedBy }) {
  return {
    winner,
    isTie: winner === 'empate',
    winnerA: winner === 'a',
    winnerB: winner === 'b',
    margin,
    hasMargin: margin > 0,
    byCritical: decidedBy === 'critical',
  };
}

/**
 * Dados do resumo de um teste de lesão (chaves de idioma já montadas). Em falha, a tabela não é
 * rolada aqui: o cartão mostra o botão de rolá-la (veja `pending-table.js`).
 * @param {Object} opts
 * @param {'criticalSuccess'|'success'|'failure'|'criticalFailure'} opts.outcome
 * @param {string[]} [opts.effects] Chaves de efeito (veja `outcomeEffects`).
 * @param {boolean} [opts.nonLethal]
 * @param {number} opts.testNumber Número do teste na cena (1, 2, 3...).
 */
export function buildInjuryContext({ outcome, effects = [], nonLethal = false, testNumber }) {
  return {
    outcomeText: `DESORDEM.Lesao.Resultado.${outcome}`,
    outcomeClass: outcome === 'criticalFailure' ? 'falha-critica' : outcome,
    effects: effects.map((effect) => `DESORDEM.Lesao.Efeito.${effect}`),
    pending: outcome === 'failure',
    pendingButton: 'DESORDEM.Tabela.Botao.lesion',
    nonLethal,
    testNumber,
  };
}

/**
 * Dados do resumo de um teste de trauma (chaves de idioma já montadas). Em falha, o cartão mostra
 * o botão de rolar a tabela de traumas.
 * @param {Object} opts
 * @param {'success'|'failure'} opts.outcome
 * @param {number} opts.testNumber Número do teste na cena (1, 2, 3...).
 */
export function buildTraumaContext({ outcome, testNumber }) {
  return {
    outcomeText: `DESORDEM.Trauma.Resultado.${outcome}`,
    outcomeClass: outcome,
    effect: `DESORDEM.Trauma.Efeito.${outcome === 'success' ? 'semEfeito' : 'sofreTrauma'}`,
    pending: outcome === 'failure',
    pendingButton: 'DESORDEM.Tabela.Botao.trauma',
    testNumber,
  };
}

const TABLE_TEXT = {
  lesion: { label: 'Lesao', entries: 'Lesoes' },
  trauma: { label: 'Trauma', entries: 'Traumas' },
  disaster: { label: 'FalhaCritica', entries: 'FalhaCritica' },
};

const DISASTER_DETAIL = { hp: 'PerdeuPV', pd: 'PerdeuPD' };
const DISASTER_ZERO = { pv: 'AvisoLesao', pd: 'AvisoTrauma' };

/**
 * Dados do cartão de resultado de uma tabela de lesão, de trauma ou de efeito de falha crítica.
 * @param {Object} opts
 * @param {'lesion'|'trauma'|'disaster'} opts.kind
 * @param {{key: string, kind?: string}} opts.entry Entrada sorteada na tabela.
 * @param {number[]} [opts.rolls] Dados da tabela rolados (inclui repetições por lesão já possuída).
 * @param {number} [opts.testNumber] Número do teste na cena (lesão e trauma).
 * @param {boolean} [opts.nonLethal]
 * @param {number} [opts.amount] Pontos perdidos (efeitos de PV e PD).
 * @param {boolean} [opts.manual] O mestre escolheu o efeito em vez de rolar.
 * @param {'pv'|'pd'|null} [opts.reachedZero] Recurso que chegou a 0 (só efeitos de PV e PD).
 * @param {boolean} [opts.recoveredDying] A lesão tirou o personagem do estado moribundo.
 */
export function buildTableResultContext({
  kind,
  entry,
  rolls = [],
  testNumber = null,
  nonLethal = false,
  amount = 0,
  manual = false,
  reachedZero = null,
  recoveredDying = false,
}) {
  const text = TABLE_TEXT[kind];
  if (!text) throw new RangeError(`Tipo de tabela desconhecido: ${kind}`);
  const detail = kind === 'disaster' ? DISASTER_DETAIL[entry.kind] : undefined;
  return {
    titleKey: `DESORDEM.Tabela.Titulo.${kind}`,
    rollsLabelKey: `DESORDEM.${text.label}.RolagensTabela`,
    nameKey: `DESORDEM.${text.entries}.${entry.key}.Nome`,
    descriptionKey: `DESORDEM.${text.entries}.${entry.key}.Descricao`,
    rolls,
    hasRolls: rolls.length > 0,
    testNumber,
    nonLethal: kind === 'lesion' && nonLethal,
    manual,
    detailKey: detail ? `DESORDEM.FalhaCritica.${detail}` : null,
    amount,
    recoveredDying,
    zeroKey: reachedZero ? `DESORDEM.FalhaCritica.${DISASTER_ZERO[reachedZero]}` : null,
  };
}
