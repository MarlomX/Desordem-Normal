import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTest } from '../scripts/rolls/test.js';
import {
  buildChatContext,
  buildOpposedContext,
  buildInjuryContext,
} from '../scripts/rolls/presenter.js';
import { fixedRng } from './helpers.js';

const run = (opts, values) => resolveTest({ ...opts, rng: fixedRng(values) });

test('resultados comuns viram sucesso e falha', () => {
  const ok = buildChatContext(run({ attrDie: 6, skillDie: 6 }, [4, 4]));
  assert.equal(ok.outcomeKey, 'DESORDEM.Teste.Sucesso');
  assert.equal(ok.outcomeClass, 'sucesso');

  const ruim = buildChatContext(run({ attrDie: 6, skillDie: 6 }, [2, 3]));
  assert.equal(ruim.outcomeKey, 'DESORDEM.Teste.Falha');
  assert.equal(ruim.outcomeClass, 'falha');
});

test('críticos têm chave e classe próprias', () => {
  const sucesso = buildChatContext(run({ attrDie: 8, skillDie: 8 }, [6, 6]));
  assert.equal(sucesso.outcomeKey, 'DESORDEM.Teste.SucessoCritico');
  assert.equal(sucesso.outcomeClass, 'sucesso-critico');

  const falha = buildChatContext(run({ attrDie: 6, skillDie: 6 }, [1, 1]));
  assert.equal(falha.outcomeKey, 'DESORDEM.Teste.FalhaCritica');
  assert.equal(falha.outcomeClass, 'falha-critica');
});

test('título padrão junta atributo e perícia; título explícito prevalece', () => {
  const r = run({ attrDie: 6, skillDie: 6 }, [3, 3]);
  assert.equal(
    buildChatContext(r, { attrLabel: 'Físico', skillLabel: 'Luta' }).label,
    'Físico + Luta',
  );
  assert.equal(buildChatContext(r, { label: 'Ataque' }).label, 'Ataque');
});

test('dados ignorados são marcados e listados na exibição', () => {
  const r = run({ attrDie: 6, skillDie: 8, extraDice: [6, 4] }, [2, 5, 6, 4]);
  const ctx = buildChatContext(r);
  assert.equal(ctx.hasIgnored, true);
  assert.deepEqual(
    ctx.dice.map((d) => d.counted),
    [false, true, true, true],
  );
  assert.equal(ctx.total, 15);
});

test('ajustes de passo aparecem só quando o dado mudou', () => {
  const r = run({ attrDie: 8, skillDie: 8, stepMods: [{ target: 'skill', steps: -1 }] }, [3, 3]);
  const ctx = buildChatContext(r, { attrLabel: 'Físico', skillLabel: 'Luta' });
  assert.deepEqual(ctx.adjustments, [{ name: 'Luta', from: 8, to: 6 }]);
});

test('dados extras descartados viram uma lista de texto', () => {
  const r = run({ attrDie: 6, skillDie: 6, extraDice: [6, 6, 8] }, [3, 3, 3, 3]);
  assert.equal(buildChatContext(r).discardedList, 'd8');
  const sem = run({ attrDie: 6, skillDie: 6 }, [3, 3]);
  assert.equal(buildChatContext(sem).discardedList, '');
});

test('sem DT (teste oposto) não há sucesso ou falha, só críticos', () => {
  const neutro = buildChatContext(run({ attrDie: 6, skillDie: 6 }, [2, 3]), { showDt: false });
  assert.equal(neutro.showDt, false);
  assert.equal(neutro.outcomeKey, null);
  assert.equal(neutro.outcomeClass, 'neutro');

  const critico = buildChatContext(run({ attrDie: 8, skillDie: 8 }, [6, 6]), { showDt: false });
  assert.equal(critico.outcomeKey, 'DESORDEM.Teste.SucessoCritico');
});

test('ajudas recebidas aparecem na exibição', () => {
  const r = run({ attrDie: 6, skillDie: 6 }, [3, 3]);
  const ctx = buildChatContext(r, { helpers: [{ name: 'Ana', skillLabel: 'Medicina', die: 8 }] });
  assert.equal(ctx.hasHelpers, true);
  assert.equal(ctx.helpers[0].name, 'Ana');
  assert.equal(buildChatContext(r).hasHelpers, false);
});

test('resumo do teste oposto indica vencedor, margem e crítico', () => {
  const vence = buildOpposedContext({ winner: 'b', margin: 4, decidedBy: 'total' });
  assert.equal(vence.winnerB, true);
  assert.equal(vence.winnerA, false);
  assert.equal(vence.hasMargin, true);
  assert.equal(vence.byCritical, false);

  const empate = buildOpposedContext({ winner: 'empate', margin: 0, decidedBy: 'empate' });
  assert.equal(empate.isTie, true);
  assert.equal(empate.hasMargin, false);
});

test('modificador fixo aparece com sinal', () => {
  const r = run({ attrDie: 6, skillDie: 6, modifier: -2 }, [3, 4]);
  assert.equal(buildChatContext(r).modifierLabel, '-2');
  const mais = run({ attrDie: 6, skillDie: 6, modifier: 1 }, [3, 4]);
  assert.equal(buildChatContext(mais).modifierLabel, '+1');
  assert.equal(buildChatContext(run({ attrDie: 6, skillDie: 6 }, [3, 4])).modifier, 0);
});

test('resumo do teste de lesão monta as chaves de idioma', () => {
  const ctx = buildInjuryContext({
    outcome: 'failure',
    effects: ['sofreLesao'],
    lesion: { key: 'semOlho' },
    lesionRolls: [11, 11, 14],
    testNumber: 2,
  });
  assert.equal(ctx.outcomeText, 'DESORDEM.Lesao.Resultado.failure');
  assert.deepEqual(ctx.effects, ['DESORDEM.Lesao.Efeito.sofreLesao']);
  assert.equal(ctx.lesion.name, 'DESORDEM.Lesoes.semOlho.Nome');
  assert.equal(ctx.hasLesionRolls, true);

  const semLesao = buildInjuryContext({ outcome: 'criticalFailure', testNumber: 1 });
  assert.equal(semLesao.lesion, null);
  assert.equal(semLesao.outcomeClass, 'falha-critica');
});