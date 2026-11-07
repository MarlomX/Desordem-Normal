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

  const adjustments = [];
  const { attribute, skill } = result.base;
  if (attribute.original !== attribute.final) {
    adjustments.push({ name: attrLabel, from: attribute.original, to: attribute.final });
  }
  if (skill.original !== skill.final) {
    adjustments.push({ name: skillLabel, from: skill.original, to: skill.final });
  }

  const dice = result.dice.map(({ sides, value, counted, source }) => ({
    sides,
    value,
    counted,
    source,
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
    hasIgnored: dice.some((d) => !d.counted),
    adjustments,
    discardedList: result.discardedExtras.map((sides) => `d${sides}`).join(', '),
  };
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
 * Dados do resumo de um teste de lesão (chaves de idioma já montadas).
 * @param {Object} opts
 * @param {'criticalSuccess'|'success'|'failure'|'criticalFailure'} opts.outcome
 * @param {string[]} [opts.effects] Chaves de efeito (veja `outcomeEffects`).
 * @param {{key: string}|null} [opts.lesion] Lesão sorteada, se houver.
 * @param {number[]} [opts.lesionRolls] Todos os d20 rolados na tabela (inclui repetições).
 * @param {boolean} [opts.nonLethal]
 * @param {number} opts.testNumber Número do teste na cena (1, 2, 3...).
 */
export function buildInjuryContext({
  outcome,
  effects = [],
  lesion = null,
  lesionRolls = [],
  nonLethal = false,
  testNumber,
}) {
  return {
    outcomeText: `DESORDEM.Lesao.Resultado.${outcome}`,
    outcomeClass: outcome === 'criticalFailure' ? 'falha-critica' : outcome,
    effects: effects.map((effect) => `DESORDEM.Lesao.Efeito.${effect}`),
    lesion: lesion && {
      name: `DESORDEM.Lesoes.${lesion.key}.Nome`,
      description: `DESORDEM.Lesoes.${lesion.key}.Descricao`,
    },
    lesionRolls,
    hasLesionRolls: lesionRolls.length > 0,
    nonLethal,
    testNumber,
  };
}