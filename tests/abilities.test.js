import test from 'node:test';
import assert from 'node:assert/strict';
import {
  IMPETO_MAX,
  hasAbility,
  addImpeto,
  impetoFillsOnFailure,
  opposedLoser,
  gainAnalysis,
  analysisCost,
  applyAnalysis,
  rerollCandidates,
  replaceDie,
  resolveWithValues,
  activeBoosts,
  sceneReset,
} from '../scripts/rolls/abilities.js';

const actorWith = (...keys) => ({
  items: {
    some: (fn) => keys.map((k) => ({ type: 'habilidade', system: { automacao: k } })).some(fn),
  },
});

test('hasAbility procura a automação entre as habilidades do personagem', () => {
  assert.equal(hasAbility(actorWith('impeto'), 'impeto'), true);
  assert.equal(hasAbility(actorWith('analise'), 'impeto'), false);
});

test('a barra de ímpeto enche sem passar do máximo', () => {
  assert.equal(addImpeto(0), 1);
  assert.equal(addImpeto(IMPETO_MAX), IMPETO_MAX);
  assert.equal(addImpeto(4, 3), IMPETO_MAX);
});

test('só testes com DT que falharam enchem o ímpeto; o perdedor do oposto também', () => {
  assert.equal(impetoFillsOnFailure({ success: false }), true);
  assert.equal(impetoFillsOnFailure({ success: true }), false);
  assert.equal(impetoFillsOnFailure({ success: false }, false), false);
  assert.equal(opposedLoser({ winner: 'a' }), 'b');
  assert.equal(opposedLoser({ winner: 'b' }), 'a');
  assert.equal(opposedLoser({ winner: 'empate' }), null);
});

test('analisar dá 2 marcadores, até 4', () => {
  assert.equal(gainAnalysis(0), 2);
  assert.equal(gainAnalysis(3), 4);
});

test('a análise pode usar vários pontos no mesmo dado (3 num d6 vira 6 com 3 pontos)', () => {
  const out = applyAnalysis({ values: [3, 5], sides: [6, 8], newValues: [6, 5], points: 3 });
  assert.deepEqual(out, { values: [6, 5], cost: 3 });
  assert.equal(analysisCost([3, 5], [4, 4]), 2);
});

test('a análise respeita o mínimo 1, o máximo do dado e os pontos disponíveis', () => {
  assert.throws(
    () => applyAnalysis({ values: [3], sides: [6], newValues: [0], points: 9 }),
    RangeError,
  );
  assert.throws(
    () => applyAnalysis({ values: [3], sides: [6], newValues: [7], points: 9 }),
    RangeError,
  );
  assert.throws(
    () => applyAnalysis({ values: [3], sides: [6], newValues: [6], points: 2 }),
    RangeError,
  );
  assert.throws(
    () => applyAnalysis({ values: [3], sides: [6], newValues: [3.5], points: 9 }),
    RangeError,
  );
  assert.throws(
    () => applyAnalysis({ values: [3, 4], sides: [6, 6], newValues: [3], points: 9 }),
    RangeError,
  );
});

test('rerollCandidates lista os dados do teste que não são 1 e ignora o dado de pavor', () => {
  assert.deepEqual(rerollCandidates([1, 4, 2, 5], [6, 8, 4]), [1, 2]);
  assert.deepEqual(rerollCandidates([1, 1], [6, 8]), []);
});

test('replaceDie troca um dado sem alterar a lista original', () => {
  const values = [2, 3];
  assert.deepEqual(replaceDie(values, 1, 6), [2, 6]);
  assert.deepEqual(values, [2, 3]);
});

test('resolveWithValues refaz o teste com os valores alterados (incluindo críticos)', () => {
  const plan = { attrDie: 6, skillDie: 6, dt: 12 };
  const before = resolveWithValues(plan, [3, 4]);
  assert.equal(before.total, 7);
  assert.equal(before.success, false);
  // análise: 3 -> 6 e 4 -> 6 dá dois 6 iguais, sucesso crítico
  const after = resolveWithValues(plan, [6, 6]);
  assert.equal(after.criticalSuccess, true);
  assert.equal(after.success, true);
  assert.equal(after.highSum, 12);
  // todos 1 viram falha crítica
  assert.equal(resolveWithValues(plan, [1, 1]).criticalFailure, true);
});

test('resolveWithValues mantém o dado de pavor por último', () => {
  const result = resolveWithValues({ attrDie: 6, skillDie: 6, fearDie: 6 }, [2, 5, 4]);
  assert.equal(result.fear.value, 4);
  assert.equal(result.total, 5);
});

test('activeBoosts: ímpeto dá +d4 por 1 espaço; a furtiva dá +d8 por 3 PD só em Crime e Furtividade', () => {
  assert.deepEqual(activeBoosts(['impetoDado'], { skillKey: 'luta', impeto: 2, pd: 0 }), {
    extraDice: [4],
    pdCost: 0,
    impetoCost: 1,
    used: ['impetoDado'],
  });
  assert.deepEqual(activeBoosts(['sorrateiro'], { skillKey: 'furtividade', impeto: 0, pd: 5 }), {
    extraDice: [8],
    pdCost: 3,
    impetoCost: 0,
    used: ['sorrateiro'],
  });
  assert.deepEqual(activeBoosts(['sorrateiro'], { skillKey: 'luta', impeto: 0, pd: 5 }).used, []);
  assert.deepEqual(activeBoosts(['sorrateiro'], { skillKey: 'crime', impeto: 0, pd: 2 }).used, []);
  assert.deepEqual(activeBoosts(['impetoDado'], { skillKey: 'luta', impeto: 0, pd: 9 }).used, []);
  const both = activeBoosts(['impetoDado', 'sorrateiro'], { skillKey: 'crime', impeto: 1, pd: 3 });
  assert.deepEqual(both.extraDice, [4, 8]);
});

test('sceneReset zera a cena, esvazia recursos e dá 1 PV a quem está com 0', () => {
  const changes = sceneReset({
    pv: 0,
    contusao: true,
    estupor: true,
    efeitos: [
      { nome: 'A', fimDeCena: true },
      { nome: 'B', fimDeCena: false },
    ],
    impetoInicial: false,
  });
  assert.equal(changes['system.pv.value'], 1);
  assert.equal(changes['system.estado.contusao'], false);
  assert.equal(changes['system.cena.testesLesao'], 0);
  assert.equal(changes['system.cena.testesTrauma'], 0);
  assert.deepEqual(changes['system.cena.curados'], []);
  assert.equal(changes['system.recursos.impeto'], 0);
  assert.equal(changes['system.recursos.analise'], 0);
  for (const key of ['fisico', 'mente', 'emocao', 'pericias']) {
    assert.equal(changes[`system.passos.${key}`], 0);
  }
  assert.deepEqual(changes['system.efeitos'], [{ nome: 'B', fimDeCena: false }]);
});

test('sceneReset mantém o PV de quem tem vida e dá 1 de ímpeto a quem tem ímpeto inicial', () => {
  const changes = sceneReset({
    pv: 7,
    contusao: false,
    estupor: false,
    efeitos: [],
    impetoInicial: true,
  });
  assert.equal(changes['system.pv.value'], 7);
  assert.equal(changes['system.recursos.impeto'], 1);
});
