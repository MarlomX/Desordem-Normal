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
 */
export function buildChatContext(result, { label, attrLabel, skillLabel } = {}) {
  const outcome = outcomeOf(result);

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
    total: result.total,
    highRoll: result.highRoll,
    lowRoll: result.lowRoll,
    success: result.success,
    criticalSuccess: result.criticalSuccess,
    criticalFailure: result.criticalFailure,
    outcomeKey: `DESORDEM.Teste.${outcome}`,
    outcomeClass: OUTCOMES[outcome],
    dice,
    hasIgnored: dice.some((d) => !d.counted),
    adjustments,
    discardedList: result.discardedExtras.map((sides) => `d${sides}`).join(', '),
  };
}
